import { BlockList, isIP } from "node:net";

export type IpFamily = 4 | 6;

export type PublicIpAssessment =
  | {
      allowed: true;
      family: IpFamily;
    }
  | {
      allowed: false;
      reason: "family-mismatch" | "invalid" | "non-public";
    };

const blockedIpv4Addresses = new BlockList();
const blockedIpv6Addresses = new BlockList();
const globallyRoutableIpv6Addresses = new BlockList();

// IANA currently allocates global-unicast IPv6 space from 2000::/3. Treat every
// other prefix as non-public by default, then subtract special-purpose ranges.
globallyRoutableIpv6Addresses.addSubnet("2000::", 3, "ipv6");

const blockedIpv4Subnets = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const blockedIpv6Subnets = [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

for (const [address, prefix] of blockedIpv4Subnets) {
  blockedIpv4Addresses.addSubnet(address, prefix, "ipv4");
}

for (const [address, prefix] of blockedIpv6Subnets) {
  blockedIpv6Addresses.addSubnet(address, prefix, "ipv6");
}

export function assessPublicIpAddress(
  address: string,
  expectedFamily?: number,
): PublicIpAssessment {
  const family = isIP(address);

  if (family !== 4 && family !== 6) {
    return { allowed: false, reason: "invalid" };
  }

  if (expectedFamily !== undefined && family !== expectedFamily) {
    return { allowed: false, reason: "family-mismatch" };
  }

  const blocked =
    family === 4
      ? blockedIpv4Addresses.check(address, "ipv4")
      : !globallyRoutableIpv6Addresses.check(address, "ipv6") ||
        blockedIpv6Addresses.check(address, "ipv6");

  if (blocked) {
    return { allowed: false, reason: "non-public" };
  }

  return { allowed: true, family };
}
