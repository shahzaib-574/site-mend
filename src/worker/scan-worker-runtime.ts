import {
  createIORedisClient,
  Worker,
  type Processor,
} from "bullmq";
import Redis from "ioredis";

import {
  SCAN_QUEUE_NAME,
  type ScanJobPayload,
} from "../lib/scan-job-contract";
import { HomepageCrawler, type HomepageCrawlResult } from "./crawler/homepage-crawler";
import { DestinationLeaseManager } from "./destination-lease";
import { readScanWorkerConfig } from "./runtime-config";
import { createScanJobProcessor } from "./scan-job-processor";

export interface RunningScanWorker {
  close(): Promise<void>;
}

export interface ScanWorkerRuntimeOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  onError?: (error: Error) => void;
}

export async function startScanWorker(
  options: ScanWorkerRuntimeOptions = {},
): Promise<RunningScanWorker> {
  const config = readScanWorkerConfig(options.environment);
  const onError = options.onError ?? (() => undefined);
  const workerRedis = new Redis(config.redisUrl, {
    connectTimeout: 5_000,
    maxRetriesPerRequest: null,
  });
  const leaseRedis = new Redis(config.redisUrl, {
    commandTimeout: 2_000,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
  });
  workerRedis.on("error", () => undefined);
  leaseRedis.on("error", () => undefined);

  try {
    await leaseRedis.ping();
  } catch (error) {
    workerRedis.disconnect();
    leaseRedis.disconnect();
    throw error;
  }

  const crawler = new HomepageCrawler();
  const leases = new DestinationLeaseManager(leaseRedis, config.keySecret);
  const processor = createScanJobProcessor({ crawler, leases }) as Processor<
    ScanJobPayload,
    HomepageCrawlResult
  >;
  const worker = new Worker<ScanJobPayload, HomepageCrawlResult>(
    SCAN_QUEUE_NAME,
    processor,
    {
      connection: createIORedisClient(workerRedis),
      concurrency: config.concurrency,
      lockDuration: 45_000,
      maxStalledCount: 1,
      name: "site-mend-homepage-crawler",
      prefix: "sitemend",
    },
  );
  worker.on("error", onError);

  try {
    await worker.waitUntilReady();
  } catch (error) {
    await worker.close(true).catch(() => undefined);
    workerRedis.disconnect();
    leaseRedis.disconnect();
    throw error;
  }

  let closed = false;

  return {
    close: async () => {
      if (closed) {
        return;
      }

      closed = true;

      try {
        await worker.close();
      } finally {
        await Promise.allSettled([workerRedis.quit(), leaseRedis.quit()]);
      }
    },
  };
}
