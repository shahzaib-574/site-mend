import { describe, expect, it } from "vitest";

import { readScanRuntimeConfig } from "./runtime-config";

const validEnvironment = {
  REDIS_URL: "redis://127.0.0.1:6379",
  SCAN_INTAKE_ENABLED: "true",
  SCAN_RATE_LIMIT_KEY_SECRET: "a-secure-test-secret-with-32-bytes",
  SCAN_TRUSTED_CLIENT_IP_HEADER: "X-SiteMend-Client-IP",
};

describe("readScanRuntimeConfig", () => {
  it("returns normalized, explicitly enabled configuration", () => {
    expect(readScanRuntimeConfig(validEnvironment)).toEqual({
      clientIpHeader: "x-sitemend-client-ip",
      rateLimitKeySecret: validEnvironment.SCAN_RATE_LIMIT_KEY_SECRET,
      redisUrl: "redis://127.0.0.1:6379",
    });
  });

  it.each([
    [{ ...validEnvironment, SCAN_INTAKE_ENABLED: "false" }, "SCAN_INTAKE_ENABLED"],
    [{ ...validEnvironment, REDIS_URL: "https://redis.example" }, "REDIS_URL"],
    [{ ...validEnvironment, REDIS_URL: "redis:///" }, "REDIS_URL"],
    [{ ...validEnvironment, SCAN_RATE_LIMIT_KEY_SECRET: "too-short" }, "32 bytes"],
    [
      { ...validEnvironment, SCAN_TRUSTED_CLIENT_IP_HEADER: "bad header" },
      "valid header",
    ],
  ])("fails closed for unsafe configuration", (environment, message) => {
    expect(() => readScanRuntimeConfig(environment)).toThrow(message);
  });
});
