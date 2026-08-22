import {
  PUBLIC_AUDIT_CATEGORIES,
  PUBLIC_AUDIT_CONFIDENCES,
  PUBLIC_AUDIT_EFFORTS,
  PUBLIC_AUDIT_PRIORITIES,
  PUBLIC_AUDIT_STATUSES,
  PUBLIC_HOMEPAGE_RULES,
  type PublicAuditCategory,
  type PublicAuditConfidence,
  type PublicAuditEffort,
  type PublicAuditEvidenceItem,
  type PublicAuditPriority,
  type PublicAuditStatus,
  type PublicHomepageCheck,
  type PublicHomepageFinding,
  type PublicHomepageReport,
  type PublicHomepageResult,
  type PublicHomepageRuleId,
  type PublicScanStatus,
  type PublicScanStatusEnvelope,
  type PublicScanTarget,
} from "./public-scan-contract";
import { normalizeWebsiteUrl } from "./website-url";

export const PUBLIC_SCAN_CLIENT_LIMITS = {
  affectedUrls: 6,
  errorTextCodeUnits: 512,
  evidenceItems: 24,
  evidenceLabelCodeUnits: 2_048,
  evidenceValueCodeUnits: 20_576,
  jsonResponseBytes: 300 * 1_024,
  jsonResponseChunks: 4_096,
  pollDelayMilliseconds: 5_000,
  retryAfterMaximumMilliseconds: 5 * 60_000,
  retryAfterMinimumMilliseconds: 1_000,
  trustedTextCodeUnits: 2_048,
  urlCodeUnits: 2_048,
} as const;

const CREATE_MESSAGE = "Your website health check is queued.";
const CONTRACT_ERROR_MESSAGE = "The scan response was invalid.";
const RULE_VERSION = "1.0.0";
const RULESET_VERSION = "homepage-v1";
export const PUBLIC_SCAN_STATUS_PATH = "/api/scans/status";
const scanIdPattern =
  /^scan-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const PUBLIC_SCAN_ERROR_CODES = [
  "DNS_LOOKUP_FAILED",
  "DNS_LOOKUP_TIMEOUT",
  "INVALID_DNS_ANSWER",
  "INVALID_REQUEST",
  "INVALID_TARGET",
  "NON_PUBLIC_ADDRESS",
  "NO_DNS_ANSWERS",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "SCANNING_UNAVAILABLE",
  "SCAN_NOT_FOUND",
  "TOO_MANY_DNS_ANSWERS",
  "UNSUPPORTED_MEDIA_TYPE",
] as const;

export type PublicScanErrorCode = (typeof PUBLIC_SCAN_ERROR_CODES)[number];

const safeErrorMessages = {
  DNS_LOOKUP_FAILED: "SiteMend could not safely verify that website.",
  DNS_LOOKUP_TIMEOUT: "SiteMend could not safely verify that website in time.",
  INVALID_DNS_ANSWER: "SiteMend could not safely verify that website.",
  INVALID_REQUEST: "The scan request was invalid.",
  INVALID_TARGET: "Enter a valid public website address.",
  NON_PUBLIC_ADDRESS: "SiteMend can only scan websites on the public internet.",
  NO_DNS_ANSWERS: "SiteMend could not find that website.",
  PAYLOAD_TOO_LARGE: "The scan request was too large.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  SCANNING_UNAVAILABLE:
    "Website scanning is temporarily unavailable. Try again soon.",
  SCAN_NOT_FOUND: "That scan was not found or is no longer available.",
  TOO_MANY_DNS_ANSWERS: "SiteMend could not safely verify that website.",
  UNSUPPORTED_MEDIA_TYPE: "The scan request format was not supported.",
} as const satisfies Readonly<Record<PublicScanErrorCode, string>>;

export type PublicScanClientError = Readonly<{
  code: PublicScanErrorCode;
  message: (typeof safeErrorMessages)[PublicScanErrorCode];
}>;

export type PublicCreateScanRecord = Readonly<{
  scanId: string;
  status: "queued";
  statusUrl: string;
  target: PublicScanTarget;
}>;

export type PublicCreateScanEnvelope = Readonly<{
  data: PublicCreateScanRecord;
  message: typeof CREATE_MESSAGE;
}>;

