import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { PinnedHttpResponse } from "./pinned-http-client";
import {
  readBoundedBody,
  readLocationHeader,
  requireMediaType,
} from "./response-body";

function response(
  chunks: ReadonlyArray<string>,
  headers: Record<string, string | string[]> = {},
): PinnedHttpResponse {
  return {
    body: (async function* () {
      for (const chunk of chunks) {
        yield Buffer.from(chunk);
      }
    })(),
    dispose: vi.fn(),
    headers,
    statusCode: 200,
  };
}

describe("bounded response handling", () => {
  it("streams a hash and optional bounded capture", async () => {
    const observed: string[] = [];
    const result = await readBoundedBody(
      response(["hello", " world"], { "content-length": "11" }),
      {
        capture: true,
        maxBytes: 11,
        onChunk: (chunk) => observed.push(Buffer.from(chunk).toString()),
        signal: new AbortController().signal,
      },
    );

    expect(result.bytes).toBe(11);
    expect(Buffer.from(result.captured!).toString()).toBe("hello world");
    expect(observed).toEqual(["hello", " world"]);
    expect(result.sha256).toBe(
      createHash("sha256").update("hello world").digest("hex"),
    );
  });

  it.each([
    [response(["12345"], { "content-length": "6" }), "RESPONSE_TOO_LARGE"],
    [response(["123456"]), "RESPONSE_TOO_LARGE"],
    [response(["ok"], { "content-encoding": "gzip" }), "UNSUPPORTED_CONTENT_ENCODING"],
  ] as const)("rejects unsafe response bodies", async (unsafe, code) => {
    await expect(
      readBoundedBody(unsafe, {
        capture: false,
        maxBytes: 5,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code });
  });

  it("requires one approved media type", () => {
    expect(
      requireMediaType(
        response([], { "content-type": "text/html; charset=utf-8" }),
        ["text/html"],
      ),
    ).toBe("text/html");

    expect(() =>
      requireMediaType(
        response([], { "content-type": "application/octet-stream" }),
        ["text/html"],
      ),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_CONTENT_TYPE" }));
  });

  it("wraps body stream implementation details", async () => {
    const unsafe: PinnedHttpResponse = {
      body: (async function* () {
        yield Buffer.from("partial");
        throw new Error("socket at private-host:1234");
      })(),
      dispose: vi.fn(),
      headers: {},
      statusCode: 200,
    };

    await expect(
      readBoundedBody(unsafe, {
        capture: false,
        maxBytes: 100,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "FETCH_FAILED",
      message: "The website response could not be read safely.",
    });
  });

  it("rejects missing and ambiguous redirect locations", () => {
    expect(() => readLocationHeader({})).toThrow(
      expect.objectContaining({ code: "INVALID_REDIRECT" }),
    );
    expect(() =>
      readLocationHeader({ location: ["https://one.example", "https://two.example"] }),
    ).toThrow(expect.objectContaining({ code: "FETCH_FAILED" }));
  });
});
