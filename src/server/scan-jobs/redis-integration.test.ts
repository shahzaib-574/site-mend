import { randomUUID } from "node:crypto";

import { createIORedisClient, Queue } from "bullmq";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RedisFixedWindowStore } from "./redis-fixed-window-store";
import { BullMqScanQueue, type ScanJobPayload } from "./scan-queue";
import { DestinationLeaseManager } from "../../worker/destination-lease";

const redisTestUrl = process.env.REDIS_TEST_URL;
const describeWithRedis = redisTestUrl ? describe : describe.skip;

describeWithRedis("Redis scan-intake integration", () => {
  const testId = randomUUID();
  const queueName = `site-mend-scans-test-${testId}`;
  const queuePrefix = `sitemend-test-${testId}`;
  const rateKey = `sitemend-test:rate:${testId}`;
  let redis: Redis;
  let queue: Queue<ScanJobPayload>;

  beforeAll(async () => {
    redis = new Redis(redisTestUrl!, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });
    redis.on("error", () => undefined);
    await redis.ping();

    queue = new Queue<ScanJobPayload>(queueName, {
      connection: createIORedisClient(redis),
      prefix: queuePrefix,
    });
  });

  afterAll(async () => {
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
    }

    if (redis) {
      await redis.del(rateKey);
      await redis.quit();
    }
  });

  it("increments a fixed window atomically in Redis", async () => {
    const store = new RedisFixedWindowStore(redis);

    const first = await store.increment(rateKey, 5_000);
    const second = await store.increment(rateKey, 5_000);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(first.ttlMs).toBeGreaterThan(0);
    expect(second.ttlMs).toBeLessThanOrEqual(first.ttlMs);
  });

  it("durably adds and reads a queued BullMQ job", async () => {
    const scanQueue = new BullMqScanQueue(queue);
    const scanId = "scan-11111111-1111-4111-8111-111111111111";
    const payload: ScanJobPayload = {
      requestedAt: "2026-08-21T12:00:00.000Z",
      scanId,
      schemaVersion: 1,
      target: {
        hostname: "example.com",
        origin: "https://example.com/",
      },
    };

    await scanQueue.enqueue(payload);

    await expect(scanQueue.getStatus(scanId)).resolves.toEqual({
      queuedAt: payload.requestedAt,
      scanId,
      status: "queued",
      target: payload.target,
    });
  });

  it("serializes crawls per HMAC-keyed destination lease", async () => {
    const leases = new DestinationLeaseManager(
      redis,
      "a-worker-integration-secret-that-is-at-least-32-bytes",
    );
    const hostname = `destination-${testId}.example.com`;
    const first = await leases.acquire(hostname);

    expect(first).not.toBeNull();
    await expect(leases.acquire(hostname)).resolves.toBeNull();

    await first!.release();
    const afterRelease = await leases.acquire(hostname);
    expect(afterRelease).not.toBeNull();
    await afterRelease!.release();
  });
});
