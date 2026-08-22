import { describe, expect, it, vi } from "vitest";

import { auditHomepage } from "@/audit/homepage/audit-homepage";
import type { HomepageCrawlResult } from "@/worker/crawler/homepage-crawler";

import {
  BullMqScanQueue,
  parseScanJobPayload,
  SCAN_JOB_NAME,
  type ScanJobPayload,
} from "./scan-queue";

const payload: ScanJobPayload = {
  requestedAt: "2026-08-21T12:00:00.000Z",
  scanId: "scan-11111111-1111-4111-8111-111111111111",
  schemaVersion: 1,
  target: {
    hostname: "example.com",
    origin: "https://example.com/",
  },
};

const completedAuditInput = {
  blockedAt: null,
  document: null,
  finalUrl: "https://example.com/",
  redirects: [],
  requestedUrl: "https://example.com/",
  robots: [{ origin: "https://example.com/", status: "not-found" as const }],
  statusCode: 204,
} as const;
const completedAudit = auditHomepage(completedAuditInput);

const completedWorkerResult: HomepageCrawlResult = {
  audit: completedAudit,
  completedAt: "2026-08-21T12:01:00.000Z",
  homepage: {
    body: null,
    finalUrl: "https://example.com/",
    redirects: [],
    requestedUrl: "https://example.com/",
    statusCode: 204,
  },
  outcome: "fetched",
  robots: [
    {
      finalUrl: "https://example.com/robots.txt",
      origin: "https://example.com/",
      redirects: [],
      status: "not-found",
    },
  ],
  scanId: payload.scanId,
  schemaVersion: 2,
};

describe("BullMqScanQueue", () => {
  it("exports the exact queue payload validator for workers", () => {
    expect(parseScanJobPayload(payload)).toBe(payload);
    expect(() =>
      parseScanJobPayload({ ...payload, unexpected: "field" }),
    ).toThrow("invalid job data");
  });

  it("adds a bounded job using the public scan ID", async () => {
    const add = vi.fn(async () => ({ id: payload.scanId }));
    const queue = new BullMqScanQueue({ add, getJob: vi.fn() } as never);

    await queue.enqueue(payload);

    expect(add).toHaveBeenCalledWith(
      "homepage-health-check",
      payload,
      expect.objectContaining({
        attempts: 1,
        jobId: payload.scanId,
        sizeLimit: 1_024,
      }),
    );
  });

  it("rejects an unexpected queue job ID", async () => {
    const queue = new BullMqScanQueue({
      add: async () => ({ id: "different" }),
      getJob: vi.fn(),
    } as never);

    await expect(queue.enqueue(payload)).rejects.toThrow("unexpected job ID");
  });

  it.each([
    ["waiting", "queued"],
    ["delayed", "queued"],
    ["prioritized", "queued"],
    ["waiting-children", "queued"],
    ["active", "running"],
    ["failed", "failed"],
  ] as const)("maps BullMQ state %s to %s", async (state, expected) => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: payload,
        getState: async () => state,
        name: SCAN_JOB_NAME,
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).resolves.toEqual({
      queuedAt: payload.requestedAt,
      scanId: payload.scanId,
      status: expected,
      target: payload.target,
    });
  });

  it("adds an allowlisted result only for a completed job", async () => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: payload,
        getState: async () => "completed",
        name: SCAN_JOB_NAME,
        returnvalue: completedWorkerResult,
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).resolves.toEqual({
      queuedAt: payload.requestedAt,
      result: {
        completedAt: completedWorkerResult.completedAt,
        outcome: "fetched",
        report: completedAudit,
        schemaVersion: 1,
      },
      scanId: payload.scanId,
      status: "completed",
      target: payload.target,
    });
  });

  it("reloads a completed job before projecting its return value", async () => {
    const getJob = vi
      .fn()
      .mockResolvedValueOnce({
        data: payload,
        getState: async () => "completed",
        name: SCAN_JOB_NAME,
        returnvalue: null,
      })
      .mockResolvedValueOnce({
        data: payload,
        getState: async () => "completed",
        name: SCAN_JOB_NAME,
        returnvalue: completedWorkerResult,
      });
    const queue = new BullMqScanQueue({ add: vi.fn(), getJob } as never);

    await expect(queue.getStatus(payload.scanId)).resolves.toMatchObject({
      result: { schemaVersion: 1 },
      status: "completed",
    });
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it("returns metadata only when a reloaded completed job is no longer completed", async () => {
    const getJob = vi
      .fn()
      .mockResolvedValueOnce({
        data: payload,
        getState: async () => "completed",
        name: SCAN_JOB_NAME,
        returnvalue: completedWorkerResult,
      })
      .mockResolvedValueOnce({
        data: payload,
        getState: async () => "waiting",
        name: SCAN_JOB_NAME,
        returnvalue: { private: true },
      });
    const queue = new BullMqScanQueue({ add: vi.fn(), getJob } as never);

    await expect(queue.getStatus(payload.scanId)).resolves.toEqual({
      queuedAt: payload.requestedAt,
      scanId: payload.scanId,
      status: "queued",
      target: payload.target,
    });
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a completed job has no valid result", async () => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: payload,
        getState: async () => "completed",
        name: SCAN_JOB_NAME,
        returnvalue: { rawHtml: "<html>private</html>" },
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).rejects.toThrow(
      "invalid completed result data",
    );
  });

  it("does not inspect worker failure details for a failed job", async () => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: payload,
        failedReason: "redis://user:secret@private-host",
        getState: async () => "failed",
        name: SCAN_JOB_NAME,
        returnvalue: { private: true },
        stacktrace: ["private stack"],
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).resolves.toEqual({
      queuedAt: payload.requestedAt,
      scanId: payload.scanId,
      status: "failed",
      target: payload.target,
    });
  });

  it("returns no status for a missing or removed job", async () => {
    const missingQueue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => undefined,
    } as never);
    const removedQueue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: payload,
        getState: async () => "unknown",
        name: SCAN_JOB_NAME,
      }),
    } as never);

    await expect(missingQueue.getStatus(payload.scanId)).resolves.toBeNull();
    await expect(removedQueue.getStatus(payload.scanId)).resolves.toBeNull();
  });

  it("fails closed for corrupted queue data", async () => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: { private: true },
        getState: vi.fn(),
        name: SCAN_JOB_NAME,
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).rejects.toThrow(
      "invalid job data",
    );
  });

  it("rejects queue data containing unexpected fields", async () => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: {
          ...payload,
          target: { ...payload.target, internalToken: "must-not-leak" },
        },
        getState: async () => "waiting",
        name: SCAN_JOB_NAME,
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).rejects.toThrow(
      "invalid job data",
    );
  });

  it("rejects a foreign BullMQ job name", async () => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({
        data: payload,
        getState: async () => "completed",
        name: "foreign-job",
        returnvalue: completedWorkerResult,
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).rejects.toThrow(
      "invalid job data",
    );
  });
});
