import { describe, expect, it, vi } from "vitest";

import { auditHomepage } from "../audit/homepage/audit-homepage";
import {
  PUBLIC_HOMEPAGE_RULES,
  type PublicAuditCategory,
  type PublicAuditEvidenceItem,
  type PublicAuditStatus,
  type PublicHomepageFinding,
  type PublicHomepageRuleId,
} from "./public-scan-contract";
import {
  PUBLIC_SCAN_CLIENT_LIMITS,
  PublicScanClientContractError,
  decodeCreateScanEnvelope,
  decodePublicScanError,
  decodePublicScanStatusEnvelope,
  isPublicScanId,
  readBoundedJsonResponse,
  readSafeRetryAfterMilliseconds,
  samePublicScanIdentity,
  sortPublicFindings,
} from "./public-scan-client";

const scanId = "scan-11111111-1111-4111-8111-111111111111";
const target = {
  hostname: "example.com",
  origin: "https://example.com/",
};

function createEnvelope() {
  return {
    data: {
      scanId,
      status: "queued",
      statusUrl: "/api/scans/status",
      target,
    },
    message: "Your website health check is queued.",
  };
}

interface MutablePublicCheck {
  category: PublicAuditCategory;
  evidence: PublicAuditEvidenceItem[];
  finding: PublicHomepageFinding | null;
  ruleId: PublicHomepageRuleId;
  ruleVersion: string;
  status: PublicAuditStatus;
  summary: string;
}

interface MutablePublicReport {
  checks: MutablePublicCheck[];
  findings: PublicHomepageFinding[];
  rulesetVersion: string;
  schemaVersion: number;
}

function report(): MutablePublicReport {
  return {
    checks: PUBLIC_HOMEPAGE_RULES.map(({ category, ruleId }) => ({
      category,
      evidence: [],
      finding: null,
      ruleId,
      ruleVersion: "1.0.0",
      status: "passed",
      summary: `${ruleId} passed.`,
    })),
    findings: [],
    rulesetVersion: "homepage-v1",
    schemaVersion: 1,
  };
}

function queuedStatus() {
  return {
    data: {
      queuedAt: "2026-08-21T12:00:00.000Z",
      scanId,
      status: "queued",
      target,
    },
  };
}

function completedStatus() {
  return {
    data: {
      ...queuedStatus().data,
      result: {
        completedAt: "2026-08-21T12:01:00.000Z",
        outcome: "fetched",
        report: report(),
        schemaVersion: 1,
      },
      status: "completed",
    },
  };
}

function finding(
  ruleId: PublicHomepageRuleId,
  priority: PublicHomepageFinding["priority"],
): PublicHomepageFinding {
  const rule = PUBLIC_HOMEPAGE_RULES.find(
    (candidate) => candidate.ruleId === ruleId,
  );

  if (!rule) {
    throw new Error("Missing test rule.");
  }

  return {
    affectedUrls: ["https://example.com/"],
    category: rule.category,
    confidence: "high",
    dataLabel: "derived",
    effort: "low",
    evidence: [],
    explanation: "Trusted explanation.",
    fix: "Trusted fix.",
    impact: "Trusted impact.",
    priority,
    ruleId,
    ruleVersion: "1.0.0",
    title: "Trusted title",
    verify: "Trusted verification.",
  };
}

