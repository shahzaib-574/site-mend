import { describe, expect, it } from "vitest";

import { createPublicPageMetadata } from "./public-page-metadata";

const page = {
  description: "A truthful description.",
  path: "/privacy" as const,
  title: "Privacy",
};

const releaseEnvironment = {
  SITE_CONTACT_EMAIL: "privacy@sitemend.app",
  SITE_LEGAL_JURISDICTION: "Pakistan",
  SITE_OPERATOR_NAME: "SiteMend Labs",
  SITE_ORIGIN: "https://sitemend.app",
};

describe("createPublicPageMetadata", () => {
  it("emits an absolute canonical only for complete validated release identity", () => {
    expect(createPublicPageMetadata(page, releaseEnvironment)).toEqual({
      alternates: { canonical: "https://sitemend.app/privacy" },
      description: page.description,
      title: page.title,
    });
  });

  it.each([
    {},
    { ...releaseEnvironment, SITE_CONTACT_EMAIL: "" },
    { ...releaseEnvironment, SITE_ORIGIN: "https://preview.local" },
  ])("omits canonicals when release identity fails closed", (environment) => {
    const metadata = createPublicPageMetadata(page, environment);

    expect(metadata).toEqual({
      description: page.description,
      robots: {
        follow: false,
        index: false,
        noarchive: true,
      },
      title: page.title,
    });
    expect(JSON.stringify(metadata)).not.toMatch(
      /example\.(?:com|net|org)|localhost|preview\.local/i,
    );
  });
});
