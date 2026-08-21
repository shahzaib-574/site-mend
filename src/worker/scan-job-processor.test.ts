import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import {
  SCAN_JOB_NAME,
  type ScanJobPayload,
} from "../server/scan-jobs/scan-queue";
import type { HomepageCrawlResult } from "./crawler/homepage-crawler";
import { createScanJobProcessor } from "./scan-job-processor";

const payload: ScanJobPayload = {
  requestedAt: "2026-08-21T12:00:00.000Z",
  scanId: "scan-11111111-1111-4111-8111-111111111111",
  schemaVersion: 1,
  target: {
    hostname: "example.com",
    origin: "https://example.com/",
  },
};

const result: HomepageCrawlResult = {
  completedAt: "2026-08-21T12:01:00.000Z",
  homepage: null,
  blockedAt: "https://example.com/",
  outcome: "blocked-by-robots",
  robots: [],
  scanId: payload.scanId,
  schemaVersion: 1,
};

function job(
  data: unknown = payload,
  options: { id?: string; name?: string } = {},
): Job<ScanJobPayload, HomepageCrawlResult> {
  return {
    data,
    id: options.id ?? payload.scanId,
    name: options.name ?? SCAN_JOB_NAME,
  } as Job<ScanJobPayload, HomepageCrawlResult>;
}

describe("scan job processor", () => {
  it("holds one destination lease around the crawl and passes cancellation", async () => {
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async () => ({ release }));
    const crawl = vi.fn(async () => result);
    const processor = createScanJobProcessor({
      crawler: { crawl },
      leases: { acquire },
    });
    const signal = new AbortController().signal;

    await expect(processor(job(), undefined, signal)).resolves.toBe(result);

    expect(acquire).toHaveBeenCalledWith("example.com");
    expect(crawl).toHaveBeenCalledWith(payload, expect.any(AbortSignal));
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the destination when the crawl fails", async () => {
    const release = vi.fn(async () => undefined);
    const processor = createScanJobProcessor({
      crawler: { crawl: vi.fn(async () => Promise.reject(new Error("failed"))) },
      leases: { acquire: vi.fn(async () => ({ release })) },
    });

    await expect(processor(job())).rejects.toThrow("failed");
    expect(release).toHaveBeenCalledOnce();
  });

  it("fails when another worker owns the destination", async () => {
    const crawl = vi.fn();
    const processor = createScanJobProcessor({
      crawler: { crawl },
      leases: { acquire: vi.fn(async () => null) },
    });

    await expect(processor(job())).rejects.toMatchObject({
      code: "DESTINATION_BUSY",
    });
    expect(crawl).not.toHaveBeenCalled();
  });

  it.each([
    job({ private: true }),
    job(payload, { id: "scan-22222222-2222-4222-8222-222222222222" }),
    job(payload, { name: "different-job" }),
  ])("rejects invalid or inconsistent queue jobs", async (unsafeJob) => {
    const processor = createScanJobProcessor({
      crawler: { crawl: vi.fn() },
      leases: { acquire: vi.fn() },
    });

    await expect(processor(unsafeJob)).rejects.toMatchObject({
      code: "INVALID_JOB",
    });
  });
});
