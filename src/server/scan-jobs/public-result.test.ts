import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { auditHomepage } from "@/audit/homepage/audit-homepage";
import { HomepageEvidenceParser } from "@/audit/homepage/homepage-evidence-parser";
import type { HomepageAuditInput } from "@/audit/homepage/types";
import { decodePublicScanStatusEnvelope } from "@/lib/public-scan-client";
import type { HomepageCrawlResult } from "@/worker/crawler/homepage-crawler";
import type { RedirectEvidence } from "@/worker/crawler/url-evidence";

import { projectPublicHomepageResult } from "./public-result";

const scanId = "scan-11111111-1111-4111-8111-111111111111";
const completedAt = "2026-08-21T12:01:00.000Z";
const requestedUrl = "https://example.com/";
const expectation = { requestedUrl, scanId } as const;

function parseDocument(html: string, pageUrl = requestedUrl) {
  const parser = new HomepageEvidenceParser(pageUrl, {});
  parser.write(Buffer.from(html));
  return parser.finish();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function notFoundRobots(origin = requestedUrl) {
  return {
    finalUrl: new URL("/robots.txt", origin).toString(),
    origin,
    redirects: [],
    status: "not-found" as const,
  };
}

function foundRobots(origin = requestedUrl) {
  return {
    bytes: 0,
    finalUrl: new URL("/robots.txt", origin).toString(),
    origin,
    redirects: [],
    sha256: sha256(""),
    status: "found" as const,
  };
}

function createFetchedResult(
  options: {
    finalUrl?: string;
    html?: string;
    redirects?: ReadonlyArray<RedirectEvidence>;
    robots?: ReadonlyArray<ReturnType<typeof notFoundRobots>>;
  } = {},
): HomepageCrawlResult {
  const html =
    options.html ??
    "<html><head><title>SiteMend</title><meta name=description content='A clear homepage'><link rel=canonical href='https://example.com/'></head><body><h1>Website health</h1></body></html>";
  const finalUrl = options.finalUrl ?? requestedUrl;
  const redirects = options.redirects ?? [];
  const robots = options.robots ?? [notFoundRobots()];
  const document = parseDocument(html, finalUrl);
  const input: HomepageAuditInput = {
    blockedAt: null,
    document,
    finalUrl,
    redirects,
    requestedUrl,
    robots: robots.map(({ origin, status }) => ({ origin, status })),
    statusCode: 200,
  };

  return {
    audit: auditHomepage(input),
    completedAt,
    homepage: {
      body: {
        bytes: Buffer.byteLength(html),
        contentType: "text/html",
        document,
        sha256: sha256(html),
      },
      finalUrl,
      redirects,
      requestedUrl,
      statusCode: 200,
    },
    outcome: "fetched",
    robots,
    scanId,
    schemaVersion: 2,
  } satisfies HomepageCrawlResult;
}

function createBlockedResult(): HomepageCrawlResult {
  const blockedAt = requestedUrl;
  const robots = [foundRobots()];
  const input: HomepageAuditInput = {
    blockedAt,
    document: null,
    finalUrl: null,
    redirects: [],
    requestedUrl,
    robots: robots.map(({ origin, status }) => ({ origin, status })),
    statusCode: null,
  };

  return {
    audit: auditHomepage(input),
    blockedAt,
    completedAt,
    homepage: null,
    outcome: "blocked-by-robots",
    robots,
    scanId,
    schemaVersion: 2,
  } satisfies HomepageCrawlResult;
}

function replaceAuditCheck(
  raw: HomepageCrawlResult,
  index: number,
  update: Record<string, unknown>,
) {
  return {
    ...raw,
    audit: {
      ...raw.audit,
      checks: raw.audit.checks.map((check, checkIndex) =>
        checkIndex === index ? { ...check, ...update } : check,
      ),
    },
  };
}

describe("projectPublicHomepageResult", () => {
  it("round-trips fetched and robots-blocked projections through the browser decoder", () => {
    for (const raw of [createFetchedResult(), createBlockedResult()]) {
      const result = projectPublicHomepageResult(raw, expectation);
      const envelope = decodePublicScanStatusEnvelope({
        data: {
          queuedAt: "2026-08-21T12:00:00.000Z",
          result,
          scanId,
          status: "completed",
          target: { hostname: "example.com", origin: requestedUrl },
        },
      });

      expect(envelope.data).toMatchObject({
        result: { outcome: result.outcome },
        scanId,
        status: "completed",
      });
    }
  });

  it("recomputes the report and returns only the exact public envelope", () => {
    const html =
      "<html><head><title>Visit https://example.com/?ref=home &lt;html&gt;private&lt;/html&gt;</title><meta name=description content='Authorization: Bearer private-token'><link rel=canonical href='https://example.com/'></head><body><h1>Website health</h1></body></html>";
    const raw = createFetchedResult({ html });
    const projected = projectPublicHomepageResult(raw, expectation);

    expect(Object.keys(projected).sort()).toEqual([
      "completedAt",
      "outcome",
      "report",
      "schemaVersion",
    ]);
    expect(projected).toMatchObject({
      completedAt,
      outcome: "fetched",
      report: { rulesetVersion: "homepage-v1", schemaVersion: 1 },
      schemaVersion: 1,
    });
    expect(projected.report.checks).toHaveLength(9);
    expect(projected.report).not.toBe(raw.audit);

    const json = JSON.stringify(projected);
    expect(json).not.toContain("private-token");
    expect(json).not.toContain("?ref=home");
    expect(json).not.toContain("<html>private</html>");
    expect(json).not.toContain("First title");
    expect(json).not.toContain("First description");
    expect(json).not.toContain('"scope"');
    expect(json).not.toContain('"homepage"');
    expect(json).not.toContain('"robots"');
  });

  it("projects a real robots-blocked worker result", () => {
    const raw = createBlockedResult();
    const projected = projectPublicHomepageResult(raw, expectation);

    expect(projected).toMatchObject({
      completedAt,
      outcome: "blocked-by-robots",
      schemaVersion: 1,
    });
    expect(projected.report.findings).toHaveLength(1);
    expect(projected.report.findings[0]?.ruleId).toBe("SEARCH-ROBOTS-001");
    expect(projected.report.checks.filter((check) => check.status === "not-applicable"))
      .toHaveLength(8);
  });

  it.each([
    null,
    undefined,
    { ...createFetchedResult(), schemaVersion: 3 },
    {
      ...createFetchedResult(),
      scanId: "scan-22222222-2222-4222-8222-222222222222",
    },
    { ...createFetchedResult(), completedAt: "not-a-timestamp" },
    { ...createFetchedResult(), outcome: "rendered" },
    { ...createFetchedResult(), unexpected: "must not pass" },
    { ...createFetchedResult(), homepage: null },
    { ...createBlockedResult(), homepage: {} },
    { ...createBlockedResult(), blockedAt: "https://example.com/?secret=1" },
    { ...createFetchedResult(), robots: [] },
    {
      ...createFetchedResult(),
      robots: Array.from({ length: 7 }, () => notFoundRobots()),
    },
  ])("rejects an invalid outer worker result", (value) => {
    expect(() => projectPublicHomepageResult(value, expectation)).toThrow(
      "invalid completed result data",
    );
  });

  it("rejects queue-owned narrative, finding, and report-shape tampering", () => {
    const raw = createFetchedResult();
    const first = raw.audit.checks[0]!;
    const values = [
      replaceAuditCheck(raw, 0, {
        summary: "<html>Authorization: Bearer redis-secret</html>",
      }),
      replaceAuditCheck(raw, 0, {
        finding: {
          affectedUrls: [requestedUrl],
          category: first.category,
          confidence: "high",
          dataLabel: "derived",
          effort: "low",
          evidence: first.evidence,
          explanation: "redis://user:secret@private-host",
          fix: "Expose the header",
          impact: "Secret",
          priority: "fix-now",
          ruleId: first.ruleId,
          ruleVersion: "1.0.0",
          title: "Injected",
          verify: "Injected",
        },
        status: "failed",
      }),
      {
        ...raw,
        audit: { ...raw.audit, checks: raw.audit.checks.slice(1) },
      },
      {
        ...raw,
        audit: {
          ...raw.audit,
          checks: [{ ...first, internal: "private" }, ...raw.audit.checks.slice(1)],
        },
      },
    ];

    for (const value of values) {
      expect(() => projectPublicHomepageResult(value, expectation)).toThrow(
        "invalid completed result data",
      );
    }
  });

  it("rejects duplicate and unknown rules plus oversized report strings", () => {
    const raw = createFetchedResult();
    const first = raw.audit.checks[0]!;
    const second = raw.audit.checks[1]!;
    const values = [
      {
        ...raw,
        audit: {
          ...raw.audit,
          checks: raw.audit.checks.map((check, index) =>
            index === 1
              ? { ...second, category: first.category, ruleId: first.ruleId }
              : check,
          ),
        },
      },
      replaceAuditCheck(raw, 0, { ruleId: "TECH-UNKNOWN-999" }),
      replaceAuditCheck(raw, 0, { summary: "x".repeat(10_000) }),
    ];

    for (const value of values) {
      expect(() => projectPublicHomepageResult(value, expectation)).toThrow(
        "invalid completed result data",
      );
    }
  });

  it("rejects a report that contradicts the crawl outcome", () => {
    const blocked = createBlockedResult();
    const fetched = createFetchedResult();
    const contradictory = { ...blocked, audit: fetched.audit };

    expect(() =>
      projectPublicHomepageResult(contradictory, expectation),
    ).toThrow("invalid completed result data");
  });

  it("rejects unexpected or unbounded private transport evidence", () => {
    const raw = createFetchedResult();
    const fetchedHomepage = raw.homepage!;
    const values = [
      {
        ...raw,
        homepage: { ...fetchedHomepage, rawHtml: "<html>private</html>" },
      },
      {
        ...raw,
        homepage: {
          ...fetchedHomepage,
          body: { ...fetchedHomepage.body!, responseHeaders: { authorization: "secret" } },
        },
      },
      {
        ...raw,
        robots: [{ ...raw.robots[0]!, rawBody: "private robots content" }],
      },
      {
        ...raw,
        homepage: {
          ...fetchedHomepage,
          body: { ...fetchedHomepage.body!, bytes: 2 * 1_024 * 1_024 + 1 },
        },
      },
      {
        ...raw,
        homepage: {
          ...fetchedHomepage,
          body: {
            ...fetchedHomepage.body!,
            bytes: 0,
            sha256: sha256(""),
          },
        },
      },
    ];

    for (const value of values) {
      expect(() => projectPublicHomepageResult(value, expectation)).toThrow(
        "invalid completed result data",
      );
    }
  });

  it("rejects internal, credentialed, and query-bearing crawl URLs", () => {
    const raw = createFetchedResult();
    const homepage = raw.homepage!;
    const internalUrl = "http://169.254.169.254/latest/meta-data/";
    const values = [
      { ...raw, homepage: { ...homepage, finalUrl: internalUrl } },
      { ...raw, homepage: { ...homepage, requestedUrl: "http://localhost/" } },
      {
        ...raw,
        homepage: { ...homepage, finalUrl: "https://example.com/?secret=1" },
      },
      {
        ...raw,
        robots: [{ ...raw.robots[0]!, origin: "http://metadata.google.internal/" }],
      },
      {
        ...createBlockedResult(),
        blockedAt: "https://user:password@example.com/private",
      },
    ];

    for (const value of values) {
      expect(() => projectPublicHomepageResult(value, expectation)).toThrow(
        "invalid completed result data",
      );
    }
  });

  it("redacts a page-authored non-public canonical without failing the scan", () => {
    const raw = createFetchedResult({
      html: "<html><head><title>Safe</title><meta name=description content='Safe summary'><link rel=canonical href='http://169.254.169.254/latest/meta-data/'></head><body><h1>Safe</h1></body></html>",
    });
    const projected = projectPublicHomepageResult(raw, expectation);
    const json = JSON.stringify(projected);

    expect(json).not.toContain("169.254.169.254");
    expect(json).toContain("Non-public canonical target withheld.");
    expect(projected.report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "SEARCH-CANONICAL-001" }),
      ]),
    );
  });

  it("accepts producer-bounded Unicode page text and keeps it private", () => {
    const title = "😀".repeat(300);
    const raw = createFetchedResult({
      html: `<html><head><title>${title}</title><meta name=description content='Safe'><link rel=canonical href='https://example.com/'></head><body><h1>Safe</h1></body></html>`,
    });
    const projected = projectPublicHomepageResult(raw, expectation);

    expect(JSON.stringify(projected)).not.toContain("😀");
    expect(
      projected.report.checks.find(
        (check) => check.ruleId === "SEARCH-TITLE-001",
      )?.evidence,
    ).toContainEqual({ label: "Title length", value: "300" });
  });

  it("accepts a producer-truncated title ending at a normalized space", () => {
    const title = `${"a".repeat(299)} b`;
    const raw = createFetchedResult({
      html: `<html><head><title>${title}</title><meta name=description content='Safe'><link rel=canonical href='https://example.com/'></head><body><h1>Safe</h1></body></html>`,
    });

    expect(raw.homepage?.body?.document.title.first).toEqual({
      length: 301,
      text: `${"a".repeat(299)} `,
      truncated: true,
    });
    expect(projectPublicHomepageResult(raw, expectation)).toMatchObject({
      outcome: "fetched",
      schemaVersion: 1,
    });
  });

  it("rejects oversized private page text before report comparison", () => {
    const raw = createFetchedResult();

    if (raw.outcome !== "fetched" || !raw.homepage.body) {
      throw new Error("Expected a fetched test fixture.");
    }

    const value = {
      ...raw,
      homepage: {
        ...raw.homepage,
        body: {
          ...raw.homepage.body,
          document: {
            ...raw.homepage.body.document,
            title: {
              count: 1,
              emptyCount: 0,
              first: {
                length: 1_000_000,
                text: "x".repeat(1_000_000),
                truncated: true,
              },
            },
          },
        },
      },
    };

    expect(() => projectPublicHomepageResult(value, expectation)).toThrow(
      "invalid completed result data",
    );
  });

  it("accepts maximum percent-expanded canonicals and withholds every long URL", () => {
    const canonical = `https://canonical.example/${"€".repeat(2_000)}`;
    const canonicalTags = Array.from(
      { length: 10 },
      () => `<link rel=canonical href='${canonical}'>`,
    ).join("");
    const raw = createFetchedResult({
      html: `<html><head><title>Safe</title><meta name=description content='Safe'>${canonicalTags}</head><body><h1>Safe</h1></body></html>`,
    });

    expect(raw.homepage?.body?.document.canonical.entries).toHaveLength(10);
    expect(
      raw.homepage?.body?.document.canonical.entries.every(
        (entry) => (entry.url?.length ?? 0) > 4_096,
      ),
    ).toBe(true);

    const projected = projectPublicHomepageResult(raw, expectation);
    const json = JSON.stringify(projected);

    expect(json).not.toContain("%E2%82%AC");
    expect(
      projected.report.checks
        .find((check) => check.ruleId === "SEARCH-CANONICAL-001")
        ?.evidence.filter(
          (item) => item.value === "Non-public canonical target withheld.",
        ),
    ).toHaveLength(10);
    expect(new TextEncoder().encode(json).byteLength).toBeLessThan(256 * 1_024);
  });

  it("rejects an impossible effective directive state after evidence truncation", () => {
    const directives = Array.from(
      { length: 21 },
      () => "<meta name=robots content=noindex>",
    ).join("");
    const raw = createFetchedResult({
      html: `<html><head><title>Safe</title><meta name=description content='Safe'><link rel=canonical href='https://example.com/'>${directives}</head><body><h1>Safe</h1></body></html>`,
    });

    if (raw.outcome !== "fetched" || !raw.homepage.body) {
      throw new Error("Expected a fetched test fixture.");
    }

    const document = {
      ...raw.homepage.body.document,
      indexing: {
        ...raw.homepage.body.document.indexing,
        effectiveIndex: "allowed" as const,
      },
    };
    const input: HomepageAuditInput = {
      blockedAt: null,
      document,
      finalUrl: raw.homepage.finalUrl,
      redirects: raw.homepage.redirects,
      requestedUrl: raw.homepage.requestedUrl,
      robots: raw.robots.map(({ origin, status }) => ({ origin, status })),
      statusCode: raw.homepage.statusCode,
    };
    const forged = {
      ...raw,
      audit: auditHomepage(input),
      homepage: {
        ...raw.homepage,
        body: { ...raw.homepage.body, document },
      },
    };

    expect(raw.homepage.body.document.indexing).toMatchObject({
      effectiveIndex: "blocked",
      sourcesTruncated: true,
      totalSources: 21,
    });
    expect(() => projectPublicHomepageResult(forged, expectation)).toThrow(
      "invalid completed result data",
    );
  });

  it("rejects attacker-wide audit objects through the generic bounded path", () => {
    const raw = createFetchedResult();
    const wideAudit = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [
        `unexpected-${index}`,
        "private",
      ]),
    );

    expect(() =>
      projectPublicHomepageResult({ ...raw, audit: wideAudit }, expectation),
    ).toThrowError(new Error("The scan queue returned invalid completed result data."));
  });

  it("rejects blocked evidence whose minimum route exceeds the crawl budget", () => {
    const blockedAt = "https://example.com/private";
    const redirectTargets = Array.from(
      { length: 5 },
      (_, index) => `https://example.com/robots-${index}.txt`,
    );
    const robotsRedirects: RedirectEvidence[] = redirectTargets.map(
      (to, index) => ({
        from:
          index === 0
            ? "https://example.com/robots.txt"
            : redirectTargets[index - 1]!,
        statusCode: 301,
        to,
      }),
    );
    const robots = [
      {
        ...foundRobots(),
        finalUrl: redirectTargets.at(-1)!,
        redirects: robotsRedirects,
      },
    ];
    const input: HomepageAuditInput = {
      blockedAt,
      document: null,
      finalUrl: null,
      redirects: [],
      requestedUrl,
      robots: [{ origin: requestedUrl, status: "found" }],
      statusCode: null,
    };
    const raw = {
      audit: auditHomepage(input),
      blockedAt,
      completedAt,
      homepage: null,
      outcome: "blocked-by-robots",
      robots,
      scanId,
      schemaVersion: 2,
    };

    expect(() => projectPublicHomepageResult(raw, expectation)).toThrow(
      "invalid completed result data",
    );
  });

  it("rejects impossible body/status and broken redirect evidence", () => {
    const raw = createFetchedResult();
    const homepage = raw.homepage!;
    const redirected = createFetchedResult({
      finalUrl: "https://example.com/final",
      redirects: [
        {
          from: requestedUrl,
          statusCode: 301,
          to: "https://example.com/final",
        },
      ],
    });
    const values = [
      { ...raw, homepage: { ...homepage, body: null } },
      { ...raw, homepage: { ...homepage, statusCode: 204 } },
      {
        ...redirected,
        homepage: {
          ...redirected.homepage!,
          redirects: [
            {
              from: "https://example.com/not-the-start",
              statusCode: 301,
              to: "https://example.com/final",
            },
          ],
        },
      },
    ];

    for (const value of values) {
      expect(() => projectPublicHomepageResult(value, expectation)).toThrow(
        "invalid completed result data",
      );
    }
  });

  it("accepts a maximum-sized producer-shaped report under the public ceiling", () => {
    function longUrl(hostname: string, marker: string): string {
      const prefix = `https://${hostname}/`;
      return `${prefix}${marker}${"a".repeat(2_048 - prefix.length - marker.length)}`;
    }

    const redirectTargets = Array.from({ length: 5 }, (_, index) =>
      longUrl("example.com", String(index)),
    );
    const redirects: RedirectEvidence[] = redirectTargets.map((to, index) => ({
      from: index === 0 ? requestedUrl : redirectTargets[index - 1]!,
      statusCode: 301,
      to,
    }));
    const canonicalTags = Array.from({ length: 10 }, (_, index) => {
      const url = longUrl("canonical.example.com", String(index));
      return `<link rel=canonical href="${url}">`;
    }).join("");
    const raw = createFetchedResult({
      finalUrl: redirectTargets.at(-1),
      html: `<html><head>${canonicalTags}</head><body></body></html>`,
      redirects,
    });
    const projected = projectPublicHomepageResult(raw, expectation);
    const bytes = new TextEncoder().encode(JSON.stringify(projected)).byteLength;

    expect(bytes).toBeGreaterThan(128 * 1_024);
    expect(bytes).toBeLessThanOrEqual(256 * 1_024);
  });
});
