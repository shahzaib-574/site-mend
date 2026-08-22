import { describe, expect, it, vi } from "vitest";

import type {
  RateLimitPolicy,
  RateLimitScope,
} from "./rate-limiter";
import { ScanJobService } from "./scan-job-service";
import type {
  ScanJobPayload,
  ScanQueue,
  ScanStatusRecord,
} from "./scan-queue";

const admittedTarget = {
  addresses: [{ address: "1.1.1.1", family: 4 as const }],
  hostname: "example.com",
  origin: "https://example.com/",
  url: "https://example.com/",
};

function createDependencies() {
  const enqueue = vi.fn(async (payload: ScanJobPayload) => {
    void payload;
  });
  const getStatus = vi.fn(
    async (scanId: string): Promise<ScanStatusRecord | null> => {
      void scanId;
      return null;
    },
  );
  const consume = vi.fn(
    async (
      scope: RateLimitScope,
      identity: string,
      policy: RateLimitPolicy,
    ) => {
      void scope;
      void identity;
      void policy;
      return {
        allowed: true,
        remaining: 4,
        retryAfterSeconds: 60,
      };
    },
  );
  const admitTarget = vi.fn(async (input: string) => {
    void input;
    return admittedTarget;
  });

  return {
    admitTarget,
    createId: () => "11111111-1111-4111-8111-111111111111",
    now: () => new Date("2026-08-21T12:00:00.000Z"),
    queue: { enqueue, getStatus } satisfies ScanQueue,
    rateLimiter: { consume },
  };
}

describe("ScanJobService", () => {
  it("rate-limits, admits, and enqueues a minimal versioned target", async () => {
    const dependencies = createDependencies();
    const service = new ScanJobService(dependencies);

    await expect(
      service.submit(
        "https://example.com/private/path?token=secret#fragment",
        "203.0.113.9",
      ),
    ).resolves.toEqual({
      scanId: "scan-11111111-1111-4111-8111-111111111111",
      status: "queued",
      statusUrl: "/api/scans/status",
      target: {
        hostname: "example.com",
        origin: "https://example.com/",
      },
    });

    expect(dependencies.rateLimiter.consume.mock.calls.map((call) => call[0])).toEqual(
      ["scan-global", "scan-client", "scan-target"],
    );
    expect(dependencies.rateLimiter.consume.mock.calls.map((call) => call[2])).toEqual(
      [
        { limit: 60, windowMs: 60_000 },
        { limit: 5, windowMs: 600_000 },
        { limit: 3, windowMs: 3_600_000 },
      ],
    );
    expect(dependencies.admitTarget).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/",
    );
    expect(dependencies.queue.enqueue).toHaveBeenCalledWith({
      requestedAt: "2026-08-21T12:00:00.000Z",
      scanId: "scan-11111111-1111-4111-8111-111111111111",
      schemaVersion: 1,
      target: {
        hostname: "example.com",
        origin: "https://example.com/",
      },
    });

    const queuedJson = JSON.stringify(
      dependencies.queue.enqueue.mock.calls[0]?.[0],
    );
    expect(queuedJson).not.toContain("203.0.113.9");
    expect(queuedJson).not.toContain("1.1.1.1");
    expect(queuedJson).not.toContain("token");
    expect(queuedJson).not.toContain("private/path");
  });

  it("consumes request limits but rejects an invalid URL before target or DNS work", async () => {
    const dependencies = createDependencies();
    const service = new ScanJobService(dependencies);

    await expect(service.submit("http://localhost", "203.0.113.9")).rejects.toMatchObject(
      { code: "INVALID_TARGET" },
    );
    expect(dependencies.rateLimiter.consume.mock.calls.map((call) => call[0])).toEqual(
      ["scan-global", "scan-client"],
    );
    expect(dependencies.admitTarget).not.toHaveBeenCalled();
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("stops before DNS and queue work when a target limit is exceeded", async () => {
    const dependencies = createDependencies();
    dependencies.rateLimiter.consume.mockImplementation(
      async (scope, identity, policy) => {
        void identity;
        void policy;
        return {
          allowed: scope !== "scan-target",
          remaining: 0,
          retryAfterSeconds: 900,
        };
      },
    );
    const service = new ScanJobService(dependencies);

    await expect(
      service.submit("https://example.com", "203.0.113.9"),
    ).rejects.toMatchObject({ retryAfterSeconds: 900 });
    expect(dependencies.admitTarget).not.toHaveBeenCalled();
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("fails closed when admission returns a different target", async () => {
    const dependencies = createDependencies();
    dependencies.admitTarget.mockResolvedValue({
      ...admittedTarget,
      hostname: "different.example",
      origin: "https://different.example/",
    });
    const service = new ScanJobService(dependencies);

    await expect(
      service.submit("https://example.com", "203.0.113.9"),
    ).rejects.toThrow("unexpected target");
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    "11111111-1111-1111-8111-111111111111",
    "11111111-1111-4111-8111-11111111111A",
  ])("rejects a generated ID outside lowercase UUIDv4: %s", async (generatedId) => {
    const dependencies = createDependencies();
    dependencies.createId = () => generatedId;
    const service = new ScanJobService(dependencies);

    await expect(
      service.submit("https://example.com", "203.0.113.9"),
    ).rejects.toThrow("invalid ID");
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("applies status limits before reading the queue", async () => {
    const dependencies = createDependencies();
    dependencies.queue.getStatus.mockResolvedValue({
      queuedAt: "2026-08-21T12:00:00.000Z",
      scanId: "scan-11111111-1111-4111-8111-111111111111",
      status: "queued",
      target: {
        hostname: admittedTarget.hostname,
        origin: admittedTarget.origin,
      },
    });
    const service = new ScanJobService(dependencies);

    await service.getStatus(
      "scan-11111111-1111-4111-8111-111111111111",
      "203.0.113.9",
    );

    expect(dependencies.rateLimiter.consume.mock.calls.map((call) => call[0])).toEqual(
      ["status-global", "status-client"],
    );
    expect(dependencies.queue.getStatus).toHaveBeenCalledOnce();
  });
});
