import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_HOMEPAGE_RULES } from "@/lib/public-scan-contract";

import { PublicScanView } from "./public-scan-view";

const scanId = "scan-11111111-1111-4111-8111-111111111111";
const secondScanId = "scan-22222222-2222-4222-8222-222222222222";
const queuedAt = "2026-08-21T10:00:00.000Z";
const target = { hostname: "example.com", origin: "https://example.com/" };

function statusResponse(
  status: "failed" | "queued" | "running",
  id = scanId,
  responseTarget = target,
) {
  return Response.json({ data: { queuedAt, scanId: id, status, target: responseTarget } });
}

function completedResponse() {
  const checks = PUBLIC_HOMEPAGE_RULES.map((rule) => ({
    category: rule.category,
    evidence: [],
    finding: null,
    ruleId: rule.ruleId,
    ruleVersion: "1.0.0",
    status: "passed",
    summary: `${rule.ruleId} passed.`,
  }));

  return Response.json({
    data: {
      queuedAt,
      result: {
        completedAt: "2026-08-21T10:00:05.000Z",
        outcome: "fetched",
        report: {
          checks,
          findings: [],
          rulesetVersion: "homepage-v1",
          schemaVersion: 1,
        },
        schemaVersion: 1,
      },
      scanId,
      status: "completed",
      target,
    },
  });
}

function errorResponse(
  status: 404 | 429 | 503,
  code: "RATE_LIMITED" | "SCANNING_UNAVAILABLE" | "SCAN_NOT_FOUND",
  headers?: HeadersInit,
) {
  return Response.json(
    { error: { code, message: "Controlled wire message." } },
    { headers, status },
  );
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function changeFragment(fragment: string) {
  window.history.replaceState({}, "", `/scan#${fragment}`);
  window.dispatchEvent(new Event("hashchange"));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/scan");
});

