import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "./robots";

const releaseEnvironment = {
  SITE_CONTACT_EMAIL: "support@sitemend.app",
  SITE_LEGAL_JURISDICTION: "Pakistan",
  SITE_OPERATOR_NAME: "SiteMend Labs",
  SITE_ORIGIN: "https://sitemend.app",
};
const releaseEnvironmentNames = Object.keys(releaseEnvironment) as Array<
  keyof typeof releaseEnvironment
>;

function setReleaseEnvironment(
  overrides: Partial<Record<keyof typeof releaseEnvironment, string>> = {},
): void {
  for (const name of releaseEnvironmentNames) {
    vi.stubEnv(name, overrides[name] ?? releaseEnvironment[name]);
  }
}

describe("robots metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows pages to expose indexing directives while excluding API routes", () => {
    setReleaseEnvironment();

    expect(robots()).toEqual({
      host: "https://sitemend.app",
      rules: {
        allow: "/",
        disallow: "/api/",
        userAgent: "*",
      },
      sitemap: "https://sitemend.app/sitemap.xml",
    });
  });

  it.each([
    ["is missing", ""],
    ["is malformed", "http://sitemend.app"],
    ["contains a path", "https://sitemend.app/release"],
  ])("omits release URLs and exposes public noindex pages when the origin %s", (_case, origin) => {
    setReleaseEnvironment({ SITE_ORIGIN: origin });

    const result = robots();

    expect(result).toEqual({
      rules: {
        allow: "/",
        disallow: "/api/",
        userAgent: "*",
      },
    });
    expect(result).not.toHaveProperty("host");
    expect(result).not.toHaveProperty("sitemap");
    expect(JSON.stringify(result)).not.toMatch(/example\.(com|net|org)/i);
  });

  it("fails closed when another required release value is invalid", () => {
    setReleaseEnvironment({ SITE_CONTACT_EMAIL: "not-an-email" });

    expect(robots()).toEqual({
      rules: {
        allow: "/",
        disallow: "/api/",
        userAgent: "*",
      },
    });
  });
});
