import { createHmac, randomUUID } from "node:crypto";

import { CrawlerError } from "./crawler/errors";

const DESTINATION_LEASE_TTL_MS = 45_000;
const RELEASE_LEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export interface DestinationLeaseRedis {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    token: string,
  ): Promise<unknown>;
  set(
    key: string,
    token: string,
    mode: "PX",
    ttlMs: number,
    condition: "NX",
  ): Promise<"OK" | null>;
}

export interface DestinationLease {
  release(): Promise<void>;
}

export class DestinationLeaseManager {
  constructor(
    private readonly redis: DestinationLeaseRedis,
    private readonly keySecret: string,
  ) {}

  async acquire(hostname: string): Promise<DestinationLease | null> {
    const digest = createHmac("sha256", this.keySecret)
      .update(hostname)
      .digest("hex");
    const key = `sitemend:worker:destination:v1:${digest}`;
    const token = randomUUID();
    let acquired: "OK" | null;

    try {
      acquired = await this.redis.set(
        key,
        token,
        "PX",
        DESTINATION_LEASE_TTL_MS,
        "NX",
      );
    } catch (error) {
      throw new CrawlerError(
        "FETCH_FAILED",
        "The worker could not reserve that website safely.",
        { cause: error },
      );
    }

    if (acquired !== "OK") {
      return null;
    }

    let released = false;

    return {
      release: async () => {
        if (released) {
          return;
        }

        let result: unknown;

        try {
          result = await this.redis.eval(
            RELEASE_LEASE_SCRIPT,
            1,
            key,
            token,
          );
        } catch (error) {
          throw new CrawlerError(
            "FETCH_FAILED",
            "The worker could not release the website reservation safely.",
            { cause: error },
          );
        }

        if (result !== 0 && result !== 1) {
          throw new CrawlerError(
            "FETCH_FAILED",
            "The destination lease returned an unexpected result.",
          );
        }

        released = true;
      },
    };
  }
}
