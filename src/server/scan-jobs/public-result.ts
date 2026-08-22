import { auditHomepage } from "@/audit/homepage/audit-homepage";
import {
  HOMEPAGE_AUDIT_RULESET_VERSION,
  HOMEPAGE_EVIDENCE_LIMITS,
  type AuditEvidenceItem,
  type BoundedTextEvidence,
  type HomepageAuditCheck,
  type HomepageAuditInput,
  type HomepageAuditReport,
  type HomepageDocumentEvidence,
  type HomepageRuleId,
  type IndexDirective,
} from "@/audit/homepage/types";
import {
  PUBLIC_HOMEPAGE_RULES,
  type PublicAuditEvidenceItem,
  type PublicHomepageCheck,
  type PublicHomepageFinding,
  type PublicHomepageReport,
  type PublicHomepageResult,
} from "@/lib/public-scan-contract";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { CRAWL_LIMITS } from "@/worker/crawler/crawl-budget";
import type { RedirectEvidence } from "@/worker/crawler/url-evidence";

const INVALID_RESULT_MESSAGE =
  "The scan queue returned invalid completed result data.";
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const MAX_URL_LENGTH = 2_048;
// A 2,048-code-unit relative canonical can append to a 2,048-character page
// path, and URL serialization can percent-encode one UTF-16 unit as nine ASCII
// characters. This bounds the producer's stored URL rather than its raw href.
const MAX_CANONICAL_EVIDENCE_URL_LENGTH =
  MAX_URL_LENGTH + HOMEPAGE_EVIDENCE_LIMITS.canonicalUrlLength * 9;
const MAX_COUNT = CRAWL_LIMITS.homepageBytes + CRAWL_LIMITS.maxHeaderBytes;
const MAX_PUBLIC_RESULT_BYTES = 256 * 1_024;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308] as const;

interface PublicResultExpectation {
  requestedUrl: string;
  scanId: string;
}

interface ParsedRobotsEvidence {
  audit: HomepageAuditInput["robots"][number];
  redirectCount: number;
}

interface ParsedHomepageEvidence {
  document: HomepageDocumentEvidence | null;
  finalUrl: string;
  redirects: ReadonlyArray<RedirectEvidence>;
  requestedUrl: string;
  statusCode: number;
}

function invalidResult(): never {
  throw new Error(INVALID_RESULT_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactRecord(
  value: unknown,
  expectedKeys: ReadonlyArray<string>,
): Record<string, unknown> {
  if (!isRecord(value)) {
    return invalidResult();
  }

  const expected = new Set(expectedKeys);
  let actualCount = 0;

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    actualCount += 1;

    if (actualCount > expected.size || !expected.has(key)) {
      return invalidResult();
    }
  }

  if (actualCount !== expected.size) {
    return invalidResult();
  }

  return value;
}

function requireTrustedJsonMatch(value: unknown, expected: unknown): void {
  if (expected === null || typeof expected !== "object") {
    if (
      typeof value !== typeof expected ||
      (typeof expected === "string" &&
        (typeof value !== "string" || value.length !== expected.length)) ||
      value !== expected
    ) {
      return invalidResult();
    }

    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(value) || value.length !== expected.length) {
      return invalidResult();
    }

    for (let index = 0; index < expected.length; index += 1) {
      requireTrustedJsonMatch(value[index], expected[index]);
    }

    return;
  }

  const expectedRecord = expected as Record<string, unknown>;
  const keys = Object.keys(expectedRecord);
  const record = requireExactRecord(value, keys);

  for (const key of keys) {
    requireTrustedJsonMatch(record[key], expectedRecord[key]);
  }
}

function requireArray(
  value: unknown,
  minimum: number,
  maximum: number,
): ReadonlyArray<unknown> {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return invalidResult();
  }

  return value;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    return invalidResult();
  }

  return value;
}

function requireInteger(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalidResult();
  }

  return value;
}

