import { createHmac } from "node:crypto";

export interface FixedWindowCounter {
  count: number;
  ttlMs: number;
}

export interface FixedWindowStore {
  increment(key: string, windowMs: number): Promise<FixedWindowCounter>;
}

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export type RateLimitScope =
  | "scan-client"
  | "scan-global"
  | "scan-target"
  | "status-client"
  | "status-global";

export interface DistributedRateLimiter {
  consume(
    scope: RateLimitScope,
    identity: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitDecision>;
}

function assertPolicy(policy: RateLimitPolicy): void {
  if (
    !Number.isSafeInteger(policy.limit) ||
    policy.limit < 1 ||
    !Number.isSafeInteger(policy.windowMs) ||
    policy.windowMs < 1
  ) {
    throw new RangeError("Rate-limit policy values must be positive integers.");
  }
}

export class HashedFixedWindowRateLimiter
  implements DistributedRateLimiter
{
  constructor(
    private readonly store: FixedWindowStore,
    private readonly keySecret: string,
  ) {
    if (Buffer.byteLength(keySecret, "utf8") < 32) {
      throw new RangeError("The rate-limit key secret must be at least 32 bytes.");
    }
  }

  async consume(
    scope: RateLimitScope,
    identity: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitDecision> {
    assertPolicy(policy);

    if (!identity) {
      throw new RangeError("A rate-limit identity is required.");
    }

    const digest = createHmac("sha256", this.keySecret)
      .update(`${scope}\0${identity}`)
      .digest("hex");
    const counter = await this.store.increment(
      `sitemend:rate:v1:${scope}:${digest}`,
      policy.windowMs,
    );

    if (
      !Number.isSafeInteger(counter.count) ||
      counter.count < 1 ||
      !Number.isSafeInteger(counter.ttlMs) ||
      counter.ttlMs < 1 ||
      counter.ttlMs > policy.windowMs
    ) {
      throw new Error("The rate-limit store returned an invalid counter.");
    }

    return {
      allowed: counter.count <= policy.limit,
      remaining: Math.max(0, policy.limit - counter.count),
      retryAfterSeconds: Math.max(1, Math.ceil(counter.ttlMs / 1_000)),
    };
  }
}
