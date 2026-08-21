import { describe, expect, it, vi } from "vitest";

import { createPublicDnsResolver } from "./dns-resolver";
import { ScanAdmissionError } from "./errors";
import { admitRedirectTarget, admitScanTarget } from "./scan-admission";

const publicAddress = [{ address: "1.1.1.1", family: 4 as const }];

describe("admitScanTarget", () => {
  it("normalizes an origin and resolves its hostname", async () => {
    const resolver = vi.fn(async () => publicAddress);

    await expect(
      admitScanTarget("https://WWW.Example.com/path?source=test", resolver),
    ).resolves.toEqual({
      addresses: publicAddress,
      hostname: "www.example.com",
      origin: "https://www.example.com/",
      url: "https://www.example.com/",
    });
    expect(resolver).toHaveBeenCalledExactlyOnceWith("www.example.com");
  });

  it("rejects an invalid target before DNS resolution", async () => {
    const resolver = vi.fn(async () => publicAddress);

    await expect(admitScanTarget("http://localhost", resolver)).rejects.toMatchObject(
      {
        code: "INVALID_TARGET",
      },
    );
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("admitRedirectTarget", () => {
  it("resolves a relative redirect and rechecks its hostname", async () => {
    const resolver = vi.fn(async () => publicAddress);
    const current = await admitScanTarget("https://example.com", resolver);

    const redirected = await admitRedirectTarget(
      "/guides/start?from=home#intro",
      current,
      resolver,
    );

    expect(redirected).toEqual({
      addresses: publicAddress,
      hostname: "example.com",
      origin: "https://example.com/",
      url: "https://example.com/guides/start?from=home",
    });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver).toHaveBeenLastCalledWith("example.com");
  });

  it("revalidates an absolute cross-origin redirect", async () => {
    const resolver = vi.fn(async (hostname: string) => {
      if (hostname === "blocked.example") {
        throw new ScanAdmissionError(
          "NON_PUBLIC_ADDRESS",
          "SiteMend can only scan websites on the public internet.",
        );
      }

      return publicAddress;
    });
    const current = await admitScanTarget("https://example.com", resolver);

    await expect(
      admitRedirectTarget("https://blocked.example/private", current, resolver),
    ).rejects.toMatchObject({ code: "NON_PUBLIC_ADDRESS" });
    expect(resolver).toHaveBeenLastCalledWith("blocked.example");
  });

  it("blocks a redirect whose DNS answer is private", async () => {
    const resolver = createPublicDnsResolver({
      lookup: async (hostname) => {
        return hostname === "example.com"
          ? [{ address: "1.1.1.1", family: 4 }]
          : [{ address: "169.254.169.254", family: 4 }];
      },
    });
    const current = await admitScanTarget("https://example.com", resolver);

    await expect(
      admitRedirectTarget("https://metadata.example/latest", current, resolver),
    ).rejects.toMatchObject({ code: "NON_PUBLIC_ADDRESS" });
  });

  it.each([
    "ftp://example.com/file",
    "https://user:secret@example.com/",
    "https://example.com:8443/private",
    "http://127.0.0.1/admin",
  ])("rejects an unsafe redirect target before DNS: %s", async (location) => {
    const resolver = vi.fn(async () => publicAddress);
    const current = await admitScanTarget("https://example.com", resolver);
    resolver.mockClear();

    await expect(
      admitRedirectTarget(location, current, resolver),
    ).rejects.toMatchObject({ code: "INVALID_TARGET" });
    expect(resolver).not.toHaveBeenCalled();
  });
});