function requireText(
  value: unknown,
  maximumLength: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > maximumLength ||
    (!allowEmpty && value.length === 0) ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return invalidResult();
  }

  return value;
}

function requirePrivatePageText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string" || value.length > maximumLength * 2) {
    return invalidResult();
  }

  let length = 0;

  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    index += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
    length += 1;

    if (length > maximumLength) {
      return invalidResult();
    }
  }

  return value;
}

function requireEnum<const T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return invalidResult();
  }

  return value as T;
}

function requireIsoTimestamp(value: unknown): string {
  const timestamp = requireText(value, 32);

  try {
    if (new Date(timestamp).toISOString() !== timestamp) {
      return invalidResult();
    }
  } catch {
    return invalidResult();
  }

  return timestamp;
}

function requireStructuralEvidenceUrl(
  value: unknown,
  maximumLength = MAX_URL_LENGTH,
): string {
  const text = requireText(value, maximumLength);
  let url: URL;

  try {
    url = new URL(text);
  } catch {
    return invalidResult();
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    `${url.origin}${url.pathname}` !== text
  ) {
    return invalidResult();
  }

  return text;
}

function isPublicDisplayUrl(value: string): boolean {
  const normalized = normalizeWebsiteUrl(value);

  if (!normalized.ok) {
    return false;
  }

  return new URL(value).port === "";
}

function requirePublicCrawlerUrl(value: unknown): string {
  const text = requireStructuralEvidenceUrl(value);

  if (!isPublicDisplayUrl(text)) {
    return invalidResult();
  }

  return text;
}

function requirePublicOrigin(value: unknown): string {
  const text = requirePublicCrawlerUrl(value);

  if (new URL(text).pathname !== "/") {
    return invalidResult();
  }

  return text;
}

function requireSha256(value: unknown): string {
  const digest = requireText(value, 64);

  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    return invalidResult();
  }

  return digest;
}

function parseRedirect(value: unknown): RedirectEvidence {
  const redirect = requireExactRecord(value, ["from", "statusCode", "to"]);
  const statusCode = requireInteger(redirect.statusCode, 100, 599);

  if (!REDIRECT_STATUSES.includes(statusCode as (typeof REDIRECT_STATUSES)[number])) {
    return invalidResult();
  }

  return {
    from: requirePublicCrawlerUrl(redirect.from),
    statusCode,
    to: requirePublicCrawlerUrl(redirect.to),
  };
}

function parseRedirects(value: unknown): ReadonlyArray<RedirectEvidence> {
  return requireArray(value, 0, CRAWL_LIMITS.redirects).map(parseRedirect);
}

function requireRedirectChain(
  requestedUrl: string,
  redirects: ReadonlyArray<RedirectEvidence>,
  finalUrl: string,
): void {
  let expectedFrom = requestedUrl;

  for (const redirect of redirects) {
    if (redirect.from !== expectedFrom) {
      return invalidResult();
    }

    expectedFrom = redirect.to;
  }

  if (expectedFrom !== finalUrl) {
    return invalidResult();
  }
}

function parseRobotsEvidence(value: unknown): ParsedRobotsEvidence {
  if (!isRecord(value)) {
    return invalidResult();
  }

  const status = requireEnum(value.status, ["found", "not-found"] as const);
  const robots = requireExactRecord(
    value,
    status === "found"
      ? ["bytes", "finalUrl", "origin", "redirects", "sha256", "status"]
      : ["finalUrl", "origin", "redirects", "status"],
  );
  const origin = requirePublicOrigin(robots.origin);
  const finalUrl = requirePublicCrawlerUrl(robots.finalUrl);
  const redirects = parseRedirects(robots.redirects);

  requireRedirectChain(new URL("/robots.txt", origin).toString(), redirects, finalUrl);

  if (status === "found") {
    const bytes = requireInteger(robots.bytes, 0, CRAWL_LIMITS.robotsBytes);
    const digest = requireSha256(robots.sha256);

    if ((bytes === 0) !== (digest === EMPTY_SHA256)) {
      return invalidResult();
    }
  }

  return {
    audit: { origin, status },
    redirectCount: redirects.length,
  };
}

