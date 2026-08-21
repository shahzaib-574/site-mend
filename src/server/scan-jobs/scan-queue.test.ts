import { describe, expect, it, vi } from "vitest";

import {
  BullMqScanQueue,
  parseScanJobPayload,
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
    ["completed", "completed"],
    ["failed", "failed"],
  ] as const)("maps BullMQ state %s to %s", async (state, expected) => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({ data: payload, getState: async () => state }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).resolves.toEqual({
      queuedAt: payload.requestedAt,
      scanId: payload.scanId,
      status: expected,
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
      getJob: async () => ({ data: payload, getState: async () => "unknown" }),
    } as never);

    await expect(missingQueue.getStatus(payload.scanId)).resolves.toBeNull();
    await expect(removedQueue.getStatus(payload.scanId)).resolves.toBeNull();
  });

  it("fails closed for corrupted queue data", async () => {
    const queue = new BullMqScanQueue({
      add: vi.fn(),
      getJob: async () => ({ data: { private: true }, getState: vi.fn() }),
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
      }),
    } as never);

    await expect(queue.getStatus(payload.scanId)).rejects.toThrow(
      "invalid job data",
    );
  });
});
