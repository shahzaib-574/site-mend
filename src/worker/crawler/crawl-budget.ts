import { CrawlerError } from "./errors";

export const CRAWL_LIMITS = {
  bodyTimeoutMs: 8_000,
  connectTimeoutMs: 5_000,
  headersTimeoutMs: 8_000,
  homepageBytes: 2 * 1_024 * 1_024,
  maxHeaderBytes: 16 * 1_024,
  redirects: 5,
  requests: 8,
  robotsBytes: 500 * 1_024,
  wallTimeMs: 30_000,
} as const;

export class CrawlBudget {
  private redirectsUsed = 0;
  private requestsUsed = 0;

  useRedirect(): void {
    if (this.redirectsUsed >= CRAWL_LIMITS.redirects) {
      throw new CrawlerError(
        "REDIRECT_LIMIT",
        "The website redirected too many times to scan safely.",
      );
    }

    this.redirectsUsed += 1;
  }

  useRequest(): void {
    if (this.requestsUsed >= CRAWL_LIMITS.requests) {
      throw new CrawlerError(
        "REQUEST_LIMIT",
        "The website needed too many requests to scan safely.",
      );
    }

    this.requestsUsed += 1;
  }
}

export interface CrawlSignal {
  dispose(): void;
  signal: AbortSignal;
}

export function createCrawlSignal(parent?: AbortSignal): CrawlSignal {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    timeoutController.abort(
      new CrawlerError(
        "CRAWL_TIMEOUT",
        "The website took too long to scan safely.",
      ),
    );
  }, CRAWL_LIMITS.wallTimeMs);

  return {
    dispose: () => clearTimeout(timeout),
    signal: parent
      ? AbortSignal.any([parent, timeoutController.signal])
      : timeoutController.signal,
  };
}

export async function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => undefined);
    throw signal.reason instanceof Error
      ? signal.reason
      : new CrawlerError("CRAWL_ABORTED", "The website scan was cancelled.");
  }

  let removeAbortListener: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new CrawlerError(
              "CRAWL_ABORTED",
              "The website scan was cancelled.",
            ),
      );
    };

    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([operation, aborted]);
  } finally {
    removeAbortListener();
  }
}