function parseRobotsList(value: unknown): ReadonlyArray<ParsedRobotsEvidence> {
  const robots = requireArray(value, 1, CRAWL_LIMITS.redirects + 1).map(
    parseRobotsEvidence,
  );
  const origins = robots.map(({ audit }) => audit.origin);

  if (new Set(origins).size !== origins.length) {
    return invalidResult();
  }

  return robots;
}

function parseBoundedText(
  value: unknown,
  storedLimit: number,
): BoundedTextEvidence {
  const textValue = requireExactRecord(value, ["length", "text", "truncated"]);
  const text = requirePrivatePageText(textValue.text, storedLimit);
  const length = requireInteger(textValue.length, 0, CRAWL_LIMITS.homepageBytes);
  const truncated = requireBoolean(textValue.truncated);
  const storedLength = [...text].length;

  if (
    storedLength > length ||
    truncated !== (storedLength < length) ||
    (truncated && storedLength !== storedLimit)
  ) {
    return invalidResult();
  }

  return { length, text, truncated };
}

function parseTextElement(
  value: unknown,
  storedLimit: number,
): HomepageDocumentEvidence["title"] {
  const element = requireExactRecord(value, ["count", "emptyCount", "first"]);
  const count = requireInteger(element.count, 0, MAX_COUNT);
  const emptyCount = requireInteger(element.emptyCount, 0, count);
  const first =
    element.first === null ? null : parseBoundedText(element.first, storedLimit);

  if (
    (count === 0) !== (first === null) ||
    (count === 0 && emptyCount !== 0) ||
    (first?.length === 0 && emptyCount === 0) ||
    (emptyCount === count && count > 0 && first?.length !== 0)
  ) {
    return invalidResult();
  }

  return { count, emptyCount, first };
}

function parseCanonical(
  value: unknown,
  finalUrl: string,
): HomepageDocumentEvidence["canonical"] {
  const canonical = requireExactRecord(value, [
    "count",
    "entries",
    "entriesTruncated",
  ]);
  const count = requireInteger(canonical.count, 0, MAX_COUNT);
  const storedCount = Math.min(count, HOMEPAGE_EVIDENCE_LIMITS.canonicals);
  const entries = requireArray(canonical.entries, storedCount, storedCount).map(
    (value) => {
      const entry = requireExactRecord(value, ["matchesPage", "url", "valid"]);
      const matchesPage = requireBoolean(entry.matchesPage);
      const valid = requireBoolean(entry.valid);
      const url =
        entry.url === null
          ? null
          : requireStructuralEvidenceUrl(
              entry.url,
              MAX_CANONICAL_EVIDENCE_URL_LENGTH,
            );

      if (
        valid !== (url !== null) ||
        (!valid && matchesPage) ||
        (matchesPage && url !== finalUrl)
      ) {
        return invalidResult();
      }

      return { matchesPage, url, valid };
    },
  );
  const entriesTruncated = requireBoolean(canonical.entriesTruncated);

  if (entriesTruncated !== (count > entries.length)) {
    return invalidResult();
  }

  return { count, entries, entriesTruncated };
}

function parseHeadingCounts(
  value: unknown,
): Record<`h${1 | 2 | 3 | 4 | 5 | 6}`, number> {
  const counts = requireExactRecord(value, ["h1", "h2", "h3", "h4", "h5", "h6"]);

  return {
    h1: requireInteger(counts.h1, 0, MAX_COUNT),
    h2: requireInteger(counts.h2, 0, MAX_COUNT),
    h3: requireInteger(counts.h3, 0, MAX_COUNT),
    h4: requireInteger(counts.h4, 0, MAX_COUNT),
    h5: requireInteger(counts.h5, 0, MAX_COUNT),
    h6: requireInteger(counts.h6, 0, MAX_COUNT),
  };
}

