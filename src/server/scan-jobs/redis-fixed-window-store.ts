import type { FixedWindowCounter, FixedWindowStore } from "./rate-limiter";

interface RedisEvalClient {
  eval(
    script: string,
    numberOfKeys: number,
    ...arguments_: string[]
  ): Promise<unknown>;
}

const incrementFixedWindowScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

function parsePositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

export class RedisFixedWindowStore implements FixedWindowStore {
  constructor(private readonly client: RedisEvalClient) {}

  async increment(key: string, windowMs: number): Promise<FixedWindowCounter> {
    const result = await this.client.eval(
      incrementFixedWindowScript,
      1,
      key,
      String(windowMs),
    );

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error("Redis returned an invalid rate-limit result.");
    }

    const count = parsePositiveInteger(result[0]);
    const ttlMs = parsePositiveInteger(result[1]);

    if (count === undefined || ttlMs === undefined) {
      throw new Error("Redis returned an invalid rate-limit result.");
    }

    return { count, ttlMs };
  }
}
