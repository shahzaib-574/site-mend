import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublicDnsResolver } from "./dns-resolver";

describe("createPublicDnsResolver", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unique public IPv4 and IPv6 answers", async () => {
    const resolver = createPublicDnsResolver({
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "1.1.1.1", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ],
    });

    await expect(resolver("example.com")).resolves.toEqual([
      { address: "1.1.1.1", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });

  it("rejects the entire hostname when any answer is non-public", async () => {
    const resolver = createPublicDnsResolver({
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    });

    await expect(resolver("example.com")).rejects.toMatchObject({
      code: "NON_PUBLIC_ADDRESS",
    });
  });

  it.each([
    [{ address: "not-an-address", family: 4 }],
    [{ address: "1.1.1.1", family: 6 }],
    [{ address: "2606:4700:4700::1111", family: 5 }],
  ])("rejects malformed DNS answer data", async (answer) => {
    const resolver = createPublicDnsResolver({
      lookup: async () => [answer],
    });

    await expect(resolver("example.com")).rejects.toMatchObject({
      code: "INVALID_DNS_ANSWER",
    });
  });

  it("fails closed when a resolver violates the expected answer shape", async () => {
    const resolver = createPublicDnsResolver({
      lookup: async () => [null] as never,
    });

    await expect(resolver("example.com")).rejects.toMatchObject({
      code: "INVALID_DNS_ANSWER",
    });
  });

  it("rejects an empty answer set", async () => {
    const resolver = createPublicDnsResolver({ lookup: async () => [] });

    await expect(resolver("example.com")).rejects.toMatchObject({
      code: "NO_DNS_ANSWERS",
    });
  });

  it("applies the raw answer-count limit before deduplication", async () => {
    const resolver = createPublicDnsResolver({
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "1.1.1.1", family: 4 },
        { address: "1.1.1.1", family: 4 },
      ],
      maxAnswers: 2,
    });

    await expect(resolver("example.com")).rejects.toMatchObject({
      code: "TOO_MANY_DNS_ANSWERS",
    });
  });

  it("converts DNS implementation failures into a stable error", async () => {
    const resolver = createPublicDnsResolver({
      lookup: async () => {
        throw new Error("resolver implementation detail");
      },
    });

    await expect(resolver("example.com")).rejects.toMatchObject({
      code: "DNS_LOOKUP_FAILED",
      message: expect.not.stringContaining("implementation detail"),
    });
  });

  it("times out a DNS lookup that does not settle", async () => {
    vi.useFakeTimers();

    const resolver = createPublicDnsResolver({
      lookup: () => new Promise(() => undefined),
      timeoutMs: 10,
    });
    const rejection = expect(resolver("example.com")).rejects.toMatchObject({
      code: "DNS_LOOKUP_TIMEOUT",
    });

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });

  it.each([
    [{ maxAnswers: 0 }, "maxAnswers"],
    [{ maxAnswers: 17 }, "maxAnswers"],
    [{ timeoutMs: 0 }, "timeoutMs"],
    [{ timeoutMs: 3_001 }, "timeoutMs"],
  ] as const)("rejects unsafe resolver configuration", (options, name) => {
    expect(() => createPublicDnsResolver(options)).toThrow(name);
  });
});