describe("public scan client contract", () => {
  it("accepts only lowercase UUIDv4 public scan IDs", () => {
    expect(isPublicScanId(scanId)).toBe(true);
    expect(isPublicScanId(scanId.toUpperCase())).toBe(false);
    expect(
      isPublicScanId("scan-11111111-1111-1111-8111-111111111111"),
    ).toBe(false);
    expect(
      isPublicScanId("scan-11111111-1111-4111-7111-111111111111"),
    ).toBe(false);
    expect(isPublicScanId(42)).toBe(false);
  });

  it("strictly decodes a queued create response", () => {
    expect(decodeCreateScanEnvelope(createEnvelope())).toEqual(createEnvelope());
  });

  it.each([
    {
      ...createEnvelope(),
      extra: true,
    },
    {
      ...createEnvelope(),
      data: { ...createEnvelope().data, extra: true },
    },
    {
      ...createEnvelope(),
      data: { ...createEnvelope().data, scanId: scanId.toUpperCase() },
    },
    {
      ...createEnvelope(),
      data: { ...createEnvelope().data, statusUrl: "https://attacker.example/" },
    },
    {
      ...createEnvelope(),
      data: { ...createEnvelope().data, statusUrl: `/api/scans/${scanId}` },
    },
    {
      ...createEnvelope(),
      data: {
        ...createEnvelope().data,
        target: { ...target, origin: "https://example.com/private" },
      },
    },
    {
      ...createEnvelope(),
      message: "A proxy-authored success message.",
    },
  ])("rejects a malformed create response without reflecting it", (value) => {
    expect(() => decodeCreateScanEnvelope(value)).toThrow(
      PublicScanClientContractError,
    );
  });

  it.each(["queued", "running", "failed"] as const)(
    "decodes the metadata-only %s status",
    (status) => {
      const value = queuedStatus();
      value.data.status = status;

      expect(decodePublicScanStatusEnvelope(value)).toEqual(value);
    },
  );

  it("decodes a completed homepage-v1 report", () => {
    expect(decodePublicScanStatusEnvelope(completedStatus())).toEqual(
      completedStatus(),
    );
  });

  it("accepts the real trusted homepage-v1 producer shape", () => {
    const base = completedStatus();
    const producerReport = auditHomepage({
      blockedAt: null,
      document: null,
      finalUrl: "https://example.com/",
      redirects: [],
      requestedUrl: "https://example.com/",
      robots: [{ origin: "https://example.com/", status: "found" }],
      statusCode: 200,
    });
    const value = {
      data: {
        ...base.data,
        result: { ...base.data.result, report: producerReport },
      },
    };

    expect(decodePublicScanStatusEnvelope(value)).toEqual(value);
  });

  it("requires failed-check findings to match the report finding list", () => {
    const value = completedStatus();
    const statusFinding = {
      ...finding("TECH-STATUS-001", "fix-now"),
      evidence: [
        { label: "Final URL", value: "https://example.com/" },
        { label: "HTTP status", value: "503" },
      ],
    };
    value.data.result.report.checks[0] = {
      ...value.data.result.report.checks[0],
      evidence: statusFinding.evidence,
      finding: statusFinding,
      status: "failed",
    };
    value.data.result.report.findings = [statusFinding];

    expect(decodePublicScanStatusEnvelope(value)).toEqual(value);

    value.data.result.report.findings = [
      { ...statusFinding, title: "Mismatched title" },
    ];
    expect(() => decodePublicScanStatusEnvelope(value)).toThrow(
      PublicScanClientContractError,
    );
  });

  it.each([
    { ...queuedStatus(), extra: true },
    { data: { ...queuedStatus().data, privateResult: "secret" } },
    { data: { ...queuedStatus().data, status: "retrying" } },
    { data: { ...queuedStatus().data, queuedAt: "August 21" } },
    {
      data: {
        ...queuedStatus().data,
        target: { hostname: "other.example", origin: "https://example.com/" },
      },
    },
    {
      data: {
        ...completedStatus().data,
        result: {
          ...completedStatus().data.result,
          completedAt: "2026-08-21T11:59:59.999Z",
        },
      },
    },
    {
      data: {
        ...completedStatus().data,
        result: {
          ...completedStatus().data.result,
          report: { ...report(), rulesetVersion: "homepage-v2" },
        },
      },
    },
    {
      data: {
        ...completedStatus().data,
        result: {
          ...completedStatus().data.result,
          report: {
            ...report(),
            checks: [...report().checks].reverse(),
          },
        },
      },
    },
  ])("fails closed for an invalid status shape", (value) => {
    expect(() => decodePublicScanStatusEnvelope(value)).toThrow(
      PublicScanClientContractError,
    );
  });

  it("bounds public evidence before returning it", () => {
    const value = completedStatus();
    value.data.result.report.checks[0] = {
      ...value.data.result.report.checks[0],
      evidence: [
        {
          label: "Final URL",
          value: "x".repeat(
            PUBLIC_SCAN_CLIENT_LIMITS.evidenceValueCodeUnits + 1,
          ),
        },
      ],
    };

    expect(() => decodePublicScanStatusEnvelope(value)).toThrow(
      PublicScanClientContractError,
    );
  });

  it("replaces every known wire error message with fixed client copy", () => {
    const decoded = decodePublicScanError({
      error: {
        code: "INVALID_TARGET",
        message: "<img src=x onerror=alert(1)> private-token",
      },
    });

    expect(decoded).toEqual({
      code: "INVALID_TARGET",
      message: "Enter a valid public website address.",
    });
    expect(JSON.stringify(decoded)).not.toContain("private-token");
    expect(JSON.stringify(decoded)).not.toContain("onerror");
  });

  it.each([
    { error: { code: "UNKNOWN", message: "unsafe" } },
    { error: { code: "INVALID_TARGET", message: "safe", private: true } },
    { error: { code: "INVALID_TARGET", message: "line\nbreak" } },
  ])("rejects an unknown or malformed error envelope", (value) => {
    expect(() => decodePublicScanError(value)).toThrow(
      PublicScanClientContractError,
    );
  });
});

