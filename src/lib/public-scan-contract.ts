export const PUBLIC_AUDIT_STATUSES = [
  "failed",
  "not-applicable",
  "passed",
] as const;

export const PUBLIC_AUDIT_CATEGORIES = [
  "content-structure",
  "search-visibility",
  "technical-health",
] as const;

export const PUBLIC_AUDIT_PRIORITIES = [
  "fix-now",
  "fix-soon",
  "improvement",
  "optional",
] as const;

export const PUBLIC_AUDIT_CONFIDENCES = ["high", "medium"] as const;

export const PUBLIC_AUDIT_EFFORTS = ["low", "medium", "high"] as const;

export type PublicAuditStatus = (typeof PUBLIC_AUDIT_STATUSES)[number];
export type PublicAuditCategory = (typeof PUBLIC_AUDIT_CATEGORIES)[number];
export type PublicAuditPriority = (typeof PUBLIC_AUDIT_PRIORITIES)[number];
export type PublicAuditConfidence = (typeof PUBLIC_AUDIT_CONFIDENCES)[number];
export type PublicAuditEffort = (typeof PUBLIC_AUDIT_EFFORTS)[number];

export const PUBLIC_HOMEPAGE_RULES = [
  { ruleId: "TECH-STATUS-001", category: "technical-health" },
  { ruleId: "TECH-HTTPS-001", category: "technical-health" },
  { ruleId: "SEARCH-ROBOTS-001", category: "search-visibility" },
  { ruleId: "TECH-REDIRECTS-001", category: "technical-health" },
  { ruleId: "SEARCH-TITLE-001", category: "search-visibility" },
  { ruleId: "SEARCH-DESCRIPTION-001", category: "search-visibility" },
  { ruleId: "SEARCH-CANONICAL-001", category: "search-visibility" },
  { ruleId: "CONTENT-HEADINGS-001", category: "content-structure" },
  { ruleId: "SEARCH-INDEXING-001", category: "search-visibility" },
] as const satisfies ReadonlyArray<
  Readonly<{
    ruleId: string;
    category: PublicAuditCategory;
  }>
>;

export type PublicHomepageRuleId =
  (typeof PUBLIC_HOMEPAGE_RULES)[number]["ruleId"];

export type PublicAuditEvidenceItem = Readonly<{
  label: string;
  value: string;
}>;

export type PublicHomepageFinding = Readonly<{
  affectedUrls: ReadonlyArray<string>;
  category: PublicAuditCategory;
  confidence: PublicAuditConfidence;
  dataLabel: "derived";
  effort: PublicAuditEffort;
  evidence: ReadonlyArray<PublicAuditEvidenceItem>;
  explanation: string;
  fix: string;
  impact: string;
  priority: PublicAuditPriority;
  ruleId: PublicHomepageRuleId;
  ruleVersion: "1.0.0";
  title: string;
  verify: string;
}>;

export type PublicHomepageCheck = Readonly<{
  category: PublicAuditCategory;
  evidence: ReadonlyArray<PublicAuditEvidenceItem>;
  finding: PublicHomepageFinding | null;
  ruleId: PublicHomepageRuleId;
  ruleVersion: "1.0.0";
  status: PublicAuditStatus;
  summary: string;
}>;

export type PublicHomepageReport = Readonly<{
  checks: ReadonlyArray<PublicHomepageCheck>;
  findings: ReadonlyArray<PublicHomepageFinding>;
  rulesetVersion: "homepage-v1";
  schemaVersion: 1;
}>;

export type PublicHomepageResult = Readonly<{
  completedAt: string;
  outcome: "fetched" | "blocked-by-robots";
  report: PublicHomepageReport;
  schemaVersion: 1;
}>;

export type PublicScanStatus = "completed" | "failed" | "queued" | "running";

export type PublicScanTarget = Readonly<{
  hostname: string;
  origin: string;
}>;

type PublicScanStatusRecordBase = Readonly<{
  queuedAt: string;
  scanId: string;
  target: PublicScanTarget;
}>;

export type PublicScanStatusRecord =
  | (PublicScanStatusRecordBase &
      Readonly<{
        result: PublicHomepageResult;
        status: "completed";
      }>)
  | (PublicScanStatusRecordBase &
      Readonly<{
        status: Exclude<PublicScanStatus, "completed">;
      }>);

export type PublicScanStatusEnvelope = Readonly<{
  data: PublicScanStatusRecord;
}>;
