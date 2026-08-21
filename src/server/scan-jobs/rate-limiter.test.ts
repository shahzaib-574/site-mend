import { describe, expect, it, vi } from "vitest";

import { HashedFixedWindowRateLimiter } from "./rate-limiter";
import { RedisFixedWindowStore } from "./redis-fixed-window-store";

const secret = "a-secure-test-secret-with-32-bytes";

describe("HashedFixedWindowRateLimiter", () => {
  it("allows a request and stores only a keyed digest of its identity", async () => {
    const increment = vi.fn(async (key: string, windowMs: number) => {
      void key;
      void windowMs;
      return { count: 2, ttlMs: 9_001 };
    });
    const limiter = new HashedFixedWindowRateLimiter({ increment }, secret);

    await expect(
      limiter.consume("scan-client", "203.0.113.9", {
        limit: 5,
        windowMs: 10_000,
      }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 3,
      retryAfterSeconds: 10,
    });

    const key = increment.mock.calls[0]?.[0];
    expect(key).toMatch(/^sitemend:rate:v1:scan-client:[a-f0-9]{64}$/);
    expect(key).not.toContain("203.0.113.9");
  });

  it("denies requests above the fixed-window limit", async () => {
    const limiter = new HashedFixedWindowRateLimiter(
      { increment: async () => ({ count: 6, ttlMs: 1_500 }) },
      secret,
    );

    await expect(
      limiter.consume("scan-client", "203.0.113.9", {
        limit: 5,
        windowMs: 10_000,
      }),
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 2,
    });
  });

  it("uses different keys for different scopes", async () => {
    const increment = vi.fn(async (key: string, windowMs: number) => {
      void key;
      void windowMs;
      return { count: 1, ttlMs: 1_000 };
    });
    const limiter = new HashedFixedWindowRateLimiter({ increment }, secret);

    await limiter.consume("scan-client", "same", { limit: 1, windowMs: 1_000 });
    await limiter.consume("scan-target", "same", { limit: 1, windowMs: 1_000 });

    expect(increment.mock.calls[0]?.[0]).not.toBe(increment.mock.calls[1]?.[0]);
  });

  it("does not put a destination hostname in its Redis key", async () => {
    const increment = vi.fn(async (key: string, windowMs: number) => {
      void key;
      return { count: 1, ttlMs: windowMs };
    });
    const limiter = new HashedFixedWindowRateLimiter({ increment }, secret);

    await limiter.consume("scan-target", "example.com", {
      limit: 3,
      windowMs: 60_000,
    });

    expect(increment.mock.calls[0]?.[0]).not.toContain("example.com");
  });

  it("fails closed for invalid store data", async () => {
    const limiter = new HashedFixedWindowRateLimiter(
      { increment: async () => ({ count: 0, ttlMs: 1_000 }) },
      secret,
    );

    await expect(
      limiter.consume("scan-global", "all", { limit: 1, windowMs: 1_000 }),
    ).rejects.toThrow("invalid counter");
  });
});

describe("RedisFixedWindowStore", () => {
  it("increments one explicit Redis key with an atomic Lua script", async () => {
    const evalScript = vi.fn(
      async (script: string, numberOfKeys: number, ...arguments_: string[]) => {
        void script;
        void numberOfKeys;
        void arguments_;
        return ["3", 750];
      },
    );
    const store = new RedisFixedWindowStore({ eval: evalScript });

    await expect(store.increment("rate-key", 1_000)).resolves.toEqual({
      count: 3,
      ttlMs: 750,
    });
    expect(evalScript).toHaveBeenCalledOnce();
    expect(evalScript.mock.calls[0]?.slice(1)).toEqual([1, "rate-key", "1000"]);
    expect(evalScript.mock.calls[0]?.[0]).toContain('redis.call("INCR", KEYS[1])');
    expect(evalScript.mock.calls[0]?.[0]).toContain('redis.call("PEXPIRE"');
  });

  it.each([null, [], [1], [0, 10], [1, -1], ["bad", 10]])(
    "rejects a malformed Redis result: %j",
    async (result) => {
      const store = new RedisFixedWindowStore({ eval: async () => result });

      await expect(store.increment("rate-key", 1_000)).rejects.toThrow(
        "invalid rate-limit result",
      );
    },
  );
});
