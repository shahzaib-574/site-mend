import { describe, expect, it, vi } from "vitest";

import {
  DestinationLeaseManager,
  type DestinationLeaseRedis,
} from "./destination-lease";

describe("DestinationLeaseManager", () => {
  it("uses an HMAC key and compare-and-delete release", async () => {
    const set = vi.fn<DestinationLeaseRedis["set"]>(async () => "OK");
    const evalCommand = vi.fn<DestinationLeaseRedis["eval"]>(async () => 1);
    const manager = new DestinationLeaseManager(
      { eval: evalCommand, set },
      "a-worker-test-secret-that-is-at-least-32-bytes",
    );

    const lease = await manager.acquire("example.com");

    expect(lease).not.toBeNull();
    const [key, token, mode, ttl, condition] = set.mock.calls[0];
    expect(key).toMatch(/^sitemend:worker:destination:v1:[a-f0-9]{64}$/);
    expect(key).not.toContain("example.com");
    expect(token).toMatch(/^[a-f0-9-]{36}$/);
    expect([mode, ttl, condition]).toEqual(["PX", 45_000, "NX"]);

    await lease!.release();
    await lease!.release();

    expect(evalCommand).toHaveBeenCalledOnce();
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("GET", KEYS[1])'),
      1,
      key,
      token,
    );
  });

  it("returns no lease when another worker owns the destination", async () => {
    const redis: DestinationLeaseRedis = {
      eval: vi.fn(),
      set: vi.fn(async () => null),
    };
    const manager = new DestinationLeaseManager(redis, "x".repeat(32));

    await expect(manager.acquire("example.com")).resolves.toBeNull();
  });

  it("wraps Redis implementation details in safe crawler errors", async () => {
    const manager = new DestinationLeaseManager(
      {
        eval: vi.fn(),
        set: vi.fn(async () => Promise.reject(new Error("redis://secret-host"))),
      },
      "x".repeat(32),
    );

    await expect(manager.acquire("example.com")).rejects.toMatchObject({
      code: "FETCH_FAILED",
      message: "The worker could not reserve that website safely.",
    });
  });
});