export type PublicScanIdentity = Readonly<{
  queuedAt: string;
  scanId: string;
  target: PublicScanTarget;
}>;

export class PublicScanClientContractError extends Error {
  constructor() {
    super(CONTRACT_ERROR_MESSAGE);
    this.name = "PublicScanClientContractError";
  }
}

function invalidContract(): never {
  throw new PublicScanClientContractError();
}

function protectDecode<T>(decode: () => T): T {
  try {
    return decode();
  } catch (error) {
    if (error instanceof PublicScanClientContractError) {
      throw error;
    }

    return invalidContract();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactRecord(
  value: unknown,
  expectedKeys: ReadonlyArray<string>,
): Record<string, unknown> {
  if (!isRecord(value)) {
    return invalidContract();
  }

  const expected = new Set(expectedKeys);
  let actualCount = 0;

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    actualCount += 1;

    if (actualCount > expected.size || !expected.has(key)) {
      return invalidContract();
    }
  }

  if (actualCount !== expected.size) {
    return invalidContract();
  }

  return value;
}

function requireArray(
  value: unknown,
  minimum: number,
  maximum: number,
): ReadonlyArray<unknown> {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return invalidContract();
  }

  return value;
}

function requireText(
  value: unknown,
  maximumCodeUnits: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > maximumCodeUnits ||
    (!allowEmpty && value.length === 0) ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    return invalidContract();
  }

  return value;
}

function requireEnum<const T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
): T {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !allowed.includes(value as T)
  ) {
    return invalidContract();
  }

  return value as T;
}

function requireIsoTimestamp(value: unknown): string {
  const timestamp = requireText(value, 32);

  try {
    if (new Date(timestamp).toISOString() !== timestamp) {
      return invalidContract();
    }
  } catch {
    return invalidContract();
  }

  return timestamp;
}

export function isPublicScanId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === "scan-00000000-0000-4000-8000-000000000000".length &&
    scanIdPattern.test(value)
  );
}

function requireScanId(value: unknown): string {
  return isPublicScanId(value) ? value : invalidContract();
}

function requirePublicTarget(value: unknown): PublicScanTarget {
  const target = requireExactRecord(value, ["hostname", "origin"]);
  const hostname = requireText(target.hostname, PUBLIC_SCAN_CLIENT_LIMITS.urlCodeUnits);
  const origin = requireText(target.origin, PUBLIC_SCAN_CLIENT_LIMITS.urlCodeUnits);
  const normalized = normalizeWebsiteUrl(origin);

  if (
    !normalized.ok ||
    normalized.hostname !== hostname ||
    normalized.url !== origin
  ) {
    return invalidContract();
  }

  return { hostname, origin };
}

function requirePublicCrawlerUrl(value: unknown): string {
  const text = requireText(value, PUBLIC_SCAN_CLIENT_LIMITS.urlCodeUnits);
  let url: URL;

  try {
    url = new URL(text);
  } catch {
    return invalidContract();
  }

  const normalized = normalizeWebsiteUrl(text);

  if (
    !normalized.ok ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    `${url.origin}${url.pathname}` !== text
  ) {
    return invalidContract();
  }

  return text;
}

const fixedEvidenceLabels = {
  "CONTENT-HEADINGS-001": new Set([
    "Empty headings",
    "H1 headings",
    "H2-H6 headings",
    "Non-empty H1 headings",
    "Skipped levels",
  ]),
  "SEARCH-CANONICAL-001": new Set(["Canonical elements"]),
  "SEARCH-DESCRIPTION-001": new Set([
    "Description length",
    "Empty descriptions",
    "Meta descriptions",
  ]),
  "SEARCH-INDEXING-001": new Set([
    "Directive sources",
    "Indexing",
    "Link following",
  ]),
  "SEARCH-ROBOTS-001": new Set(["Blocked URL"]),
  "SEARCH-TITLE-001": new Set([
    "Empty title elements",
    "Title elements",
    "Title length",
  ]),
  "TECH-HTTPS-001": new Set(["Final URL"]),
  "TECH-REDIRECTS-001": new Set(["Redirect hops"]),
  "TECH-STATUS-001": new Set(["Final URL", "HTTP status"]),
} as const satisfies Readonly<Record<PublicHomepageRuleId, ReadonlySet<string>>>;

