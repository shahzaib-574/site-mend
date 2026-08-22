import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScanEntryForm } from "./scan-entry-form";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const scanId = "scan-11111111-1111-4111-8111-111111111111";

function acceptedResponse(origin = "https://example.com/") {
  return Response.json(
    {
      data: {
        scanId,
        status: "queued",
        statusUrl: "/api/scans/status",
        target: { hostname: new URL(origin).hostname, origin },
      },
      message: "Your website health check is queued.",
    },
    { status: 202 },
  );
}

describe("ScanEntryForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a disabled POST-only fallback until secure client normalization is ready", () => {
    const markup = renderToString(<ScanEntryForm liveScanningEnabled />);

    expect(markup).toContain('action="/api/scans"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain("Preparing secure check");
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain("No address was sent");
  });

  it("accepts a bare public domain and explains that no live scan ran", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    await user.type(screen.getByLabelText(/website address/i), "Example.com/about");
    await user.click(screen.getByRole("button", { name: /check this address/i }));

    expect(
      screen.getByRole("heading", { name: /address confirmed for example.com/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/example.com\//i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/without fetching the site/i);
  });

  it("announces an invalid local address and keeps the input value", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.type(input, "http://localhost");
    await user.click(screen.getByRole("button", { name: /check this address/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/public domain/i);
    expect(input).toHaveValue("http://localhost");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("clears an error when the user edits the address", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.click(screen.getByRole("button", { name: /check this address/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(input, "example.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("supports keyboard submission and exposes the result as a polite status", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.type(input, "example.com{Enter}");

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAccessibleName(/address confirmed for example.com/i);
    expect(input).toHaveAttribute("aria-describedby", "website-help");
  });

  it("allows long accepted hostnames and URLs to wrap inside the status", async () => {
    const user = userEvent.setup();
    const hostname = `${"a".repeat(63)}.example.com`;
    render(<ScanEntryForm />);

    fireEvent.change(screen.getByLabelText(/website address/i), {
      target: { value: hostname },
    });
    await user.click(screen.getByRole("button", { name: /check this address/i }));

    for (const address of screen.getAllByText(new RegExp(hostname, "i"))) {
      expect(address).toHaveClass("user-address");
    }
  });

  it("keeps the preview path inert when the live UI gate is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    await user.type(screen.getByLabelText(/website address/i), "example.com");
    await user.click(screen.getByRole("button", { name: /check this address/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/without fetching/i);
  });

  it("posts only the normalized origin and navigates with a decoded bearer fragment", async () => {
    const fetchMock = vi.fn(async () => acceptedResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ScanEntryForm liveScanningEnabled />);

    const input = screen.getByLabelText(/website address/i);
    const submit = screen.getByRole("button", { name: /start health check/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(input, {
      target: {
        value: "https://example.com/private/path?token=secret#fragment",
      },
    });
    fireEvent.submit(submit.closest("form")!);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/scan#${scanId}`));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scans",
      expect.objectContaining({
        body: JSON.stringify({ url: "https://example.com/" }),
        credentials: "omit",
        method: "POST",
        redirect: "error",
        referrerPolicy: "no-referrer",
      }),
    );
    expect(input).toHaveValue("https://example.com/");
    expect(window.sessionStorage.getItem("sitemend:last-normalized-origin:v1")).toBe(
      "https://example.com/",
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("token");
    expect(document.body).not.toHaveTextContent("secret");
  });

  it("prevents duplicate jobs while a submission is in flight", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScanEntryForm liveScanningEnabled />);

    const input = screen.getByLabelText(/website address/i);
    const submit = screen.getByRole("button", { name: /start health check/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(input, { target: { value: "example.com" } });
    const form = submit.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /starting health check/i })).toBeDisabled();

    resolveResponse?.(acceptedResponse());
    await waitFor(() => expect(pushMock).toHaveBeenCalledOnce());
  });

  it("maps an exact server error to controlled copy without claiming no job exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "SCANNING_UNAVAILABLE",
              message: "redis-secret",
            },
          },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<ScanEntryForm liveScanningEnabled />);

    await user.type(screen.getByLabelText(/website address/i), "example.com");
    await user.click(screen.getByRole("button", { name: /start health check/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /temporarily unavailable/i,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/no scan was started/i);
    expect(document.body).not.toHaveTextContent("redis-secret");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "malformed JSON",
      () =>
        new Response('{"error":', {
          headers: { "Content-Type": "application/json" },
          status: 503,
        }),
    ],
    [
      "HTML",
      () =>
        new Response("<html>redis-secret</html>", {
          headers: { "Content-Type": "text/html" },
          status: 503,
        }),
    ],
    [
      "an oversized body",
      () =>
        new Response(" ".repeat(16_385), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        }),
    ],
    [
      "an extra error key",
      () =>
        Response.json(
          {
            error: {
              code: "SCANNING_UNAVAILABLE",
              detail: "redis-secret",
              message: "Controlled wire message.",
            },
          },
          { status: 503 },
        ),
    ],
    [
      "a status and code mismatch",
      () =>
        Response.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Controlled wire message.",
            },
          },
          { status: 503 },
        ),
    ],
  ] as const)("fails closed for %s", async (_description, responseFactory) => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFactory()));
    const user = userEvent.setup();
    render(<ScanEntryForm liveScanningEnabled />);

    await user.type(screen.getByLabelText(/website address/i), "example.com");
    await user.click(screen.getByRole("button", { name: /start health check/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /unreadable scan response/i,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/no scan was started/i);
    expect(document.body).not.toHaveTextContent("redis-secret");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("times out one create request without retrying or claiming it was not queued", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("The request was aborted.", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScanEntryForm liveScanningEnabled />);

    fireEvent.change(screen.getByLabelText(/website address/i), {
      target: { value: "example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /start health check/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent(/may still have been queued/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/no scan was started/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("treats a network failure as ambiguous and never retries automatically", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network failed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ScanEntryForm liveScanningEnabled />);

    await user.type(screen.getByLabelText(/website address/i), "example.com");
    await user.click(screen.getByRole("button", { name: /start health check/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/outcome is unknown/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/no scan was started/i);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("restores only an already-normalized public origin", async () => {
    window.sessionStorage.setItem(
      "sitemend:last-normalized-origin:v1",
      "https://example.com/private?token=secret",
    );

    render(<ScanEntryForm liveScanningEnabled />);

    await waitFor(() =>
      expect(window.sessionStorage.getItem("sitemend:last-normalized-origin:v1")).toBeNull(),
    );
    expect(screen.getByLabelText(/website address/i)).toHaveValue("");
    expect(document.body).not.toHaveTextContent("token");
  });
});