describe("PublicScanView", () => {
  it("rejects an invalid fragment without making a status request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/scan#not-a-scan");

    render(<PublicScanView />);

    expect(
      await screen.findByRole("heading", { name: /link is incomplete or invalid/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/no status request was made/i)).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls one request at a time through queued, running, and completed, then stops", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("queued"))
      .mockResolvedValueOnce(statusResponse("running"))
      .mockResolvedValueOnce(completedResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);
    const liveRegion = screen.getByRole("status");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getAllByText(/waiting for the isolated scanner/i)).toHaveLength(2);
    expect(screen.getByRole("list", { name: /health check progress/i })).toHaveTextContent(
      /waiting for a safe check/i,
    );

    await advance(5_000);
    expect(screen.getByRole("status")).toBe(liveRegion);
    expect(screen.getAllByText(/isolated scanner is checking the homepage/i)).toHaveLength(2);

    await advance(5_000);
    expect(screen.getByRole("heading", { level: 1, name: /results for example.com/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBe(liveRegion);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText(/anyone with the link can view it/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const requestHeaders = new Headers(requestInit.headers);
    expect(requestUrl).toBe("/api/scans/status");
    expect(requestUrl).not.toContain(scanId);
    expect(requestHeaders.get("accept")).toBe("application/json");
    expect(requestHeaders.get("authorization")).toBe(`Bearer ${scanId}`);
    expect(requestInit).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(requestInit.signal).toBeInstanceOf(AbortSignal);

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses a zero-delay schedule to avoid duplicate Strict Mode probe requests", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    const fetchMock = vi.fn(async () => statusResponse("failed"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <PublicScanView />
      </StrictMode>,
    );
    await advance(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: /could not finish/i })).toBeInTheDocument();
  });

  it("honors bounded Retry-After before polling again", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(503, "SCANNING_UNAVAILABLE", { "Retry-After": "30" }),
      )
      .mockResolvedValueOnce(statusResponse("queued"));
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent(/temporarily unavailable/i);

    await advance(29_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toBe(liveRegion);
    expect(screen.getAllByText(/waiting for the isolated scanner/i)).toHaveLength(2);
  });

  it("stops on a generic not-found response", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    const fetchMock = vi.fn(async () => errorResponse(404, "SCAN_NOT_FOUND"));
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);

    expect(screen.getByRole("heading", { name: /not found or is no longer available/i })).toBeInTheDocument();
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows no partial DOM when a response has an unexpected field", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: {
          queuedAt,
          scanId,
          status: "completed",
          target,
          unexpectedPrivateResult: "redis-secret",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);

    expect(screen.getByRole("status")).toHaveTextContent(/could not be verified/i);
    expect(document.body).not.toHaveTextContent("redis-secret");
    expect(screen.queryByText(/results for/i)).not.toBeInTheDocument();
  });

  it("aborts scan A synchronously and ignores its late response after switching to scan B", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: ((response: Response) => void) | undefined;
    const secondTarget = {
      hostname: "second-site.com",
      origin: "https://second-site.com/",
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            firstSignal = init?.signal ?? undefined;
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        statusResponse("queued", secondScanId, secondTarget),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);
    expect(fetchMock).toHaveBeenCalledOnce();

    act(() => {
      changeFragment(secondScanId);
      expect(firstSignal?.aborted).toBe(true);
      resolveFirst?.(statusResponse("queued"));
    });
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("heading", { name: /checking second-site\.com/i }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Checking example.com");
    const secondHeaders = new Headers(
      (fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(secondHeaders.get("authorization")).toBe(`Bearer ${secondScanId}`);
  });

  it("ignores a stale body after the fragment becomes invalid", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    let requestSignal: AbortSignal | undefined;
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
    });
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return Promise.resolve(
        new Response(body, {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);

    act(() => {
      changeFragment("invalid-after-start");
      expect(requestSignal?.aborted).toBe(true);
      bodyController?.enqueue(
        new TextEncoder().encode(
          JSON.stringify({ data: { queuedAt, scanId, status: "queued", target } }),
        ),
      );
      bodyController?.close();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("heading", { name: /link is incomplete or invalid/i }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Checking example.com");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("aborts a request with stalled headers at the monotonic overall deadline", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>(() => {
          requestSignal = init?.signal ?? undefined;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const serverMarkup = renderToStaticMarkup(<PublicScanView />);
    expect(serverMarkup).toContain("<noscript>");
    expect(serverMarkup).toContain("JavaScript is required");
    expect(serverMarkup).toContain("No status request was made");
    expect(serverMarkup).toContain('href="/#website-check"');
    expect(serverMarkup).toContain('data-navigation="new-document"');

    render(<PublicScanView />);
    await advance(0);

    await advance(899_999);
    expect(screen.queryByRole("heading", { name: /longer than expected/i })).not.toBeInTheDocument();
    expect(requestSignal?.aborted).toBe(false);

    await advance(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(
      screen.getByRole("heading", { name: /longer than expected/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/bounded wait/i);

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("aborts a stalled response body at the monotonic overall deadline", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    let requestSignal: AbortSignal | undefined;
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
        controller.enqueue(new TextEncoder().encode('{"data":'));
      },
    });
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return Promise.resolve(
        new Response(body, {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);
    await advance(899_999);
    expect(requestSignal?.aborted).toBe(false);

    await advance(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(
      screen.getByRole("heading", { name: /longer than expected/i }),
    ).toBeInTheDocument();

    act(() => bodyController?.close());
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("heading", { name: /longer than expected/i }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("stops after the fifth transient failure and manual retry resets the counter", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    const fetchMock = vi.fn();
    for (let index = 0; index < 6; index += 1) {
      fetchMock.mockResolvedValueOnce(
        errorResponse(503, "SCANNING_UNAVAILABLE"),
      );
    }
    fetchMock.mockResolvedValueOnce(statusResponse("queued"));
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicScanView />);
    await advance(0);
    for (let index = 0; index < 4; index += 1) {
      await advance(5_000);
    }

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      screen.getAllByText(/automatic status checks stopped after five/i),
    ).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(
      /automatic status checks stopped after five/i,
    );

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    act(() => screen.getByRole("button", { name: /check status again/i }).click());
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(
      screen.queryAllByText(/automatic status checks stopped after five/i),
    ).toHaveLength(0);

    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(screen.getAllByText(/waiting for the isolated scanner/i)).toHaveLength(2);
  });

  it("aborts an in-flight request when the view unmounts", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/scan#${scanId}`);
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>(() => {
          requestSignal = init?.signal ?? undefined;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<PublicScanView />);
    await advance(0);
    expect(requestSignal?.aborted).toBe(false);

    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
  });

  it("provides accessible progress and recovery controls", async () => {
    window.history.replaceState({}, "", `/scan#${scanId}`);
    const fetchMock = vi.fn(async () =>
      errorResponse(429, "RATE_LIMITED", { "Retry-After": "5" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<PublicScanView />);

    expect(
      await screen.findByRole("heading", { name: /checking is paused for a moment/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/paused for a moment/i);
    const retry = screen.getByRole("button", { name: /check status again/i });
    await user.tab();
    expect(retry).toHaveFocus();

    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
});
