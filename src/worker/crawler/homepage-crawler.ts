import {
  admitRedirectTarget,
  admitScanTarget,
} from "../../server/scan-admission";
import type { ScanJobPayload } from "../../server/scan-jobs/scan-queue";
import { auditHomepage } from "../../audit/homepage/audit-homepage";
import { HomepageEvidenceParser } from "../../audit/homepage/homepage-evidence-parser";
import type {
  HomepageAuditReport,
  HomepageDocumentEvidence,
} from "../../audit/homepage/types";
import {
  abortable,
  CRAWL_LIMITS,
  CrawlBudget,
  createCrawlSignal,
} from "./crawl-budget";
import { CrawlerError } from "./errors";
import {
  SITE_MEND_ROBOTS_TOKEN,
  UndiciPinnedHttpClient,
  type PinnedHttpClient,
} from "./pinned-http-client";
import {
  readBoundedBody,
  readLocationHeader,
  readMediaType,
  requireMediaType,
} from "./response-body";
import {
  RobotsFetcher,
  type RobotsEvidence,
  type RobotsResult,
} from "./robots-fetcher";
import {
  isRedirectStatus,
  toEvidenceUrl,
  type RedirectEvidence,
} from "./url-evidence";

interface HomepageBodyEvidence {
  bytes: number;
  contentType: string;
  document: HomepageDocumentEvidence;
  sha256: string;
}

export interface FetchedHomepageEvidence {
  body: HomepageBodyEvidence | null;
  finalUrl: string;
  redirects: ReadonlyArray<RedirectEvidence>;
  requestedUrl: string;
  statusCode: number;
}

interface CrawlResultBase {
  audit: HomepageAuditReport;
  completedAt: string;
  robots: ReadonlyArray<RobotsEvidence>;
  scanId: string;
  schemaVersion: 2;
}

export type HomepageCrawlResult =
  | (CrawlResultBase & {
      blockedAt: string;
      homepage: null;
      outcome: "blocked-by-robots";
    })
  | (CrawlResultBase & {
      homepage: FetchedHomepageEvidence;
      outcome: "fetched";
    });

export interface HomepageCrawlerDependencies {
  admitInitial?: typeof admitScanTarget;
  admitRedirect?: typeof admitRedirectTarget;
  clock?: () => Date;
  http?: PinnedHttpClient;
}

export class HomepageCrawler {
  private readonly admitInitial: typeof admitScanTarget;
  private readonly admitRedirect: typeof admitRedirectTarget;
  private readonly clock: () => Date;
  private readonly http: PinnedHttpClient;
  private readonly robotsFetcher: RobotsFetcher;

  constructor(dependencies: HomepageCrawlerDependencies = {}) {
    this.admitInitial = dependencies.admitInitial ?? admitScanTarget;
    this.admitRedirect = dependencies.admitRedirect ?? admitRedirectTarget;
    this.clock = dependencies.clock ?? (() => new Date());
    this.http = dependencies.http ?? new UndiciPinnedHttpClient();
    this.robotsFetcher = new RobotsFetcher({
      admitInitial: this.admitInitial,
      admitRedirect: this.admitRedirect,
      http: this.http,
    });
  }

  async crawl(
    payload: ScanJobPayload,
    parentSignal?: AbortSignal,
  ): Promise<HomepageCrawlResult> {
    const crawlSignal = createCrawlSignal(parentSignal);
    const { signal } = crawlSignal;
    const budget = new CrawlBudget();
    const robotsByOrigin = new Map<string, RobotsResult>();
    const robotsEvidence: RobotsEvidence[] = [];

    try {
      let target = await abortable(
        this.admitInitial(payload.target.origin),
        signal,
      );
      const requestedUrl = toEvidenceUrl(target.url);
      const redirects: RedirectEvidence[] = [];
      const visited = new Set([target.url]);

      while (true) {
        let robots = robotsByOrigin.get(target.origin);

        if (!robots) {
          robots = await this.robotsFetcher.fetch(
            target.origin,
            budget,
            signal,
          );
          robotsByOrigin.set(target.origin, robots);
          robotsEvidence.push(robots.evidence);
        }

        if (!robots.policy.isAllowed(target.url, SITE_MEND_ROBOTS_TOKEN)) {
          const blockedAt = toEvidenceUrl(target.url);

          return {
            audit: auditHomepage({
              blockedAt,
              document: null,
              finalUrl: null,
              redirects,
              requestedUrl,
              robots: robotsEvidence,
              statusCode: null,
            }),
            blockedAt,
            completedAt: this.clock().toISOString(),
            homepage: null,
            outcome: "blocked-by-robots",
            robots: robotsEvidence,
            scanId: payload.scanId,
            schemaVersion: 2,
          };
        }

        // Re-resolve after the robots request so DNS admission is fresh at the
        // moment the page connection is created.
        target = await abortable(
          this.admitRedirect(target.url, target),
          signal,
        );
        budget.useRequest();
        const response = await this.http.get(target, {
          accept: "text/html, application/xhtml+xml;q=0.9",
          maxResponseBytes: CRAWL_LIMITS.homepageBytes,
          signal,
        });

        try {
          if (isRedirectStatus(response.statusCode)) {
            budget.useRedirect();
            const nextTarget = await abortable(
              this.admitRedirect(readLocationHeader(response.headers), target),
              signal,
            );

            if (visited.has(nextTarget.url)) {
              throw new CrawlerError(
                "INVALID_REDIRECT",
                "The homepage entered a redirect loop.",
              );
            }

            redirects.push({
              from: toEvidenceUrl(target.url),
              statusCode: response.statusCode,
              to: toEvidenceUrl(nextTarget.url),
            });
            visited.add(nextTarget.url);
            target = nextTarget;
            continue;
          }

          let body: HomepageBodyEvidence | null = null;

          if (response.statusCode === 206) {
            throw new CrawlerError(
              "FETCH_FAILED",
              "The homepage returned an unexpected partial response.",
            );
          }

          if (
            response.statusCode >= 200 &&
            response.statusCode < 300 &&
            response.statusCode !== 204 &&
            response.statusCode !== 205
          ) {
            const contentType = requireMediaType(response, [
              "application/xhtml+xml",
              "text/html",
            ]);
            const parser = new HomepageEvidenceParser(target.url, response.headers);
            const evidence = await readBoundedBody(response, {
              capture: false,
              maxBytes: CRAWL_LIMITS.homepageBytes,
              onChunk: (chunk) => parser.write(chunk),
              signal,
            });
            body = {
              bytes: evidence.bytes,
              contentType,
              document: parser.finish(),
              sha256: evidence.sha256,
            };
          } else {
            readMediaType(response.headers);
          }

          const homepage: FetchedHomepageEvidence = {
            body,
            finalUrl: toEvidenceUrl(target.url),
            redirects,
            requestedUrl,
            statusCode: response.statusCode,
          };

          return {
            audit: auditHomepage({
              blockedAt: null,
              document: body?.document ?? null,
              finalUrl: homepage.finalUrl,
              redirects,
              requestedUrl,
              robots: robotsEvidence,
              statusCode: response.statusCode,
            }),
            completedAt: this.clock().toISOString(),
            homepage,
            outcome: "fetched",
            robots: robotsEvidence,
            scanId: payload.scanId,
            schemaVersion: 2,
          };
        } finally {
          await response.dispose();
        }
      }
    } finally {
      crawlSignal.dispose();
    }
  }
}