function requireEvidenceLabel(
  ruleId: PublicHomepageRuleId,
  value: unknown,
): string {
  const label = requireText(
    value,
    PUBLIC_SCAN_CLIENT_LIMITS.evidenceLabelCodeUnits,
  );

  if (fixedEvidenceLabels[ruleId].has(label)) {
    return label;
  }

  switch (ruleId) {
    case "SEARCH-CANONICAL-001":
      return /^Canonical (?:[1-9]|10)$/u.test(label)
        ? label
        : invalidContract();
    case "SEARCH-INDEXING-001":
      return /^Source (?:[1-9]|1[0-9]|20)$/u.test(label)
        ? label
        : invalidContract();
    case "SEARCH-ROBOTS-001": {
      const origin = requirePublicCrawlerUrl(label);
      return new URL(origin).pathname === "/" ? label : invalidContract();
    }
    case "TECH-REDIRECTS-001":
      return /^Hop [1-5]$/u.test(label) ? label : invalidContract();
    default:
      return invalidContract();
  }
}

function requireEvidence(
  value: unknown,
  ruleId: PublicHomepageRuleId,
): ReadonlyArray<PublicAuditEvidenceItem> {
  const rawItems = requireArray(
    value,
    0,
    PUBLIC_SCAN_CLIENT_LIMITS.evidenceItems,
  );
  const labels = new Set<string>();

  return rawItems.map((rawItem) => {
    const item = requireExactRecord(rawItem, ["label", "value"]);
    const label = requireEvidenceLabel(ruleId, item.label);

    if (labels.has(label)) {
      return invalidContract();
    }

    labels.add(label);

    return {
      label,
      value: requireText(
        item.value,
        PUBLIC_SCAN_CLIENT_LIMITS.evidenceValueCodeUnits,
      ),
    };
  });
}

const ruleCategories = Object.fromEntries(
  PUBLIC_HOMEPAGE_RULES.map(({ category, ruleId }) => [ruleId, category]),
) as Readonly<Record<PublicHomepageRuleId, PublicAuditCategory>>;
const ruleIndexes = Object.fromEntries(
  PUBLIC_HOMEPAGE_RULES.map(({ ruleId }, index) => [ruleId, index]),
) as Readonly<Record<PublicHomepageRuleId, number>>;
const priorityIndexes = Object.fromEntries(
  PUBLIC_AUDIT_PRIORITIES.map((priority, index) => [priority, index]),
) as Readonly<Record<PublicAuditPriority, number>>;

function requireRuleId(value: unknown): PublicHomepageRuleId {
  return requireEnum(
    value,
    PUBLIC_HOMEPAGE_RULES.map(({ ruleId }) => ruleId),
  );
}

function requireFinding(
  value: unknown,
  expectedRuleId: PublicHomepageRuleId,
): PublicHomepageFinding {
  const finding = requireExactRecord(value, [
    "affectedUrls",
    "category",
    "confidence",
    "dataLabel",
    "effort",
    "evidence",
    "explanation",
    "fix",
    "impact",
    "priority",
    "ruleId",
    "ruleVersion",
    "title",
    "verify",
  ]);
  const ruleId = requireRuleId(finding.ruleId);
  const category = requireEnum(finding.category, PUBLIC_AUDIT_CATEGORIES);

  if (ruleId !== expectedRuleId || category !== ruleCategories[ruleId]) {
    return invalidContract();
  }

  const affectedUrls = requireArray(
    finding.affectedUrls,
    1,
    PUBLIC_SCAN_CLIENT_LIMITS.affectedUrls,
  ).map(requirePublicCrawlerUrl);

  if (new Set(affectedUrls).size !== affectedUrls.length) {
    return invalidContract();
  }

  return {
    affectedUrls,
    category,
    confidence: requireEnum(
      finding.confidence,
      PUBLIC_AUDIT_CONFIDENCES,
    ) as PublicAuditConfidence,
    dataLabel: requireEnum(finding.dataLabel, ["derived"] as const),
    effort: requireEnum(finding.effort, PUBLIC_AUDIT_EFFORTS) as PublicAuditEffort,
    evidence: requireEvidence(finding.evidence, ruleId),
    explanation: requireText(
      finding.explanation,
      PUBLIC_SCAN_CLIENT_LIMITS.trustedTextCodeUnits,
    ),
    fix: requireText(
      finding.fix,
      PUBLIC_SCAN_CLIENT_LIMITS.trustedTextCodeUnits,
    ),
    impact: requireText(
      finding.impact,
      PUBLIC_SCAN_CLIENT_LIMITS.trustedTextCodeUnits,
    ),
    priority: requireEnum(
      finding.priority,
      PUBLIC_AUDIT_PRIORITIES,
    ) as PublicAuditPriority,
    ruleId,
    ruleVersion: requireEnum(finding.ruleVersion, [RULE_VERSION] as const),
    title: requireText(
      finding.title,
      PUBLIC_SCAN_CLIENT_LIMITS.trustedTextCodeUnits,
    ),
    verify: requireText(
      finding.verify,
      PUBLIC_SCAN_CLIENT_LIMITS.trustedTextCodeUnits,
    ),
  };
}

