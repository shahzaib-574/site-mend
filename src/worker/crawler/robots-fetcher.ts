import {
  admitRedirectTarget,
  admitScanTarget,
  type AdmittedScanTarget,
} from "../../server/scan-admission";
import { abortable, CRAWL_LIMITS, type CrawlBudget } from "./crawl-budget";
import { CrawlerError } from "./errors";
import type { PinnedHttpClient } from "./pinned-http-client";
import {
  readBoundedBody,
  readLocationHeader,
  requireMediaType,
} from "./response-body";
import { parseRobotsPolicy, type RobotsPolicy } from "./robots-policy";
import {
  isRedirectStatus,
  toEvidenceUrl,
  type RedirectEvidence,
} from "./url-evidence";

export interface RobotsEvidence {
  bytes?: number;
  finalUrl: string;
  origin: string;
  redirects: ReadonlyArray<RedirectEvidence>;
  sha256?: string;
  status: "found" | "not-found";
}

export interface RobotsResult {
  evidence: RobotsEvidence;
  policy: RobotsPolicy;
}

export interface RobotsFetcherDependencies {
  admitInitial?: typeof admitScanTarget;
  admitRedirect?: typeof admitRedirectTarget;
  http: PinnedHttpClient;
}

export class RobotsFetcher {
  private readonly admitInitial: typeof admitScanTarget;
  private readonly admitRedirect: typeof admitRedirectTarget;

  constructor(private readonly dependencies: RobotsFetcherDependencies) {
    this.admitInitial = dependencies.admitInitial ?? admitScanTarget;
    this.admitRedirect = dependencies.admitRedirect ?? admitRedirectTarget;
  }

  async fetch(
    origin: string,
    budget: CrawlBudget,
    signal: AbortSignal,
  ): Promise<RobotsResult> {
    const admittedOrigin = await abortable(this.admitInitial(origin), signal);
    let target: AdmittedScanTarget = {
      ...admittedOrigin,
      url: new URL("/robots.txt", admittedOrigin.origin).toString(),
    };
    const redirects: RedirectEvidence[] = [];
    const visited = new Set([target.url]);

    while (true) {
      budget.useRequest();
      const response = await this.dependencies.http.get(target, {
        accept: "text/plain",
        maxResponseBytes: CRAWL_LIMITS.robotsBytes,
        signal,
      });

      try {
        if (isRedirectStatus(response.statusCode)) {
          budget.useRedirect();
          const location = readLocationHeader(response.headers);
          const nextTarget = await abortable(
            this.admitRedirect(location, target),
            signal,
          );

          if (visited.has(nextTarget.url)) {
            throw new CrawlerError(
              "INVALID_REDIRECT",
              "The robots policy entered a redirect loop.",
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

        if (response.statusCode === 404 || response.statusCode === 410) {
          return {
            evidence: {
              finalUrl: toEvidenceUrl(target.url),
              origin,
              redirects,
              status: "not-found",
            },
            policy: parseRobotsPolicy(""),
          };
        }

        if (response.statusCode === 204) {
          return {
            evidence: {
              bytes: 0,
              finalUrl: toEvidenceUrl(target.url),
              origin,
              redirects,
              sha256:
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
              status: "found",
            },
            policy: parseRobotsPolicy(""),
          };
        }

        if (response.statusCode !== 200) {
          throw new CrawlerError(
            "ROBOTS_UNAVAILABLE",
            "The website's robots policy could not be checked safely.",
          );
        }

        requireMediaType(response, ["text/plain"]);
        const body = await readBoundedBody(response, {
          capture: true,
          maxBytes: CRAWL_LIMITS.robotsBytes,
          signal,
        });
        let text: string;

        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(body.captured);
        } catch (error) {
          throw new CrawlerError(
            "ROBOTS_UNAVAILABLE",
            "The website's robots policy was not valid UTF-8.",
            { cause: error },
          );
        }

        const policy = parseRobotsPolicy(text);

        return {
          evidence: {
            bytes: body.bytes,
            finalUrl: toEvidenceUrl(target.url),
            origin,
            redirects,
            sha256: body.sha256,
            status: "found",
          },
          policy,
        };
      } finally {
        await response.dispose();
      }
    }
  }
}