function sumCounts(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function parseHeadings(value: unknown): HomepageDocumentEvidence["headings"] {
  const headings = requireExactRecord(value, [
    "counts",
    "emptyCount",
    "entries",
    "entriesTruncated",
    "nonEmptyCounts",
    "skippedLevelCount",
  ]);
  const counts = parseHeadingCounts(headings.counts);
  const nonEmptyCounts = parseHeadingCounts(headings.nonEmptyCounts);
  const total = sumCounts(counts);
  const nonEmptyTotal = sumCounts(nonEmptyCounts);

  if (total > CRAWL_LIMITS.homepageBytes) {
    return invalidResult();
  }

  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (nonEmptyCounts[`h${level}`] > counts[`h${level}`]) {
      return invalidResult();
    }
  }

  const storedCount = Math.min(total, HOMEPAGE_EVIDENCE_LIMITS.headings);
  const entries = requireArray(headings.entries, storedCount, storedCount).map(
    (value) => {
      const entry = requireExactRecord(value, [
        "length",
        "level",
        "text",
        "truncated",
      ]);

      return {
        ...parseBoundedText(
          {
            length: entry.length,
            text: entry.text,
            truncated: entry.truncated,
          },
          HOMEPAGE_EVIDENCE_LIMITS.headingLength,
        ),
        level: requireInteger(entry.level, 1, 6) as 1 | 2 | 3 | 4 | 5 | 6,
      };
    },
  );
  const emptyCount = requireInteger(headings.emptyCount, 0, total);
  const entriesTruncated = requireBoolean(headings.entriesTruncated);
  const skippedLevelCount = requireInteger(
    headings.skippedLevelCount,
    0,
    Math.max(0, total - 1),
  );

  if (
    emptyCount !== total - nonEmptyTotal ||
    entriesTruncated !== (total > entries.length)
  ) {
    return invalidResult();
  }

  const storedCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const storedNonEmpty = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  let storedSkipped = 0;
  let lastLevel: number | null = null;

  for (const entry of entries) {
    const key = `h${entry.level}` as keyof typeof storedCounts;
    storedCounts[key] += 1;

    if (entry.length > 0) {
      storedNonEmpty[key] += 1;
    }

    if (lastLevel !== null && entry.level > lastLevel + 1) {
      storedSkipped += 1;
    }

    lastLevel = entry.level;
  }

  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const key = `h${level}` as const;

    if (
      storedCounts[key] > counts[key] ||
      storedNonEmpty[key] > nonEmptyCounts[key] ||
      (!entriesTruncated &&
        (storedCounts[key] !== counts[key] ||
          storedNonEmpty[key] !== nonEmptyCounts[key]))
    ) {
      return invalidResult();
    }
  }

  if (
    storedSkipped > skippedLevelCount ||
    (!entriesTruncated && storedSkipped !== skippedLevelCount)
  ) {
    return invalidResult();
  }

  return {
    counts,
    emptyCount,
    entries,
    entriesTruncated,
    nonEmptyCounts,
    skippedLevelCount,
  };
}

function effectiveDirectiveState(
  directives: ReadonlySet<IndexDirective>,
  positive: IndexDirective,
  negative: IndexDirective,
): "allowed" | "blocked" | "conflicting" {
  return directives.has(negative)
    ? directives.has(positive)
      ? "conflicting"
      : "blocked"
    : "allowed";
}

function isPossibleDirectiveState(
  state: "allowed" | "blocked" | "conflicting",
  directives: ReadonlySet<IndexDirective>,
  positive: IndexDirective,
  negative: IndexDirective,
): boolean {
  const hasPositive = directives.has(positive);
  const hasNegative = directives.has(negative);

  if (hasPositive && hasNegative) {
    return state === "conflicting";
  }

  if (hasNegative) {
    return state === "blocked" || state === "conflicting";
  }

  if (hasPositive) {
    return state === "allowed" || state === "conflicting";
  }

  return true;
}