function sameEvidence(
  left: ReadonlyArray<PublicAuditEvidenceItem>,
  right: ReadonlyArray<PublicAuditEvidenceItem>,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.label === right[index]?.label && item.value === right[index]?.value,
    )
  );
}

function sameFinding(
  left: PublicHomepageFinding,
  right: PublicHomepageFinding,
): boolean {
  return (
    left.category === right.category &&
    left.confidence === right.confidence &&
    left.dataLabel === right.dataLabel &&
    left.effort === right.effort &&
    left.explanation === right.explanation &&
    left.fix === right.fix &&
    left.impact === right.impact &&
    left.priority === right.priority &&
    left.ruleId === right.ruleId &&
    left.ruleVersion === right.ruleVersion &&
    left.title === right.title &&
    left.verify === right.verify &&
    left.affectedUrls.length === right.affectedUrls.length &&
    left.affectedUrls.every((url, index) => url === right.affectedUrls[index]) &&
    sameEvidence(left.evidence, right.evidence)
  );
}

function requireCheck(
  value: unknown,
  expectedRuleId: PublicHomepageRuleId,
): PublicHomepageCheck {
  const check = requireExactRecord(value, [
    "category",
    "evidence",
    "finding",
    "ruleId",
    "ruleVersion",
    "status",
    "summary",
  ]);
  const ruleId = requireRuleId(check.ruleId);
  const category = requireEnum(check.category, PUBLIC_AUDIT_CATEGORIES);
  const status = requireEnum(check.status, PUBLIC_AUDIT_STATUSES);

  if (ruleId !== expectedRuleId || category !== ruleCategories[ruleId]) {
    return invalidContract();
  }

  const evidence = requireEvidence(check.evidence, ruleId);
  let finding: PublicHomepageFinding | null = null;

  if (status === "failed") {
    finding = requireFinding(check.finding, ruleId);

    if (!sameEvidence(evidence, finding.evidence)) {
      return invalidContract();
    }
  } else if (check.finding !== null) {
    return invalidContract();
  }

  return {
    category,
    evidence,
    finding,
    ruleId,
    ruleVersion: requireEnum(check.ruleVersion, [RULE_VERSION] as const),
    status: status as PublicAuditStatus,
    summary: requireText(
      check.summary,
      PUBLIC_SCAN_CLIENT_LIMITS.trustedTextCodeUnits,
    ),
  };
}

