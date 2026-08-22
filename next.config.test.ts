import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

function toHeaderRecord(
  entries: Awaited<ReturnType<NonNullable<typeof nextConfig.headers>>>,
  sources: readonly string[],
) {
  return Object.fromEntries(
    entries
      .filter((entry) => sources.includes(entry.source))
      .flatMap((entry) => entry.headers)
      .map(({ key, value }) => [key, value]),
  );
}

describe("isolated document headers", () => {
  it("defaults every current route to same-origin resources and privacy headers", async () => {
    const entries = (await nextConfig.headers?.()) ?? [];
    const headers = toHeaderRecord(entries, ["/:path*"]);

    expect(headers).toMatchObject({
      "Permissions-Policy": "browsing-topics=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    expect(headers["Content-Security-Policy"]).toBeTypeOf("string");
    expect(headers["Content-Security-Policy"]).not.toMatch(
      /doubleclick|google-analytics|googleadservices|googlesyndication|googletagmanager|https?:/i,
    );
  });

  it("keeps the bearer-capability report document private and third-party free", async () => {
    const entries = (await nextConfig.headers?.()) ?? [];
    const headers = toHeaderRecord(entries, ["/:path*", "/scan"]);
    const contentSecurityPolicy = headers["Content-Security-Policy"];

    expect(headers).toMatchObject({
      "Cache-Control": "no-store, max-age=0",
      "Permissions-Policy": "browsing-topics=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    expect(contentSecurityPolicy).toBeTypeOf("string");

    const directives = new Map(
      contentSecurityPolicy
        .split("; ")
        .map((directive) => {
          const [name, ...values] = directive.split(" ");
          return [name, values] as const;
        }),
    );

    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("connect-src")).toEqual(["'self'"]);
    expect(directives.get("font-src")).toEqual(["'self'"]);
    expect(directives.get("img-src")).toEqual(["'self'"]);
    expect(directives.get("manifest-src")).toEqual(["'self'"]);
    expect(directives.get("media-src")).toEqual(["'self'"]);
    expect(directives.get("worker-src")).toEqual(["'self'"]);
    expect(directives.get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
    expect(directives.get("script-src-attr")).toEqual(["'none'"]);
    expect(directives.get("style-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
    expect(directives.get("style-src-attr")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("frame-src")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy).not.toMatch(/https?:/i);
    expect(contentSecurityPolicy).not.toMatch(
      /doubleclick|google-analytics|googleadservices|googlesyndication|googletagmanager/i,
    );
  });
});
