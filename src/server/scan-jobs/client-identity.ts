import { isIP } from "node:net";

import { ClientIdentityError } from "./errors";

function canonicalizeIpAddress(value: string): string {
  const family = isIP(value);

  if (family === 4) {
    return value
      .split(".")
      .map((part) => String(Number(part)))
      .join(".");
  }

  if (family === 6) {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  }

  throw new ClientIdentityError();
}

export function readTrustedClientIp(
  headers: Pick<Headers, "get">,
  headerName: string,
): string {
  const value = headers.get(headerName)?.trim();

  if (!value || value.length > 64 || value.includes(",")) {
    throw new ClientIdentityError();
  }

  return canonicalizeIpAddress(value);
}