function requireReport(value: unknown): PublicHomepageReport {
  const report = requireExactRecord(value, [
    "checks",
    "findings",
    "rulesetVersion",
    "schemaVersion",
  ]);

  if (report.schemaVersion !== 1 || report.rulesetVersion !== RULESET_VERSION) {
    return invalidContract();
  }

  const rawChecks = requireArray(
    report.checks,
    PUBLIC_HOMEPAGE_RULES.length,
    PUBLIC_HOMEPAGE_RULES.length,
  );
  const checks = rawChecks.map((check, index) => {
    const expectedRule = PUBLIC_HOMEPAGE_RULES[index];
    return expectedRule
      ? requireCheck(check, expectedRule.ruleId)
      : invalidContract();
  });
  const checkFindings = checks.flatMap((check) =>
    check.finding ? [check.finding] : [],
  );
  const rawFindings = requireArray(
    report.findings,
    checkFindings.length,
    checkFindings.length,
  );

  for (let index = 0; index < rawFindings.length; index += 1) {
    const expected = checkFindings[index];

    if (
      !expected ||
      !sameFinding(requireFinding(rawFindings[index], expected.ruleId), expected)
    ) {
      return invalidContract();
    }
  }

  return {
    checks,
    findings: checkFindings,
    rulesetVersion: RULESET_VERSION,
    schemaVersion: 1,
  };
}

function requireResult(value: unknown): PublicHomepageResult {
  const result = requireExactRecord(value, [
    "completedAt",
    "outcome",
    "report",
    "schemaVersion",
  ]);

  if (result.schemaVersion !== 1) {
    return invalidContract();
  }

  return {
    completedAt: requireIsoTimestamp(result.completedAt),
    outcome: requireEnum(result.outcome, [
      "blocked-by-robots",
      "fetched",
    ] as const),
    report: requireReport(result.report),
    schemaVersion: 1,
  };
}

export function decodeCreateScanEnvelope(value: unknown): PublicCreateScanEnvelope {
  return protectDecode(() => {
    const envelope = requireExactRecord(value, ["data", "message"]);
    const data = requireExactRecord(envelope.data, [
      "scanId",
      "status",
      "statusUrl",
      "target",
    ]);
    const scanId = requireScanId(data.scanId);
    const statusUrl = requireText(data.statusUrl, 128);

    if (
      data.status !== "queued" ||
      statusUrl !== PUBLIC_SCAN_STATUS_PATH ||
      envelope.message !== CREATE_MESSAGE
    ) {
      return invalidContract();
    }

    return {
      data: {
        scanId,
        status: "queued",
        statusUrl,
        target: requirePublicTarget(data.target),
      },
      message: CREATE_MESSAGE,
    };
  });
}

export function decodePublicScanStatusEnvelope(
  value: unknown,
): PublicScanStatusEnvelope {
  return protectDecode(() => {
    const envelope = requireExactRecord(value, ["data"]);

    if (!isRecord(envelope.data)) {
      return invalidContract();
    }

    const status = requireEnum(envelope.data.status, [
      "completed",
      "failed",
      "queued",
      "running",
    ] as const) as PublicScanStatus;
    const data = requireExactRecord(
      envelope.data,
      status === "completed"
        ? ["queuedAt", "result", "scanId", "status", "target"]
        : ["queuedAt", "scanId", "status", "target"],
    );
    const record = {
      queuedAt: requireIsoTimestamp(data.queuedAt),
      scanId: requireScanId(data.scanId),
      target: requirePublicTarget(data.target),
    };

    if (status === "completed") {
      const result = requireResult(data.result);

      if (Date.parse(result.completedAt) < Date.parse(record.queuedAt)) {
        return invalidContract();
      }

      return {
        data: { ...record, result, status: "completed" },
      };
    }

    return {
      data: { ...record, status },
    } as PublicScanStatusEnvelope;
  });
}

export function decodePublicScanError(value: unknown): PublicScanClientError {
  return protectDecode(() => {
    const envelope = requireExactRecord(value, ["error"]);
    const error = requireExactRecord(envelope.error, ["code", "message"]);
    const code = requireEnum(error.code, PUBLIC_SCAN_ERROR_CODES);

    // The wire message is shape-checked, then deliberately discarded. UI copy
    // comes only from this fixed code map, so a proxy or corrupt API response
    // cannot turn attacker-authored text into an error rendered by the client.
    requireText(error.message, PUBLIC_SCAN_CLIENT_LIMITS.errorTextCodeUnits);

    return { code, message: safeErrorMessages[code] };
  });
}

export function samePublicScanIdentity(
  left: PublicScanIdentity,
  right: PublicScanIdentity,
): boolean {
  return (
    left.scanId === right.scanId &&
    left.queuedAt === right.queuedAt &&
    left.target.hostname === right.target.hostname &&
    left.target.origin === right.target.origin
  );
}

