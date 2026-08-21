import { describe, expect, it, vi } from "vitest";

import { ScanAdmissionError } from "@/server/scan-admission";

import { handleCreateScanRequest, handleGetScanRequest } from "./api-handlers";
import { RateLimitExceededError } from "./errors";
import type { ScanRuntime } from "./runtime";

const scanId = "scan-11111111-1111-4111-8111-111111111111";

function createRuntime() {
  const submit = vi.fn(async () => ({
    scanId,
    status: "queued" as const,
    statusUrl: `/api/scans/${scanId}`,
    target: { hostname: "example.com", origin: "https://example.com/" },
  }));
  const getStatus = vi.fn(async () => ({
    queuedAt: "2026-08-21T12:00:00.000Z",
    scanId,
    status: "queued" as const,
    target: { hostname: "example.com", origin: "https://example.com/" },
  }));

  return {
    clientIpHeader: "x-sitemend-client-ip",
    service: { submit, getStatus },
  } as unknown as ScanRuntime;
}

function createPostRequest(body: BodyInit, headers?: HeadersInit): Request {
  return new Request("https://sitemend.example/api/scans", {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-SiteMend-Client-IP": "203.0.113.9",
      ...headers,
    },
    method: "POST",
  });
}

describe("handleCreateScanRequest", () => {
  it("returns a queued scan with no-store and location headers", async () => {
    const runtime = createRuntime();
    const response = await handleCreateScanRequest(
      createPostRequest(JSON.stringify({ url: "example.com" })),
      () => runtime,
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBe(`/api/scans/${scanId}`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      data: { scanId, status: "queued" },
      message: "Your website health check is queued.",
    });
    expect(runtime.service.submit).toHaveBeenCalledExactlyOnceWith(
      "example.com",
      "203.0.113.9",
    );
  });

  it.each([
    [
      createPostRequest("not-json"),
      400,
      "INVALID_REQUEST",
    ],
    [
      createPostRequest(JSON.stringify({ url: "example.com", extra: true })),
      400,
      "INVALID_REQUEST",
    ],
    [
      createPostRequest(JSON.stringify({ url: 42 })),
      400,
      "INVALID_REQUEST",
    ],
    [
      createPostRequest("{}", { "Content-Type": "text/plain" }),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [
      createPostRequest("x".repeat(4_097)),
      413,
      "PAYLOAD_TOO_LARGE",
    ],
    [
      createPostRequest("{}", { "Content-Length": "not-a-number" }),
      400,
      "INVALID_REQUEST",
    ],
  ])("returns a bounded body error", async (request, status, code) => {
    const runtime = createRuntime();
    const response = await handleCreateScanRequest(request, () => runtime);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(runtime.service.submit).not.toHaveBeenCalled();
  });

  it("fails closed when the trusted client identity is missing", async () => {
    const runtime = createRuntime();
    const request = new Request("https://sitemend.example/api/scans", {
      body: JSON.stringify({ url: "example.com" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const response = await handleCreateScanRequest(request, () => runtime);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SCANNING_UNAVAILABLE",
        message: "Website scanning is temporarily unavailable. Try again soon.",
      },
    });
    expect(runtime.service.submit).not.toHaveBeenCalled();
  });

  it("returns Retry-After when a distributed limit is exceeded", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.service.submit).mockRejectedValue(
      new RateLimitExceededError(321),
    );

    const response = await handleCreateScanRequest(
      createPostRequest(JSON.stringify({ url: "example.com" })),
      () => runtime,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("321");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });

  it.each([
    [new ScanAdmissionError("INVALID_TARGET", "Invalid target."), 400],
    [new ScanAdmissionError("DNS_LOOKUP_TIMEOUT", "DNS timed out."), 422],
  ])("returns a safe admission error", async (error, status) => {
    const runtime = createRuntime();
    vi.mocked(runtime.service.submit).mockRejectedValue(error);

    const response = await handleCreateScanRequest(
      createPostRequest(JSON.stringify({ url: "example.com" })),
      () => runtime,
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code: error.code, message: error.message },
    });
  });

  it("does not disclose infrastructure errors", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.service.submit).mockRejectedValue(
      new Error("redis://user:secret@private-host:6379"),
    );

    const response = await handleCreateScanRequest(
      createPostRequest(JSON.stringify({ url: "example.com" })),
      () => runtime,
    );
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(body).not.toContain("redis");
    expect(body).not.toContain("secret");
    expect(body).not.toContain("private-host");
  });
});

describe("handleGetScanRequest", () => {
  function createGetRequest(): Request {
    return new Request(`https://sitemend.example/api/scans/${scanId}`, {
      headers: { "X-SiteMend-Client-IP": "203.0.113.9" },
    });
  }

  it("returns the small public scan status", async () => {
    const runtime = createRuntime();
    const response = await handleGetScanRequest(
      createGetRequest(),
      scanId,
      () => runtime,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        queuedAt: "2026-08-21T12:00:00.000Z",
        scanId,
        status: "queued",
        target: { hostname: "example.com", origin: "https://example.com/" },
      },
    });
    expect(runtime.service.getStatus).toHaveBeenCalledExactlyOnceWith(
      scanId,
      "203.0.113.9",
    );
  });

  it("returns 404 without initializing runtime for an invalid scan ID", async () => {
    const provideRuntime = vi.fn(() => createRuntime());
    const response = await handleGetScanRequest(
      createGetRequest(),
      "../../private",
      provideRuntime,
    );

    expect(response.status).toBe(404);
    expect(provideRuntime).not.toHaveBeenCalled();
  });

  it("returns 404 when the durable job no longer exists", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.service.getStatus).mockResolvedValue(null);

    const response = await handleGetScanRequest(
      createGetRequest(),
      scanId,
      () => runtime,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SCAN_NOT_FOUND" },
    });
  });
});
