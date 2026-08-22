import { ScanAdmissionError } from "@/server/scan-admission";

import { readTrustedClientIp } from "./client-identity";
import { RateLimitExceededError } from "./errors";
import { getScanRuntime, type ScanRuntime } from "./runtime";

const MAX_CREATE_SCAN_BODY_BYTES = 4_096;
const PUBLIC_SCAN_STATUS_PATH = "/api/scans/status";
const BEARER_PREFIX_LENGTH = "Bearer ".length;
const PUBLIC_SCAN_ID_LENGTH =
  "scan-00000000-0000-4000-8000-000000000000".length;
const scanIdPattern =
  /^scan-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type ScanRuntimeProvider = () => ScanRuntime;

class RequestBodyError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "PAYLOAD_TOO_LARGE"
      | "UNSUPPORTED_MEDIA_TYPE",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  additionalHeaders?: HeadersInit,
): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return Response.json(body, { headers, status });
}

function statusJsonResponse(
  body: unknown,
  status: number,
  additionalHeaders?: HeadersInit,
): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("Vary", "Authorization");

  return jsonResponse(body, status, headers);
}

function scanNotFoundResponse(): Response {
  return statusJsonResponse(
    {
      error: {
        code: "SCAN_NOT_FOUND",
        message: "That scan could not be found.",
      },
    },
    404,
  );
}

function readBearerScanId(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (
    authorization === null ||
    authorization.length !== BEARER_PREFIX_LENGTH + PUBLIC_SCAN_ID_LENGTH ||
    authorization.slice(0, BEARER_PREFIX_LENGTH).toLowerCase() !== "bearer "
  ) {
    return null;
  }

  const scanId = authorization.slice(BEARER_PREFIX_LENGTH);
  return scanIdPattern.test(scanId) ? scanId : null;
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new RequestBodyError(
        "INVALID_REQUEST",
        "The request body length is invalid.",
        400,
      );
    }

    if (Number(contentLength) > MAX_CREATE_SCAN_BODY_BYTES) {
      throw new RequestBodyError(
        "PAYLOAD_TOO_LARGE",
        "The scan request is too large.",
        413,
      );
    }
  }

  if (request.body === null) {
    throw new RequestBodyError(
      "INVALID_REQUEST",
      "Send a JSON object containing one website URL.",
      400,
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_CREATE_SCAN_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyError(
          "PAYLOAD_TOO_LARGE",
          "The scan request is too large.",
          413,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

async function readCreateScanInput(request: Request): Promise<string> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (mediaType !== "application/json") {
    throw new RequestBodyError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Send the website address as JSON.",
      415,
    );
  }

  const bytes = await readBoundedBody(request);
  let parsed: unknown;

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    throw new RequestBodyError(
      "INVALID_REQUEST",
      "Send valid JSON containing one website URL.",
      400,
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !("url" in parsed) ||
    typeof parsed.url !== "string"
  ) {
    throw new RequestBodyError(
      "INVALID_REQUEST",
      "Send a JSON object containing one website URL.",
      400,
    );
  }

  return parsed.url;
}

function admissionStatus(error: ScanAdmissionError): number {
  return error.code === "INVALID_TARGET" || error.code === "NON_PUBLIC_ADDRESS"
    ? 400
    : 422;
}

function errorResponse(error: unknown): Response {
  if (error instanceof RequestBodyError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }

  if (error instanceof RateLimitExceededError) {
    return jsonResponse(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many scan requests. Please try again later.",
        },
      },
      429,
      { "Retry-After": String(error.retryAfterSeconds) },
    );
  }

  if (error instanceof ScanAdmissionError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      admissionStatus(error),
    );
  }

  return jsonResponse(
    {
      error: {
        code: "SCANNING_UNAVAILABLE",
        message: "Website scanning is temporarily unavailable. Try again soon.",
      },
    },
    503,
    { "Retry-After": "30" },
  );
}

export async function handleCreateScanRequest(
  request: Request,
  provideRuntime: ScanRuntimeProvider = getScanRuntime,
): Promise<Response> {
  try {
    const input = await readCreateScanInput(request);
    const runtime = provideRuntime();
    const clientIp = readTrustedClientIp(
      request.headers,
      runtime.clientIpHeader,
    );
    const submitted = await runtime.service.submit(input, clientIp);
    const publicSubmission = {
      scanId: submitted.scanId,
      status: submitted.status,
      statusUrl: PUBLIC_SCAN_STATUS_PATH,
      target: {
        hostname: submitted.target.hostname,
        origin: submitted.target.origin,
      },
    };

    return jsonResponse(
      {
        data: publicSubmission,
        message: "Your website health check is queued.",
      },
      202,
      { Location: PUBLIC_SCAN_STATUS_PATH },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleGetScanRequest(
  request: Request,
  provideRuntime: ScanRuntimeProvider = getScanRuntime,
): Promise<Response> {
  const scanId = readBearerScanId(request);

  if (scanId === null) return scanNotFoundResponse();

  try {
    const runtime = provideRuntime();
    const clientIp = readTrustedClientIp(
      request.headers,
      runtime.clientIpHeader,
    );
    const scan = await runtime.service.getStatus(scanId, clientIp);

    if (scan === null) {
      return scanNotFoundResponse();
    }

    return statusJsonResponse({ data: scan }, 200);
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Vary", "Authorization");
    return response;
  }
}