function parseIndexing(value: unknown): HomepageDocumentEvidence["indexing"] {
  const indexing = requireExactRecord(value, [
    "effectiveFollow",
    "effectiveIndex",
    "sources",
    "sourcesTruncated",
    "totalSources",
  ]);
  const totalSources = requireInteger(indexing.totalSources, 0, MAX_COUNT);
  const storedCount = Math.min(
    totalSources,
    HOMEPAGE_EVIDENCE_LIMITS.indexingSources,
  );
  const sources = requireArray(indexing.sources, storedCount, storedCount).map(
    (value) => {
      const source = requireExactRecord(value, ["directives", "source"]);
      const directives = requireArray(source.directives, 1, 4).map((directive) =>
        requireEnum(directive, ["follow", "index", "nofollow", "noindex"] as const),
      );

      if (new Set(directives).size !== directives.length) {
        return invalidResult();
      }

      return {
        directives,
        source: requireEnum(source.source, [
          "meta-googlebot",
          "meta-robots",
          "x-robots-tag",
        ] as const),
      };
    },
  );
  const sourcesTruncated = requireBoolean(indexing.sourcesTruncated);
  const effectiveFollow = requireEnum(indexing.effectiveFollow, [
    "allowed",
    "blocked",
    "conflicting",
  ] as const);
  const effectiveIndex = requireEnum(indexing.effectiveIndex, [
    "allowed",
    "blocked",
    "conflicting",
  ] as const);

  if (sourcesTruncated !== (totalSources > sources.length)) {
    return invalidResult();
  }

  const directives = new Set(sources.flatMap((source) => source.directives));

  if (!sourcesTruncated) {
    if (
      effectiveFollow !==
        effectiveDirectiveState(directives, "follow", "nofollow") ||
      effectiveIndex !== effectiveDirectiveState(directives, "index", "noindex")
    ) {
      return invalidResult();
    }
  } else if (
    !isPossibleDirectiveState(
      effectiveFollow,
      directives,
      "follow",
      "nofollow",
    ) ||
    !isPossibleDirectiveState(
      effectiveIndex,
      directives,
      "index",
      "noindex",
    )
  ) {
    return invalidResult();
  }

  return {
    effectiveFollow,
    effectiveIndex,
    sources,
    sourcesTruncated,
    totalSources,
  };
}

function parseDocument(
  value: unknown,
  finalUrl: string,
): HomepageDocumentEvidence {
  const document = requireExactRecord(value, [
    "canonical",
    "characterEncoding",
    "characterEncodingSource",
    "description",
    "headings",
    "indexing",
    "schemaVersion",
    "title",
  ]);

  if (document.schemaVersion !== 1) {
    return invalidResult();
  }

  const characterEncoding = requireText(document.characterEncoding, 64);

  if (!/^[a-z0-9._-]+$/u.test(characterEncoding)) {
    return invalidResult();
  }

  return {
    canonical: parseCanonical(document.canonical, finalUrl),
    characterEncoding,
    characterEncodingSource: requireEnum(document.characterEncodingSource, [
      "default",
      "fallback",
      "http-header",
    ] as const),
    description: parseTextElement(
      document.description,
      HOMEPAGE_EVIDENCE_LIMITS.descriptionLength,
    ),
    headings: parseHeadings(document.headings),
    indexing: parseIndexing(document.indexing),
    schemaVersion: 1,
    title: parseTextElement(
      document.title,
      HOMEPAGE_EVIDENCE_LIMITS.titleLength,
    ),
  };
}