describe("public scan client helpers", () => {
  it("compares the complete immutable scan identity", () => {
    const identity = queuedStatus().data;

    expect(samePublicScanIdentity(identity, { ...identity })).toBe(true);
    expect(
      samePublicScanIdentity(identity, {
        ...identity,
        queuedAt: "2026-08-21T12:00:00.001Z",
      }),
    ).toBe(false);
    expect(
      samePublicScanIdentity(identity, {
        ...identity,
        target: { ...identity.target, hostname: "other.example" },
      }),
    ).toBe(false);
  });

  it("sorts by priority and preserves homepage rule order within a priority", () => {
    const optional = finding("TECH-STATUS-001", "optional");
    const laterFixNow = finding("SEARCH-INDEXING-001", "fix-now");
    const earlierFixNow = finding("TECH-HTTPS-001", "fix-now");
    const input = [optional, laterFixNow, earlierFixNow];

    expect(sortPublicFindings(input)).toEqual([
      earlierFixNow,
      laterFixNow,
      optional,
    ]);
    expect(input).toEqual([optional, laterFixNow, earlierFixNow]);
  });

  it.each([
    [null, undefined, 5_000],
    ["30", undefined, 30_000],
    [" 2 ", undefined, 2_000],
    ["0", undefined, 1_000],
    ["999999999", undefined, 300_000],
    ["Wed, 21 Oct 2030 07:28:00 GMT", 12_000, 12_000],
    ["not-a-delay", -10, 1_000],
  ])(
    "turns Retry-After %j into the safe bounded delay %i",
    (header, fallback, expected) => {
      expect(readSafeRetryAfterMilliseconds(header, fallback)).toBe(expected);
    },
  );
});

describe("readBoundedJsonResponse", () => {
  const contentType = { "Content-Type": "application/json; charset=utf-8" };

  it("stream-counts and parses a valid bounded JSON response", async () => {
    const body = JSON.stringify(createEnvelope());
    const response = new Response(body, {
      headers: {
        ...contentType,
        "Content-Length": String(new TextEncoder().encode(body).byteLength),
      },
    });

    await expect(readBoundedJsonResponse(response)).resolves.toEqual(
      createEnvelope(),
    );
  });

  it("accepts a bounded response without Content-Length", async () => {
    const response = new Response(JSON.stringify(queuedStatus()), {
      headers: contentType,
    });

    await expect(readBoundedJsonResponse(response)).resolves.toEqual(
      queuedStatus(),
    );
  });

  it.each([
    [new Response(null, { headers: contentType }), 100],
    [new Response("", { headers: contentType }), 100],
    [new Response("not json", { headers: contentType }), 100],
    [
      new Response(new Uint8Array([0xff]), {
        headers: contentType,
      }),
      100,
    ],
    [
      new Response("{}", {
        headers: { "Content-Type": "text/html" },
      }),
      100,
    ],
    [
      new Response("{}", {
        headers: { ...contentType, "Content-Length": "not-a-number" },
      }),
      100,
    ],
  ])("rejects an absent or malformed response body", async (response, maxBytes) => {
    await expect(readBoundedJsonResponse(response, maxBytes)).rejects.toThrow(
      PublicScanClientContractError,
    );
  });

  it("rejects an oversized declared body before reading and cancels it", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        cancel,
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("{}"));
        },
      }),
      {
        headers: { ...contentType, "Content-Length": "101" },
      },
    );

    await expect(readBoundedJsonResponse(response, 100)).rejects.toThrow(
      PublicScanClientContractError,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a streamed body immediately when counted bytes exceed the ceiling", async () => {
    const cancel = vi.fn();
    let pull = 0;
    const response = new Response(
      new ReadableStream({
        cancel,
        pull(controller) {
          pull += 1;
          controller.enqueue(new Uint8Array(6));

          if (pull > 2) {
            controller.close();
          }
        },
      }),
      { headers: contentType },
    );

    await expect(readBoundedJsonResponse(response, 10)).rejects.toThrow(
      PublicScanClientContractError,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a caller ceiling above the reviewed hard maximum", async () => {
    const response = new Response("{}", { headers: contentType });

    await expect(
      readBoundedJsonResponse(
        response,
        PUBLIC_SCAN_CLIENT_LIMITS.jsonResponseBytes + 1,
      ),
    ).rejects.toThrow(PublicScanClientContractError);
  });
});
