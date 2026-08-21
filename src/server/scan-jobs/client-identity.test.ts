import { describe, expect, it } from "vitest";

import { readTrustedClientIp } from "./client-identity";

describe("readTrustedClientIp", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"],
  ])("canonicalizes the trusted address %s", (input, expected) => {
    const headers = new Headers({ "x-client-ip": input });

    expect(readTrustedClientIp(headers, "x-client-ip")).toBe(expected);
  });

  it.each([undefined, "", "not-an-ip", "203.0.113.7, 198.51.100.2"])(
    "rejects an unavailable or ambiguous client address: %s",
    (value) => {
      const headers = new Headers();
      if (value !== undefined) {
        headers.set("x-client-ip", value);
      }

      expect(() => readTrustedClientIp(headers, "x-client-ip")).toThrow(
        "trusted client IP",
      );
    },
  );
});
