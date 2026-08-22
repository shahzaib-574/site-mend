import { describe, expect, it } from "vitest";

import { toHttpRequestTarget } from "./request-target";

describe("toHttpRequestTarget", () => {
  it.each([
    ["https://example.com/secret", "/secret"],
    ["https://example.com/secret?", "/secret?"],
    ["https://example.com/secret?preview=true", "/secret?preview=true"],
    ["https://example.com/secret?#section", "/secret?"],
    ["https://example.com/what%3Fnow", "/what%3Fnow"],
  ])("serializes %s as the transmitted origin-form %s", (input, expected) => {
    expect(toHttpRequestTarget(new URL(input))).toBe(expected);
  });
});
