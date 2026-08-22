import { normalizeWebsiteUrl } from "./website-url";

export const SCAN_JOB_NAME = "homepage-health-check";
export const SCAN_QUEUE_NAME = "site-mend-scans";

export interface ScanJobPayload {
  requestedAt: string;
  scanId: string;
  schemaVersion: 1;
  target: {
    hostname: string;
    origin: string;
  };
}

const scanIdPattern =
  /^scan-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasExactKeys(value: object, expectedKeys: ReadonlyArray<string>): boolean {
  const expected = new Set(expectedKeys);
  let count = 0;

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    count += 1;

    if (count > expected.size || !expected.has(key)) {
      return false;
    }
  }

  return count === expected.size;
}

function isIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function isScanJobPayload(value: unknown): value is ScanJobPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<ScanJobPayload>;

  if (
    !hasExactKeys(value, ["requestedAt", "scanId", "schemaVersion", "target"]) ||
    payload.schemaVersion !== 1 ||
    typeof payload.scanId !== "string" ||
    !scanIdPattern.test(payload.scanId) ||
    typeof payload.requestedAt !== "string" ||
    payload.requestedAt.length > 32 ||
    !isIsoTimestamp(payload.requestedAt) ||
    typeof payload.target !== "object" ||
    payload.target === null ||
    !hasExactKeys(payload.target, ["hostname", "origin"]) ||
    typeof payload.target.hostname !== "string" ||
    typeof payload.target.origin !== "string"
  ) {
    return false;
  }

  const normalized = normalizeWebsiteUrl(payload.target.origin);

  return (
    normalized.ok &&
    normalized.url === payload.target.origin &&
    normalized.hostname === payload.target.hostname
  );
}

export function parseScanJobPayload(value: unknown): ScanJobPayload {
  if (!isScanJobPayload(value)) {
    throw new Error("The scan queue returned invalid job data.");
  }

  return value;
}
