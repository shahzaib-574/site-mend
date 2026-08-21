import { describe, expect, it } from "vitest";

import { normalizeWebsiteUrl } from "./website-url";

describe("normalizeWebsiteUrl", () => {
  it.each([
    ["example.com", "https://example.com/"],
    ["  example.com  ", "https://example.com/"],
    ["https://WWW.Example.com/about?ref=home#team", "https://www.example.com/"],
    ["http://example.com", "http://example.com/"],
  ])("normalizes %s to a safe website origin", (input, expected) => {
    expect(normalizeWebsiteUrl(input)).toMatchObject({
      ok: true,
      url: expected,
    });
  });

  it.each([
    ["", "Enter your website address"],
    ["ftp://example.com", "HTTP or HTTPS"],
    ["https://user:secret@example.com", "username and password"],
    ["http://localhost", "public domain"],
    ["http://service.internal", "public domain"],
    ["http://router.home.arpa", "public domain"],
    ["http://private.alt", "public domain"],
    ["http://hidden.onion", "public domain"],
    ["http://127.0.0.1", "public domain"],
    ["http://127.1", "public domain"],
    ["http://2130706433", "public domain"],
    ["http://0177.0.0.1", "public domain"],
    ["http://0x7f000001", "public domain"],
    ["http://[::1]", "public domain"],
    ["https://example.com:8443", "custom port"],
    ["example.com:8443", "custom port"],
    ["localhost:3000", "public domain"],
  ])("rejects %s", (input, expectedMessage) => {
    const result = normalizeWebsiteUrl(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(expectedMessage);
    }
  });
});
