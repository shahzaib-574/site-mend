import type { Job } from "bullmq";

import {
  parseScanJobPayload,
  SCAN_JOB_NAME,
  type ScanJobPayload,
} from "../lib/scan-job-contract";
import { abortable, createCrawlSignal } from "./crawler/crawl-budget";
import { CrawlerError } from "./crawler/errors";
import {
  HomepageCrawler,
  type HomepageCrawlResult,
} from "./crawler/homepage-crawler";
import type { DestinationLeaseManager } from "./destination-lease";

interface ProcessorDependencies {
  crawler: Pick<HomepageCrawler, "crawl">;
  leases: Pick<DestinationLeaseManager, "acquire">;
}

export function createScanJobProcessor(dependencies: ProcessorDependencies) {
  return async (
    job: Job<ScanJobPayload, HomepageCrawlResult>,
    _token?: string,
    signal?: AbortSignal,
  ): Promise<HomepageCrawlResult> => {
    let payload: ScanJobPayload;

    try {
      payload = parseScanJobPayload(job.data);
    } catch (error) {
      throw new CrawlerError(
        "INVALID_JOB",
        "The worker received invalid scan job data.",
        { cause: error },
      );
    }

    if (job.name !== SCAN_JOB_NAME || job.id !== payload.scanId) {
      throw new CrawlerError(
        "INVALID_JOB",
        "The worker received an inconsistent scan job.",
      );
    }

    const crawlSignal = createCrawlSignal(signal);

    try {
      const lease = await abortable(
        dependencies.leases.acquire(payload.target.hostname),
        crawlSignal.signal,
      );

      if (!lease) {
        throw new CrawlerError(
          "DESTINATION_BUSY",
          "That website is already being scanned. Try again shortly.",
        );
      }

      try {
        const result = await dependencies.crawler.crawl(
          payload,
          crawlSignal.signal,
        );

        if (crawlSignal.signal.aborted) {
          throw crawlSignal.signal.reason instanceof Error
            ? crawlSignal.signal.reason
            : new CrawlerError(
                "CRAWL_ABORTED",
                "The website scan was cancelled.",
              );
        }

        return result;
      } finally {
        await abortable(lease.release(), crawlSignal.signal);
      }
    } finally {
      crawlSignal.dispose();
    }
  };
}
