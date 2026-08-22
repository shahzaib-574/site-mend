import type { RedirectEvidence } from "../../worker/crawler/url-evidence";

export const HOMEPAGE_AUDIT_RULESET_VERSION = "homepage-v1" as const;

export type HomepageRuleId =
  | "CONTENT-HEADINGS-001"
  | "SEARCH-CANONICAL-001"
  | "SEARCH-DESCRIPTION-001"
  | "SEARCH-INDEXING-001"
  | "SEARCH-ROBOTS-001"
  | "SEARCH-TITLE-001"
  | "TECH-HTTPS-001"
  | "TECH-REDIRECTS-001"
  | "TECH-STATUS-001";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type IndexDirective = "follow" | "index" | "nofollow" | "noindex";

export interface BoundedTextEvidence {
  length: number;
  text: string;
  truncated: boolean;
}

export interface TextElementEvidence {
  count: number;
  emptyCount: number;
  first: BoundedTextEvidence | null;
}

export interface CanonicalEntryEvidence {
  matchesPage: boolean;
  url: string | null;
  valid: boolean;
}

export interface CanonicalEvidence {
  count: number;
  entries: ReadonlyArray<CanonicalEntryEvidence>;
  entriesTruncated: boolean;
}

export interface HeadingEntryEvidence extends BoundedTextEvidence {
  level: HeadingLevel;
}

export interface HeadingEvidence {
  counts: Readonly<Record<`h${HeadingLevel}`, number>>;
  emptyCount: number;
  entries: ReadonlyArray<HeadingEntryEvidence>;
  entriesTruncated: boolean;
  nonEmptyCounts: Readonly<Record<`h${HeadingLevel}`, number>>;
  skippedLevelCount: number;
}

export interface IndexDirectiveSourceEvidence {
  directives: ReadonlyArray<IndexDirective>;
  source: "meta-googlebot" | "meta-robots" | "x-robots-tag";
}

export interface IndexingDirectiveEvidence {
  effectiveFollow: "allowed" | "blocked" | "conflicting";
  effectiveIndex: "allowed" | "blocked" | "conflicting";
  sources: ReadonlyArray<IndexDirectiveSourceEvidence>;
  sourcesTruncated: boolean;
  totalSources: number;
}

export interface HomepageDocumentEvidence {
  canonical: CanonicalEvidence;
  characterEncoding: string;
  characterEncodingSource: "default" | "fallback" | "http-header";
  description: TextElementEvidence;
  headings: HeadingEvidence;
  indexing: IndexingDirectiveEvidence;
  schemaVersion: 1;
  title: TextElementEvidence;
}

export interface HomepageAuditInput {
  blockedAt: string | null;
  document: HomepageDocumentEvidence | null;
  finalUrl: string | null;
  redirects: ReadonlyArray<RedirectEvidence>;
  requestedUrl: string;
  robots: ReadonlyArray<{
    origin: string;
    status: "found" | "not-found";
  }>;
  statusCode: number | null;
}

export type AuditCategory =
  | "content-structure"
  | "search-visibility"
  | "technical-health";
export type AuditPriority =
  | "fix-now"
  | "fix-soon"
  | "improvement"
  | "optional";
export type AuditConfidence = "high" | "medium";
export type AuditEffort = "low" | "medium" | "high";

export interface AuditEvidenceItem {
  label: string;
  value: string;
}

export interface HomepageAuditFinding {
  affectedUrls: ReadonlyArray<string>;
  category: AuditCategory;
  confidence: AuditConfidence;
  dataLabel: "derived";
  effort: AuditEffort;
  evidence: ReadonlyArray<AuditEvidenceItem>;
  explanation: string;
  fix: string;
  impact: string;
  priority: AuditPriority;
  ruleId: HomepageRuleId;
  ruleVersion: "1.0.0";
  title: string;
  verify: string;
}

export interface HomepageAuditCheck {
  category: AuditCategory;
  evidence: ReadonlyArray<AuditEvidenceItem>;
  finding: HomepageAuditFinding | null;
  ruleId: HomepageRuleId;
  ruleVersion: "1.0.0";
  status: "failed" | "not-applicable" | "passed";
  summary: string;
}

export interface HomepageAuditReport {
  checks: ReadonlyArray<HomepageAuditCheck>;
  findings: ReadonlyArray<HomepageAuditFinding>;
  rulesetVersion: typeof HOMEPAGE_AUDIT_RULESET_VERSION;
  schemaVersion: 1;
}
