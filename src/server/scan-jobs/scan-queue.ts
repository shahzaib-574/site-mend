import type { JobState, JobsOptions, Queue } from "bullmq";

import { normalizeWebsiteUrl } from "@/lib/website-url";

export const SCAN_QUEUE_NAME = "site-mend-scans";
export const SCAN_JOB_NAME = "homepage-health-check";

export interface ScanJobPayload {
  requestedAt: string;
  scanId: string;
  schemaVersion: 1;
  target: {
    hostname: string;
    origin: string;
  };
}

export type PublicScanStatus = "completed" | "failed" | "queued" | "running";

export interface ScanStatusRecord {
  queuedAt: string;
  scanId: string;
  status: PublicScanStatus;
  target: {
    hostname: string;
    origin: string;
  };
}

export interface ScanQueue {
  enqueue(payload: ScanJobPayload): Promise<void>;
  getStatus(scanId: string): Promise<ScanStatusRecord | null>;
}

type QueueMethods = Pick<Queue<ScanJobPayload>, "add" | "getJob">;

const scanJobOptions = {
  attempts: 1,
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 604_800, count: 25_000 },
  sizeLimit: 1_024,
  stackTraceLimit: 3,
} satisfies JobsOptions;

const scanIdPattern =
  /^scan-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasExactKeys(value: object, expectedKeys: ReadonlyArray<string>) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();

  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
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

function toPublicStatus(state: JobState | "unknown"): PublicScanStatus | null {
  switch (state) {
    case "active":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "delayed":
    case "prioritized":
    case "waiting":
    case "waiting-children":
      return "queued";
    case "unknown":
      return null;
  }
}

export class BullMqScanQueue implements ScanQueue {
  constructor(private readonly queue: QueueMethods) {}

  async enqueue(payload: ScanJobPayload): Promise<void> {
    const job = await this.queue.add(SCAN_JOB_NAME, payload, {
      ...scanJobOptions,
      jobId: payload.scanId,
    });

    if (job.id !== payload.scanId) {
      throw new Error("The scan queue returned an unexpected job ID.");
    }
  }

  async getStatus(scanId: string): Promise<ScanStatusRecord | null> {
    const job = await this.queue.getJob(scanId);

    if (!job) {
      return null;
    }

    const payload = parseScanJobPayload(job.data);

    if (payload.scanId !== scanId) {
      throw new Error("The scan queue returned invalid job data.");
    }

    const status = toPublicStatus(await job.getState());

    if (status === null) {
      return null;
    }

    return {
      queuedAt: payload.requestedAt,
      scanId,
      status,
      target: {
        hostname: payload.target.hostname,
        origin: payload.target.origin,
      },
    };
  }
}
