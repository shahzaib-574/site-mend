import { createIORedisClient, Queue } from "bullmq";
import Redis from "ioredis";

import { HashedFixedWindowRateLimiter } from "./rate-limiter";
import { RedisFixedWindowStore } from "./redis-fixed-window-store";
import { readScanRuntimeConfig } from "./runtime-config";
import { ScanJobService } from "./scan-job-service";
import {
  BullMqScanQueue,
  SCAN_QUEUE_NAME,
  type ScanJobPayload,
} from "./scan-queue";

export interface ScanRuntime {
  clientIpHeader: string;
  service: ScanJobService;
}

function createScanRuntime(): ScanRuntime {
  const config = readScanRuntimeConfig();
  const redis = new Redis(config.redisUrl, {
    commandTimeout: 2_000,
    connectTimeout: 2_000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  // A listener prevents EventEmitter's special `error` event from becoming an
  // uncaught exception. Request handlers still fail closed on command errors.
  redis.on("error", () => undefined);

  const queueConnection = createIORedisClient(redis);
  const queue = new Queue<ScanJobPayload>(SCAN_QUEUE_NAME, {
    connection: queueConnection,
    prefix: "sitemend",
  });
  const scanQueue = new BullMqScanQueue(queue);
  const rateLimiter = new HashedFixedWindowRateLimiter(
    new RedisFixedWindowStore(redis),
    config.rateLimitKeySecret,
  );

  return {
    clientIpHeader: config.clientIpHeader,
    service: new ScanJobService({ queue: scanQueue, rateLimiter }),
  };
}

const runtimeState = globalThis as typeof globalThis & {
  siteMendScanRuntime?: ScanRuntime;
};

export function getScanRuntime(): ScanRuntime {
  runtimeState.siteMendScanRuntime ??= createScanRuntime();
  return runtimeState.siteMendScanRuntime;
}
