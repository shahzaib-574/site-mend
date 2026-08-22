import { describe, expect, it } from "vitest";

import { HomepageEvidenceParser } from "./homepage-evidence-parser";
import { auditHomepage } from "./audit-homepage";
import type { HomepageAuditInput } from "./types";

function document(
  html = `
    <title>Example home</title>
    <meta name="description" content="A useful summary">
    <link rel="canonical" href="https://example.com/">
    <h1>Example</h1><h2>Details</h2>
  `,
  headers: Record<string, string | string[]> = {
    "content-type": "text/html; charset=utf-8",
  },
) {
  const parser = new HomepageEvidenceParser("https://example.com/", headers);
  parser.write(new TextEncoder().encode(html));
  return parser.finish();
}

function input(overrides: Partial<HomepageAuditInput> = {}): HomepageAuditInput {
  return {
    blockedAt: null,
    document: document(),
    finalUrl: "https://example.com/",
    redirects: [],
    requestedUrl: "https://example.com/",
    robots: [{ origin: "https://example.com/", status: "not-found" }],
    statusCode: 200,
    ...overrides,
  };
}

function check(report: ReturnType<typeof auditHomepage>, ruleId: string) {
  return report.checks.find((candidate) => candidate.ruleId === ruleId)!;
}

describe("auditHomepage", () => {
  it("returns nine versioned passing checks for a healthy homepage", () => {
    const report = auditHomepage(input());

    expect(report).toMatchObject({
      rulesetVersion: "homepage-v1",
      schemaVersion: 1,
    });
    expect(report.checks).toHaveLength(9);
    expect(report.checks.every((candidate) => candidate.status === "passed")).toBe(
      true,
    );
    expect(report.findings).toEqual([]);
    expect(new Set(report.checks.map((candidate) => candidate.ruleId)).size).toBe(9);
    expect(report.checks.every((candidate) => candidate.ruleVersion === "1.0.0")).toBe(
      true,
    );
  });

  it("reports only the robots failure when the homepage is blocked", () => {
    const report = auditHomepage(
      input({
        blockedAt: "https://example.com/",
        document: null,
        finalUrl: null,
        robots: [{ origin: "https://example.com/", status: "found" }],
        statusCode: null,
      }),
    );

    expect(check(report, "SEARCH-ROBOTS-001")).toMatchObject({
      finding: { priority: "fix-now" },
      status: "failed",
    });
    expect(report.findings).toHaveLength(1);
    expect(report.checks.filter((candidate) => candidate.status === "not-applicable"))
      .toHaveLength(8);
    expect(report.findings[0]?.explanation).toContain("SiteMendBot");
    expect(report.findings[0]?.impact).toContain("does not by itself prove");
  });

  it("raises reproducible high-priority status, HTTPS, and noindex findings", () => {
    const noindex = document(undefined, {
      "content-type": "text/html",
      "x-robots-tag": "googlebot: noindex",
    });
    const transportReport = auditHomepage(
      input({
        document: null,
        finalUrl: "http://example.com/",
        statusCode: 503,
      }),
    );
    const indexingReport = auditHomepage(input({ document: noindex }));

    expect(check(transportReport, "TECH-STATUS-001")).toMatchObject({
      finding: { priority: "fix-now" },
      status: "failed",
    });
    expect(check(transportReport, "TECH-HTTPS-001")).toMatchObject({
      finding: { priority: "fix-now" },
      status: "failed",
    });
    expect(check(indexingReport, "SEARCH-INDEXING-001")).toMatchObject({
      evidence: expect.arrayContaining([
        { label: "Source 1", value: "x-robots-tag: noindex" },
      ]),
      finding: { priority: "fix-now" },
      status: "failed",
    });

    for (const finding of [
      ...transportReport.findings,
      ...indexingReport.findings,
    ]) {
      expect(finding).toEqual(
        expect.objectContaining({
          affectedUrls: expect.any(Array),
          confidence: expect.any(String),
          dataLabel: "derived",
          effort: expect.any(String),
          evidence: expect.any(Array),
          explanation: expect.any(String),
          fix: expect.any(String),
          impact: expect.any(String),
          verify: expect.any(String),
        }),
      );
    }
  });

  it("distinguishes redirect chains from a single temporary redirect", () => {
    const temporary = auditHomepage(
      input({
        redirects: [
          {
            from: "https://example.com/",
            statusCode: 302,
            to: "https://example.com/home",
          },
        ],
      }),
    );
    const chain = auditHomepage(
      input({
        redirects: [
          {
            from: "http://example.com/",
            statusCode: 301,
            to: "https://example.com/",
          },
          {
            from: "https://example.com/",
            statusCode: 308,
            to: "https://www.example.com/",
          },
        ],
      }),
    );

    expect(check(temporary, "TECH-REDIRECTS-001").finding).toMatchObject({
      confidence: "medium",
      priority: "improvement",
    });
    expect(check(chain, "TECH-REDIRECTS-001").finding).toMatchObject({
      priority: "fix-soon",
    });
  });

  it("reports missing metadata without inventing length thresholds", () => {
    const longButPresent = auditHomepage(
      input({
        document: document(`
          <title>${"T".repeat(250)}</title>
          <meta name="description" content="${"D".repeat(450)}">
          <link rel="canonical" href="https://example.com/">
          <h1>Example</h1>
        `),
      }),
    );
    const missing = auditHomepage(
      input({ document: document("<h2>Only a subheading</h2>") }),
    );

    expect(check(longButPresent, "SEARCH-TITLE-001").status).toBe("passed");
    expect(check(longButPresent, "SEARCH-DESCRIPTION-001").status).toBe("passed");
    expect(check(missing, "SEARCH-TITLE-001").finding).toMatchObject({
      priority: "fix-soon",
    });
    expect(check(missing, "SEARCH-DESCRIPTION-001").finding).toMatchObject({
      priority: "improvement",
    });
    expect(check(missing, "SEARCH-CANONICAL-001").finding).toMatchObject({
      priority: "optional",
    });
    expect(check(missing, "CONTENT-HEADINGS-001").finding).toMatchObject({
      priority: "fix-soon",
    });
  });

  it("treats multiple or invalid canonicals more strongly than a missing one", () => {
    const report = auditHomepage(
      input({
        document: document(`
          <title>Example</title><meta name="description" content="Summary">
          <link rel="canonical" href="javascript:invalid">
          <link rel="canonical" href="https://other.example/">
          <h1>Example</h1>
        `),
      }),
    );

    expect(check(report, "SEARCH-CANONICAL-001")).toMatchObject({
      finding: { priority: "fix-soon" },
      status: "failed",
    });
  });

  it("does not accept an empty H1 as the page's main heading", () => {
    const report = auditHomepage(
      input({
        document: document(`
          <title>Example</title><meta name="description" content="Summary">
          <link rel="canonical" href="https://example.com/">
          <h1>   </h1><h2>Details</h2>
        `),
      }),
    );

    expect(check(report, "CONTENT-HEADINGS-001")).toMatchObject({
      finding: { priority: "fix-soon" },
      status: "failed",
    });
  });
});