function requireDocumentFitsBody(
  document: HomepageDocumentEvidence,
  bodyBytes: number,
): void {
  const headingCount = sumCounts(document.headings.counts);
  const storedTextLength =
    (document.title.first?.length ?? 0) +
    (document.description.first?.length ?? 0) +
    document.headings.entries.reduce((sum, entry) => sum + entry.length, 0);

  if (
    document.title.count > bodyBytes ||
    document.description.count > bodyBytes ||
    document.canonical.count > bodyBytes ||
    headingCount > bodyBytes ||
    storedTextLength > bodyBytes
  ) {
    return invalidResult();
  }
}

function parseHomepage(
  value: unknown,
  expectedRequestedUrl: string,
): ParsedHomepageEvidence {
  const homepage = requireExactRecord(value, [
    "body",
    "finalUrl",
    "redirects",
    "requestedUrl",
    "statusCode",
  ]);
  const requestedUrl = requirePublicOrigin(homepage.requestedUrl);

  if (requestedUrl !== expectedRequestedUrl) {
    return invalidResult();
  }

  const finalUrl = requirePublicCrawlerUrl(homepage.finalUrl);
  const redirects = parseRedirects(homepage.redirects);
  const statusCode = requireInteger(homepage.statusCode, 100, 599);

  if (
    REDIRECT_STATUSES.includes(statusCode as (typeof REDIRECT_STATUSES)[number]) ||
    statusCode === 206
  ) {
    return invalidResult();
  }

  requireRedirectChain(requestedUrl, redirects, finalUrl);

  const expectsDocument =
    statusCode >= 200 &&
    statusCode < 300 &&
    statusCode !== 204 &&
    statusCode !== 205;
  let document: HomepageDocumentEvidence | null = null;

  if (homepage.body === null) {
    if (expectsDocument) {
      return invalidResult();
    }
  } else {
    if (!expectsDocument) {
      return invalidResult();
    }

    const body = requireExactRecord(homepage.body, [
      "bytes",
      "contentType",
      "document",
      "sha256",
    ]);

    const bodyBytes = requireInteger(body.bytes, 0, CRAWL_LIMITS.homepageBytes);
    requireEnum(body.contentType, ["application/xhtml+xml", "text/html"] as const);
    const digest = requireSha256(body.sha256);
    document = parseDocument(body.document, finalUrl);
    requireDocumentFitsBody(document, bodyBytes);

    if ((bodyBytes === 0) !== (digest === EMPTY_SHA256)) {
      return invalidResult();
    }
  }

  return { document, finalUrl, redirects, requestedUrl, statusCode };
}

function originOf(value: string): string {
  return `${new URL(value).origin}/`;
}

function requireFetchedRobotsCoverage(
  homepage: ParsedHomepageEvidence,
  robots: ReadonlyArray<ParsedRobotsEvidence>,
): void {
  const route = [
    homepage.requestedUrl,
    ...homepage.redirects.map((redirect) => redirect.to),
  ];
  const expectedOrigins = [...new Set(route.map(originOf))];
  const actualOrigins = robots.map(({ audit }) => audit.origin);

  if (
    actualOrigins.length !== expectedOrigins.length ||
    actualOrigins.some((origin, index) => origin !== expectedOrigins[index])
  ) {
    return invalidResult();
  }

  const requestCount =
    homepage.redirects.length +
    1 +
    robots.reduce((sum, robot) => sum + robot.redirectCount + 1, 0);
  const redirectCount =
    homepage.redirects.length +
    robots.reduce((sum, robot) => sum + robot.redirectCount, 0);

  if (
    requestCount > CRAWL_LIMITS.requests ||
    redirectCount > CRAWL_LIMITS.redirects
  ) {
    return invalidResult();
  }
}

const fixedEvidenceLabels: Readonly<Record<HomepageRuleId, ReadonlySet<string>>> = {
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
};

