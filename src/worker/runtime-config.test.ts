import { describe, expect, it } from "vitest";

import { readScanWorkerConfig } from "./runtime-config";

const validEnvironment = {
  REDIS_URL: "redis://127.0.0.1:6379",
  SCAN_WORKER_CONCURRENCY: "3",
  SCAN_WORKER_ENABLED: "true",
  SCAN_WORKER_KEY_SECRET: "a-worker-test-secret-that-is-at-least-32-bytes",
};

describe("readScanWorkerConfig", () => {
  it("returns bounded, explicitly enabled worker configuration", () => {
    expect(readScanWorkerConfig(validEnvironment)).toEqual({
      concurrency: 3,
      keySecret: validEnvironment.SCAN_WORKER_KEY_SECRET,
      redisUrl: "redis://127.0.0.1:6379",
    });
  });

  it("defaults concurrency to two", () => {
    expect(
      readScanWorkerConfig({
        ...validEnvironment,
        SCAN_WORKER_CONCURRENCY: undefined,
      }).concurrency,
    ).toBe(2);
  });

  it.each([
    [{ ...validEnvironment, SCAN_WORKER_ENABLED: "false" }, "SCAN_WORKER_ENABLED"],
    [{ ...validEnvironment, REDIS_URL: "https://redis.example" }, "REDIS_URL"],
    [{ ...validEnvironment, SCAN_WORKER_KEY_SECRET: "short" }, "32 bytes"],
    [{ ...validEnvironment, SCAN_WORKER_CONCURRENCY: "0" }, "integer from 1 to 4"],
    [{ ...validEnvironment, SCAN_WORKER_CONCURRENCY: "5" }, "integer from 1 to 4"],
  ])("fails closed for unsafe worker configuration", (environment, message) => {
    expect(() => readScanWorkerConfig(environment)).toThrow(message);
  });
});
