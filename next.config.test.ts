import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("scan document headers", () => {
  it("keeps the bearer-capability report document private", async () => {
    const entries = await nextConfig.headers?.();
    const scanEntry = entries?.find((entry) => entry.source === "/scan");
    const headers = Object.fromEntries(
      scanEntry?.headers.map(({ key, value }) => [key, value]) ?? [],
    );

    expect(headers).toMatchObject({
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
  });
});
