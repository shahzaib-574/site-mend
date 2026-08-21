import { describe, expect, it } from "vitest";

import { assessPublicIpAddress } from "./ip-policy";

describe("assessPublicIpAddress", () => {
  it.each([
    ["1.1.1.1", 4],
    ["8.8.8.8", 4],
    ["2001:4860:4860::8888", 6],
    ["2606:4700:4700::1111", 6],
  ])("allows the public address %s", (address, family) => {
    expect(assessPublicIpAddress(address, family)).toEqual({
      allowed: true,
      family,
    });
  });

  it.each([
    "0.0.0.0",
    "10.20.30.40",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.5",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:192.168.1.1",
    "64:ff9b::c0a8:101",
    "100::1",
    "2001:db8::1",
    "2002:c0a8:101::",
    "3fff::1",
    "4000::1",
    "fc00::1",
    "fd00:ec2::254",
    "fe80::1",
    "fec0::1",
    "ff02::1",
  ])("blocks the non-public address %s", (address) => {
    expect(assessPublicIpAddress(address)).toEqual({
      allowed: false,
      reason: "non-public",
    });
  });

  it("rejects malformed addresses", () => {
    expect(assessPublicIpAddress("999.1.1.1", 4)).toEqual({
      allowed: false,
      reason: "invalid",
    });
  });

  it("rejects DNS records whose declared family does not match the address", () => {
    expect(assessPublicIpAddress("1.1.1.1", 6)).toEqual({
      allowed: false,
      reason: "family-mismatch",
    });
  });
});