function isAllowedEvidenceLabel(
  ruleId: HomepageRuleId,
  label: string,
  input: HomepageAuditInput,
): boolean {
  if (fixedEvidenceLabels[ruleId].has(label)) {
    return true;
  }

  switch (ruleId) {
    case "SEARCH-CANONICAL-001": {
      const match = /^Canonical ([1-9]|10)$/u.exec(label);
      return Boolean(
        match &&
          Number(match[1]) <= (input.document?.canonical.entries.length ?? 0),
      );
    }
    case "SEARCH-INDEXING-001": {
      const match = /^Source ([1-9]|1[0-9]|20)$/u.exec(label);
      return Boolean(
        match &&
          Number(match[1]) <= (input.document?.indexing.sources.length ?? 0),
      );
    }
    case "SEARCH-ROBOTS-001":
      return input.robots.some((robots) => robots.origin === label);
    case "TECH-REDIRECTS-001": {
      const match = /^Hop ([1-5])$/u.exec(label);
      return Boolean(match && Number(match[1]) <= input.redirects.length);
    }
    default:
      return false;
  }
}

function projectCanonicalEvidenceValue(
  label: string,
  value: string,
  input: HomepageAuditInput,
): string {
  const match = /^Canonical ([1-9]|10)$/u.exec(label);

  if (!match) {
    return value;
  }

  const entry = input.document?.canonical.entries[Number(match[1]) - 1];

  if (entry?.valid && entry.url && !isPublicDisplayUrl(entry.url)) {
    return "Non-public canonical target withheld.";
  }

  return value;
}

function projectTrustedEvidence(
  ruleId: HomepageRuleId,
  evidence: ReadonlyArray<AuditEvidenceItem>,
  input: HomepageAuditInput,
): ReadonlyArray<PublicAuditEvidenceItem> {
  const projected: PublicAuditEvidenceItem[] = [];

  for (const item of evidence) {
    if (
      (ruleId === "SEARCH-TITLE-001" && item.label === "First title") ||
      (ruleId === "SEARCH-DESCRIPTION-001" &&
        item.label === "First description")
    ) {
      continue;
    }

    if (!isAllowedEvidenceLabel(ruleId, item.label, input)) {
      return invalidResult();
    }

    projected.push({
      label: item.label,
      value:
        ruleId === "SEARCH-CANONICAL-001"
          ? projectCanonicalEvidenceValue(item.label, item.value, input)
          : item.value,
    });
  }

  return projected;
}

function projectTrustedFinding(
  check: HomepageAuditCheck,
  evidence: ReadonlyArray<PublicAuditEvidenceItem>,
): PublicHomepageFinding | null {
  const finding = check.finding;

  if (!finding) {
    return null;
  }

  return {
    affectedUrls: finding.affectedUrls.map(requirePublicCrawlerUrl),
    category: finding.category,
    confidence: finding.confidence,
    dataLabel: "derived",
    effort: finding.effort,
    evidence,
    explanation: finding.explanation,
    fix: finding.fix,
    impact: finding.impact,
    priority: finding.priority,
    ruleId: finding.ruleId,
    ruleVersion: "1.0.0",
    title: finding.title,
    verify: finding.verify,
  };
}

function projectTrustedReport(
  report: HomepageAuditReport,
  input: HomepageAuditInput,
): PublicHomepageReport {
  if (
    report.schemaVersion !== 1 ||
    report.rulesetVersion !== HOMEPAGE_AUDIT_RULESET_VERSION ||
    report.checks.length !== PUBLIC_HOMEPAGE_RULES.length
  ) {
    return invalidResult();
  }

  const checks: PublicHomepageCheck[] = report.checks.map((check, index) => {
    const expectedRule = PUBLIC_HOMEPAGE_RULES[index];

    if (
      !expectedRule ||
      check.ruleId !== expectedRule.ruleId ||
      check.category !== expectedRule.category ||
      check.ruleVersion !== "1.0.0" ||
      (check.status === "failed") !== (check.finding !== null)
    ) {
      return invalidResult();
    }

    const evidence = projectTrustedEvidence(check.ruleId, check.evidence, input);

    return {
      category: check.category,
      evidence,
      finding: projectTrustedFinding(check, evidence),
      ruleId: check.ruleId,
      ruleVersion: "1.0.0",
      status: check.status,
      summary: check.summary,
    };
  });

  return {
    checks,
    findings: checks.flatMap((check) => (check.finding ? [check.finding] : [])),
    rulesetVersion: HOMEPAGE_AUDIT_RULESET_VERSION,
    schemaVersion: 1,
  };
}

