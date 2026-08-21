export type CrawlerErrorCode =
  | "CRAWL_ABORTED"
  | "CRAWL_TIMEOUT"
  | "DESTINATION_BUSY"
  | "FETCH_FAILED"
  | "INVALID_JOB"
  | "INVALID_REDIRECT"
  | "REDIRECT_LIMIT"
  | "REQUEST_LIMIT"
  | "RESPONSE_TOO_LARGE"
  | "ROBOTS_UNAVAILABLE"
  | "SOCKET_MISMATCH"
  | "UNSUPPORTED_CONTENT_ENCODING"
  | "UNSUPPORTED_CONTENT_TYPE";

export class CrawlerError extends Error {
  readonly code: CrawlerErrorCode;

  constructor(code: CrawlerErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CrawlerError";
    this.code = code;
  }
}

export function toCrawlerError(error: unknown): CrawlerError {
  if (error instanceof CrawlerError) {
    return error;
  }

  return new CrawlerError(
    "FETCH_FAILED",
    "The website could not be fetched safely.",
    { cause: error },
  );
}
