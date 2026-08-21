import { normalizeWebsiteUrl } from "@/lib/website-url";

import type { PublicDnsAddress, PublicHostResolver } from "./dns-resolver";
import { resolvePublicHostname } from "./dns-resolver";
import { ScanAdmissionError } from "./errors";

export interface AdmittedScanTarget {
  addresses: ReadonlyArray<PublicDnsAddress>;
  hostname: string;
  origin: string;
  url: string;
}

function normalizeTarget(input: string) {
  const result = normalizeWebsiteUrl(input);

  if (!result.ok) {
    throw new ScanAdmissionError("INVALID_TARGET", result.message);
  }

  return result;
}

async function admitNormalizedTarget(
  normalized: ReturnType<typeof normalizeTarget>,
  url: string,
  resolver: PublicHostResolver,
): Promise<AdmittedScanTarget> {
  const addresses = await resolver(normalized.hostname);

  return {
    addresses,
    hostname: normalized.hostname,
    origin: normalized.url,
    url,
  };
}

export async function admitScanTarget(
  input: string,
  resolver: PublicHostResolver = resolvePublicHostname,
): Promise<AdmittedScanTarget> {
  const normalized = normalizeTarget(input);

  return admitNormalizedTarget(normalized, normalized.url, resolver);
}

export async function admitRedirectTarget(
  location: string,
  currentTarget: AdmittedScanTarget,
  resolver: PublicHostResolver = resolvePublicHostname,
): Promise<AdmittedScanTarget> {
  let redirectUrl: URL;

  try {
    redirectUrl = new URL(location, currentTarget.url);
  } catch {
    throw new ScanAdmissionError(
      "INVALID_TARGET",
      "That website redirected to an invalid address.",
    );
  }

  redirectUrl.hash = "";

  const normalized = normalizeTarget(redirectUrl.toString());

  return admitNormalizedTarget(normalized, redirectUrl.toString(), resolver);
}
