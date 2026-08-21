import { describe, expect, it } from "vitest";

import { parseRobotsPolicy } from "./robots-policy";

describe("RFC 9309 robots policy", () => {
  it("prefers exact product groups over the wildcard group", () => {
    const policy = parseRobotsPolicy(`
      User-agent: *
      Disallow: /

      User-agent: SiteMendBot
      Allow: /
    `);

    expect(policy.isAllowed("https://example.com/", "SiteMendBot")).toBe(true);
    expect(policy.isAllowed("https://example.com/", "OtherBot")).toBe(false);
  });

  it("combines matching groups and uses the longest rule with allow on ties", () => {
    const policy = parseRobotsPolicy(`
      User-agent: SiteMendBot
      Disallow: /private
      Allow: /private/public

      User-agent: SiteMendBot
      Disallow: /other
      Disallow: /same
      Allow: /same
    `);

    expect(policy.isAllowed("https://example.com/private", "SiteMendBot")).toBe(false);
    expect(
      policy.isAllowed("https://example.com/private/public", "SiteMendBot"),
    ).toBe(true);
    expect(policy.isAllowed("https://example.com/other", "SiteMendBot")).toBe(false);
    expect(policy.isAllowed("https://example.com/same", "SiteMendBot")).toBe(true);
  });

  it("matches encoded octets, wildcards, end markers, and query strings", () => {
    const policy = parseRobotsPolicy(`
      User-agent: *
      Disallow: /caf%C3%A9
      Disallow: /*?preview=*$
    `);

    expect(policy.isAllowed("https://example.com/caf%C3%A9", "SiteMendBot")).toBe(false);
    expect(
      policy.isAllowed("https://example.com/post?preview=true", "SiteMendBot"),
    ).toBe(false);
    expect(
      policy.isAllowed("https://example.com/post?preview=true&x=1", "SiteMendBot"),
    ).toBe(false);
  });

  it("ignores comments, rules outside groups, and empty disallow rules", () => {
    const policy = parseRobotsPolicy(`
      Disallow: /
      User-agent: * # everyone
      Disallow:
      Allow: / # public
    `);

    expect(policy.isAllowed("https://example.com/", "SiteMendBot")).toBe(true);
  });
});
