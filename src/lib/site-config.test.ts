import { afterEach, describe, expect, it, vi } from "vitest";

import { readSiteConfig } from "./site-config";

const validEnvironment = {
  SITE_CONTACT_EMAIL: "support@sitemend.app",
  SITE_LEGAL_JURISDICTION: "Pakistan",
  SITE_OPERATOR_NAME: "SiteMend Labs",
  SITE_ORIGIN: "https://sitemend.app",
};

describe("readSiteConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a ready release configuration when every server value is valid", () => {
    expect(readSiteConfig(validEnvironment)).toEqual({
      contactEmail: "support@sitemend.app",
      issues: [],
      legalJurisdiction: "Pakistan",
      operatorName: "SiteMend Labs",
      origin: "https://sitemend.app",
      ready: true,
    });
  });

  it("trims human-readable release values and a trailing origin slash", () => {
    expect(
      readSiteConfig({
        SITE_CONTACT_EMAIL: " support@sitemend.app ",
        SITE_LEGAL_JURISDICTION: " Pakistan ",
        SITE_OPERATOR_NAME: " SiteMend Labs ",
        SITE_ORIGIN: " https://sitemend.app/ ",
      }),
    ).toMatchObject({
      contactEmail: "support@sitemend.app",
      legalJurisdiction: "Pakistan",
      operatorName: "SiteMend Labs",
      origin: "https://sitemend.app",
      ready: true,
    });
  });

  it("reports every missing value without supplying placeholder content", () => {
    const config = readSiteConfig({});

    expect(config).toMatchObject({
      contactEmail: null,
      legalJurisdiction: null,
      operatorName: null,
      origin: null,
      ready: false,
    });
    expect(config.issues).toEqual([
      expect.objectContaining({ code: "missing", field: "origin" }),
      expect.objectContaining({ code: "missing", field: "operatorName" }),
      expect.objectContaining({ code: "missing", field: "contactEmail" }),
      expect.objectContaining({ code: "missing", field: "legalJurisdiction" }),
    ]);
    expect(JSON.stringify(config)).not.toMatch(/example\.(com|net|org)/i);
  });

  it.each([
    "http://sitemend.app",
    "https://localhost",
    "https://127.0.0.1",
    "https://[2001:db8::1]",
    "https://user:secret@sitemend.app",
    "https://sitemend.app:443",
    "https://sitemend.app:8443",
    "https://sitemend.app/path",
    "https://sitemend.app?source=release",
    "https://sitemend.app#release",
    "https://SITEMEND.app",
    "https://sitemend.app.",
    "https://example.com",
    "https://service.corp",
    "https://preview.example",
    "https://preview.example.org",
    "https://preview.home.arpa",
    "https://router.home",
    "https://preview.alt",
    "https://preview.internal",
    "https://preview.lan",
    "https://preview.local",
    "https://preview.localdomain",
    "https://mx.mail",
    "https://preview.onion",
    "https://preview.arpa",
    "not-a-url",
  ])("rejects the non-canonical or non-public origin %s", (origin) => {
    const config = readSiteConfig({ ...validEnvironment, SITE_ORIGIN: origin });

    expect(config.origin).toBeNull();
    expect(config.ready).toBe(false);
    expect(config.issues).toContainEqual(
      expect.objectContaining({ code: "invalid", field: "origin" }),
    );
  });

  it.each([
    ["operatorName", { SITE_OPERATOR_NAME: "" }],
    ["operatorName", { SITE_OPERATOR_NAME: "x".repeat(121) }],
    ["operatorName", { SITE_OPERATOR_NAME: "SiteMend\nLabs" }],
    ["operatorName", { SITE_OPERATOR_NAME: "SiteMend\u0085Labs" }],
    ["operatorName", { SITE_OPERATOR_NAME: "SiteMend\u200fLabs" }],
    ["operatorName", { SITE_OPERATOR_NAME: "SiteMend\u202eLabs" }],
    ["legalJurisdiction", { SITE_LEGAL_JURISDICTION: "" }],
    ["legalJurisdiction", { SITE_LEGAL_JURISDICTION: "x".repeat(121) }],
    ["legalJurisdiction", { SITE_LEGAL_JURISDICTION: "Pakistan\u0000" }],
    ["legalJurisdiction", { SITE_LEGAL_JURISDICTION: "Pakistan\u2066" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "missing-at-sign" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: ".hello@sitemend.app" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "hello..team@sitemend.app" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "hello@localhost" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "hello@example.com" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "hello@preview.example" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "hello@service.corp" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "hello@router.home" }],
    ["contactEmail", { SITE_CONTACT_EMAIL: "hello@mx.mail" }],
    [
      "contactEmail",
      { SITE_CONTACT_EMAIL: "privacy?bcc=attacker%40evil.com&x=@sitemend.app" },
    ],
  ] as const)("fails readiness when %s is malformed", (field, override) => {
    const config = readSiteConfig({ ...validEnvironment, ...override });

    expect(config.ready).toBe(false);
    expect(config.issues).toContainEqual(
      expect.objectContaining({ field }),
    );
  });

  it("does not read a NEXT_PUBLIC fallback for release identity", () => {
    const config = readSiteConfig({
      NEXT_PUBLIC_SITE_CONTACT_EMAIL: validEnvironment.SITE_CONTACT_EMAIL,
      NEXT_PUBLIC_SITE_LEGAL_JURISDICTION:
        validEnvironment.SITE_LEGAL_JURISDICTION,
      NEXT_PUBLIC_SITE_OPERATOR_NAME: validEnvironment.SITE_OPERATOR_NAME,
      NEXT_PUBLIC_SITE_ORIGIN: validEnvironment.SITE_ORIGIN,
    });

    expect(config.ready).toBe(false);
    expect(config.origin).toBeNull();
    expect(config.issues).toHaveLength(4);
  });

  it("preserves ordinary right-to-left letters in release descriptors", () => {
    expect(
      readSiteConfig({
        ...validEnvironment,
        SITE_LEGAL_JURISDICTION: "پاکستان",
        SITE_OPERATOR_NAME: "سائٹ مینڈ لیبز",
      }),
    ).toMatchObject({
      legalJurisdiction: "پاکستان",
      operatorName: "سائٹ مینڈ لیبز",
      ready: true,
    });
  });

  it("accepts exact descriptor, hostname, and email length boundaries", () => {
    const hostname = [
      "a".repeat(63),
      "b".repeat(63),
      "c".repeat(63),
      "d".repeat(61),
    ].join(".");
    const emailDomain = ["e".repeat(63), "f".repeat(63), "g".repeat(61)].join(
      ".",
    );

    expect(hostname).toHaveLength(253);
    expect(`${"h".repeat(64)}@${emailDomain}`).toHaveLength(254);
    expect(
      readSiteConfig({
        SITE_CONTACT_EMAIL: `${"h".repeat(64)}@${emailDomain}`,
        SITE_LEGAL_JURISDICTION: "j".repeat(120),
        SITE_OPERATOR_NAME: "o".repeat(120),
        SITE_ORIGIN: `https://${hostname}`,
      }),
    ).toMatchObject({ ready: true });
  });

  it("rejects over-limit hostnames and email addresses", () => {
    const hostname = [
      "a".repeat(63),
      "b".repeat(63),
      "c".repeat(63),
      "d".repeat(62),
    ].join(".");
    const emailDomain = ["e".repeat(63), "f".repeat(63), "g".repeat(62)].join(
      ".",
    );

    expect(hostname).toHaveLength(254);
    expect(`${"h".repeat(64)}@${emailDomain}`).toHaveLength(255);
    expect(
      readSiteConfig({ ...validEnvironment, SITE_ORIGIN: `https://${hostname}` }),
    ).toMatchObject({ origin: null, ready: false });
    expect(
      readSiteConfig({
        ...validEnvironment,
        SITE_CONTACT_EMAIL: `${"h".repeat(64)}@${emailDomain}`,
      }),
    ).toMatchObject({ contactEmail: null, ready: false });
  });

  it("reads the ordinary server environment by default", () => {
    vi.stubEnv("SITE_CONTACT_EMAIL", validEnvironment.SITE_CONTACT_EMAIL);
    vi.stubEnv(
      "SITE_LEGAL_JURISDICTION",
      validEnvironment.SITE_LEGAL_JURISDICTION,
    );
    vi.stubEnv("SITE_OPERATOR_NAME", validEnvironment.SITE_OPERATOR_NAME);
    vi.stubEnv("SITE_ORIGIN", validEnvironment.SITE_ORIGIN);

    expect(readSiteConfig()).toMatchObject({
      origin: validEnvironment.SITE_ORIGIN,
      ready: true,
    });
  });
});
