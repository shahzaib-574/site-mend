import { afterEach, describe, expect, it, vi } from "vitest";

import sitemap from "./sitemap";

const releaseEnvironment = {
  SITE_CONTACT_EMAIL: "support@sitemend.app",
  SITE_LEGAL_JURISDICTION: "Pakistan",
  SITE_OPERATOR_NAME: "SiteMend Labs",
  SITE_ORIGIN: "https://sitemend.app",
};

function setReleaseEnvironment(
  overrides: Partial<typeof releaseEnvironment> = {},
): void {
  for (const [name, value] of Object.entries({
    ...releaseEnvironment,
    ...overrides,
  })) {
    vi.stubEnv(name, value);
  }
}

describe("sitemap metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("publishes only the five public release pages when ready", () => {
    setReleaseEnvironment();

    expect(sitemap()).toEqual([
      { url: "https://sitemend.app/" },
      { url: "https://sitemend.app/about" },
      { url: "https://sitemend.app/contact" },
      { url: "https://sitemend.app/privacy" },
      { url: "https://sitemend.app/terms" },
    ]);
  });

  it.each([
    ["is missing", ""],
    ["is malformed", "not-a-url"],
    ["uses a placeholder", "https://example.com"],
  ])("returns no URLs when the release origin %s", (_case, origin) => {
    setReleaseEnvironment({ SITE_ORIGIN: origin });

    const result = sitemap();

    expect(result).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/example\.(com|net|org)/i);
  });

  it("returns no URLs when the complete release configuration is not ready", () => {
    setReleaseEnvironment({ SITE_OPERATOR_NAME: "" });

    expect(sitemap()).toEqual([]);
  });
});