export function projectPublicHomepageResult(
  value: unknown,
  expected: PublicResultExpectation,
): PublicHomepageResult {
  const expectedRequestedUrl = requirePublicOrigin(expected.requestedUrl);

  if (!isRecord(value)) {
    return invalidResult();
  }

  const outcome = requireEnum(value.outcome, [
    "blocked-by-robots",
    "fetched",
  ] as const);
  const result = requireExactRecord(
    value,
    outcome === "fetched"
      ? [
          "audit",
          "completedAt",
          "homepage",
          "outcome",
          "robots",
          "scanId",
          "schemaVersion",
        ]
      : [
          "audit",
          "blockedAt",
          "completedAt",
          "homepage",
          "outcome",
          "robots",
          "scanId",
          "schemaVersion",
        ],
  );

  if (result.schemaVersion !== 2 || result.scanId !== expected.scanId) {
    return invalidResult();
  }

  const robots = parseRobotsList(result.robots);
  let input: HomepageAuditInput;

  if (outcome === "fetched") {
    const homepage = parseHomepage(result.homepage, expectedRequestedUrl);

    requireFetchedRobotsCoverage(homepage, robots);
    input = {
      blockedAt: null,
      document: homepage.document,
      finalUrl: homepage.finalUrl,
      redirects: homepage.redirects,
      requestedUrl: homepage.requestedUrl,
      robots: robots.map(({ audit }) => audit),
      statusCode: homepage.statusCode,
    };
  } else {
    if (result.homepage !== null) {
      return invalidResult();
    }

    const blockedAt = requirePublicCrawlerUrl(result.blockedAt);
    const blockedOrigin = originOf(blockedAt);
    const robotsRedirectCount = robots.reduce(
      (sum, robot) => sum + robot.redirectCount,
      0,
    );
    const lastFirstSeenOrigin = robots.at(-1)?.audit.origin;
    let minimumPageRedirects = robots.length - 1;

    if (
      blockedOrigin !== lastFirstSeenOrigin ||
      (robots.length === 1 && blockedAt !== expectedRequestedUrl)
    ) {
      minimumPageRedirects += 1;
    }

    if (
      robots[0]?.audit.origin !== expectedRequestedUrl ||
      !robots.some(
        ({ audit }) => audit.origin === blockedOrigin && audit.status === "found",
      ) ||
      minimumPageRedirects + robotsRedirectCount > CRAWL_LIMITS.redirects ||
      minimumPageRedirects + robots.length + robotsRedirectCount >
        CRAWL_LIMITS.requests
    ) {
      return invalidResult();
    }

    input = {
      blockedAt,
      document: null,
      finalUrl: null,
      redirects: [],
      requestedUrl: expectedRequestedUrl,
      robots: robots.map(({ audit }) => audit),
      statusCode: null,
    };
  }

  const recomputed = auditHomepage(input);

  requireTrustedJsonMatch(result.audit, recomputed);

  const projected: PublicHomepageResult = {
    completedAt: requireIsoTimestamp(result.completedAt),
    outcome,
    report: projectTrustedReport(recomputed, input),
    schemaVersion: 1,
  };

  if (
    new TextEncoder().encode(JSON.stringify(projected)).byteLength >
    MAX_PUBLIC_RESULT_BYTES
  ) {
    return invalidResult();
  }

  return projected;
}
