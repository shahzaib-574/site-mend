import type { JobState, JobsOptions, Queue } from "bullmq";

import type {
  PublicScanStatus,
  PublicScanStatusRecord,
} from "@/lib/public-scan-contract";
import {
  parseScanJobPayload,
  SCAN_JOB_NAME,
  type ScanJobPayload,
} from "@/lib/scan-job-contract";

import { projectPublicHomepageResult } from "./public-result";

export type ScanStatusRecord = PublicScanStatusRecord;
export type { PublicScanStatus } from "@/lib/public-scan-contract";
export {
  isScanJobPayload,
  parseScanJobPayload,
  SCAN_JOB_NAME,
  SCAN_QUEUE_NAME,
  type ScanJobPayload,
} from "@/lib/scan-job-contract";

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

    if (job.name !== SCAN_JOB_NAME) {
      throw new Error("The scan queue returned invalid job data.");
    }

    const payload = parseScanJobPayload(job.data);

    if (payload.scanId !== scanId) {
      throw new Error("The scan queue returned invalid job data.");
    }

    const status = toPublicStatus(await job.getState());

    if (status === null) {
      return null;
    }

    const record = {
      queuedAt: payload.requestedAt,
      scanId,
      target: {
        hostname: payload.target.hostname,
        origin: payload.target.origin,
      },
    };

    if (status === "completed") {
      // getState() is a separate Redis read from getJob(). Reload after a
      // completed observation so returnvalue cannot be a stale pre-completion
      // snapshot.
      const completedJob = await this.queue.getJob(scanId);

      if (!completedJob) {
        return null;
      }

      if (completedJob.name !== SCAN_JOB_NAME) {
        throw new Error("The scan queue returned invalid job data.");
      }

      const completedPayload = parseScanJobPayload(completedJob.data);

      if (
        completedPayload.scanId !== scanId ||
        completedPayload.requestedAt !== payload.requestedAt ||
        completedPayload.target.hostname !== payload.target.hostname ||
        completedPayload.target.origin !== payload.target.origin
      ) {
        throw new Error("The scan queue returned invalid job data.");
      }

      const refreshedStatus = toPublicStatus(await completedJob.getState());

      if (refreshedStatus === null) {
        return null;
      }

      if (refreshedStatus !== "completed") {
        return { ...record, status: refreshedStatus };
      }

      return {
        ...record,
        result: projectPublicHomepageResult(completedJob.returnvalue, {
          requestedUrl: payload.target.origin,
          scanId,
        }),
        status,
      };
    }

    return { ...record, status };
  }
}