export function sortPublicFindings(
  findings: ReadonlyArray<PublicHomepageFinding>,
): ReadonlyArray<PublicHomepageFinding> {
  if (findings.length > PUBLIC_HOMEPAGE_RULES.length) {
    return invalidContract();
  }

  for (const finding of findings) {
    if (
      priorityIndexes[finding.priority] === undefined ||
      ruleIndexes[finding.ruleId] === undefined
    ) {
      return invalidContract();
    }
  }

  return findings
    .map((finding, inputIndex) => ({ finding, inputIndex }))
    .sort((left, right) => {
      return (
        priorityIndexes[left.finding.priority] -
          priorityIndexes[right.finding.priority] ||
        ruleIndexes[left.finding.ruleId] - ruleIndexes[right.finding.ruleId] ||
        left.inputIndex - right.inputIndex
      );
    })
    .map(({ finding }) => finding);
}

function boundedPollDelay(milliseconds: number): number {
  if (!Number.isFinite(milliseconds)) {
    return PUBLIC_SCAN_CLIENT_LIMITS.pollDelayMilliseconds;
  }

  return Math.min(
    PUBLIC_SCAN_CLIENT_LIMITS.retryAfterMaximumMilliseconds,
    Math.max(
      PUBLIC_SCAN_CLIENT_LIMITS.retryAfterMinimumMilliseconds,
      Math.trunc(milliseconds),
    ),
  );
}

export function readSafeRetryAfterMilliseconds(
  value: string | null | undefined,
  fallbackMilliseconds: number = PUBLIC_SCAN_CLIENT_LIMITS.pollDelayMilliseconds,
): number {
  const fallback = boundedPollDelay(fallbackMilliseconds);

  if (typeof value !== "string" || value.length > 32) {
    return fallback;
  }

  const seconds = value.trim();

  if (!/^\d{1,9}$/u.test(seconds)) {
    return fallback;
  }

  return boundedPollDelay(Number(seconds) * 1_000);
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function isByteChunk(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) &&
    "BYTES_PER_ELEMENT" in value &&
    value.BYTES_PER_ELEMENT === 1
  );
}

export async function readBoundedJsonResponse(
  response: Response,
  maxBytes = PUBLIC_SCAN_CLIENT_LIMITS.jsonResponseBytes,
): Promise<unknown> {
  try {
    if (
      !Number.isInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > PUBLIC_SCAN_CLIENT_LIMITS.jsonResponseBytes
    ) {
      await cancelResponseBody(response);
      return invalidContract();
    }

    const contentType = response.headers.get("content-type");

    if (
      contentType === null ||
      contentType.length > 128 ||
      contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
    ) {
      await cancelResponseBody(response);
      return invalidContract();
    }

    const contentLength = response.headers.get("content-length");

    if (contentLength !== null) {
      if (contentLength.length > 20 || !/^\d+$/u.test(contentLength)) {
        await cancelResponseBody(response);
        return invalidContract();
      }

      const declaredLength = Number(contentLength);

      if (
        !Number.isSafeInteger(declaredLength) ||
        declaredLength < 1 ||
        declaredLength > maxBytes
      ) {
        await cancelResponseBody(response);
        return invalidContract();
      }
    }

    if (response.body === null) {
      return invalidContract();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let reads = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        reads += 1;

        if (
          reads > PUBLIC_SCAN_CLIENT_LIMITS.jsonResponseChunks ||
          !isByteChunk(value) ||
          value.byteLength > maxBytes - totalBytes
        ) {
          await reader.cancel().catch(() => undefined);
          return invalidContract();
        }

        if (value.byteLength > 0) {
          chunks.push(value);
          totalBytes += value.byteLength;
        }
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);

      if (isAbortError(error)) {
        throw error;
      }

      return invalidContract();
    } finally {
      reader.releaseLock();
    }

    if (totalBytes === 0) {
      return invalidContract();
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    let text: string;

    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      return invalidContract();
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return invalidContract();
    }
  } catch (error) {
    if (
      error instanceof PublicScanClientContractError ||
      isAbortError(error)
    ) {
      throw error;
    }

    return invalidContract();
  }
}
