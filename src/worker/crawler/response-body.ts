import { createHash } from "node:crypto";

import { CrawlerError } from "./errors";
import type {
  HttpResponseHeaders,
  PinnedHttpResponse,
} from "./pinned-http-client";

function readSingleHeader(
  headers: HttpResponseHeaders,
  name: string,
): string | undefined {
  const value = headers[name];

  if (typeof value !== "string" && value !== undefined) {
    if (value.length !== 1) {
      throw new CrawlerError(
        "FETCH_FAILED",
        "The website returned ambiguous response headers.",
      );
    }

    return value[0];
  }

  return value;
}

export function readLocationHeader(headers: HttpResponseHeaders): string {
  const location = readSingleHeader(headers, "location")?.trim();

  if (!location) {
    throw new CrawlerError(
      "INVALID_REDIRECT",
      "The website returned a redirect without a valid destination.",
    );
  }

  return location;
}

export function readMediaType(headers: HttpResponseHeaders): string | null {
  const contentType = readSingleHeader(headers, "content-type");

  if (!contentType) {
    return null;
  }

  return contentType.split(";", 1)[0].trim().toLowerCase() || null;
}

function assertIdentityEncoding(headers: HttpResponseHeaders): void {
  const encoding = readSingleHeader(headers, "content-encoding")
    ?.trim()
    .toLowerCase();

  if (encoding && encoding !== "identity") {
    throw new CrawlerError(
      "UNSUPPORTED_CONTENT_ENCODING",
      "The website returned a compressed response that cannot be scanned safely.",
    );
  }
}

function assertContentLength(
  headers: HttpResponseHeaders,
  maxBytes: number,
): void {
  const contentLength = readSingleHeader(headers, "content-length")?.trim();

  if (!contentLength) {
    return;
  }

  if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes) {
    throw new CrawlerError(
      "RESPONSE_TOO_LARGE",
      "The website response is too large to scan safely.",
    );
  }
}

export interface BodyEvidence {
  bytes: number;
  captured?: Uint8Array;
  sha256: string;
}

export async function readBoundedBody(
  response: PinnedHttpResponse,
  options: {
    capture: boolean;
    maxBytes: number;
    signal: AbortSignal;
  },
): Promise<BodyEvidence> {
  assertIdentityEncoding(response.headers);
  assertContentLength(response.headers, options.maxBytes);

  const hash = createHash("sha256");
  const captured: Uint8Array[] = [];
  let bytes = 0;

  try {
    for await (const value of response.body) {
      if (options.signal.aborted) {
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : new CrawlerError(
              "CRAWL_ABORTED",
              "The website scan was cancelled.",
            );
      }

      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;

      if (bytes > options.maxBytes) {
        throw new CrawlerError(
          "RESPONSE_TOO_LARGE",
          "The website response is too large to scan safely.",
        );
      }

      hash.update(chunk);

      if (options.capture) {
        captured.push(chunk);
      }
    }
  } catch (error) {
    if (error instanceof CrawlerError) {
      throw error;
    }

    throw new CrawlerError(
      "FETCH_FAILED",
      "The website response could not be read safely.",
      { cause: error },
    );
  }

  return {
    bytes,
    ...(options.capture
      ? { captured: Buffer.concat(captured, bytes) }
      : undefined),
    sha256: hash.digest("hex"),
  };
}

export function requireMediaType(
  response: PinnedHttpResponse,
  allowed: ReadonlyArray<string>,
): string {
  const mediaType = readMediaType(response.headers);

  if (!mediaType || !allowed.includes(mediaType)) {
    throw new CrawlerError(
      "UNSUPPORTED_CONTENT_TYPE",
      "The website returned a response type that cannot be scanned safely.",
    );
  }

  return mediaType;
}
