export type SiteConfigEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type SiteConfigField =
  | "origin"
  | "operatorName"
  | "contactEmail"
  | "legalJurisdiction";

export interface SiteConfigIssue {
  code: "invalid" | "missing";
  field: SiteConfigField;
  message: string;
}

export interface SiteConfig {
  contactEmail: string | null;
  issues: readonly SiteConfigIssue[];
  legalJurisdiction: string | null;
  operatorName: string | null;
  origin: string | null;
  ready: boolean;
}

const MAX_DESCRIPTOR_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const PLACEHOLDER_DOMAIN_SUFFIXES = [
  "example",
  "example.com",
  "example.net",
  "example.org",
] as const;

function issue(
  field: SiteConfigField,
  code: SiteConfigIssue["code"],
  message: string,
): SiteConfigIssue {
  return { code, field, message };
}

function isPlaceholderDomain(hostname: string): boolean {
  return PLACEHOLDER_DOMAIN_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function isStandardDomain(hostname: string): boolean {
  if (
    hostname.length > 253 ||
    hostname.endsWith(".") ||
    !isPublicWebsiteHostname(hostname) ||
    isPlaceholderDomain(hostname)
  ) {
    return false;
  }

  const labels = hostname.split(".");

  if (labels.length < 2) {
    return false;
  }

  const labelsAreValid = labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
  const topLevelDomain = labels.at(-1) ?? "";
  const topLevelDomainIsValid =
    /^[a-z]{2,63}$/.test(topLevelDomain) ||
    /^xn--[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(topLevelDomain);

  return labelsAreValid && topLevelDomainIsValid;
}

function parseOrigin(
  rawValue: string | undefined,
  issues: SiteConfigIssue[],
): string | null {
  const value = rawValue?.trim();

  if (!value) {
    issues.push(issue("origin", "missing", "SITE_ORIGIN is required."));
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    issues.push(
      issue(
        "origin",
        "invalid",
        "SITE_ORIGIN must be a canonical HTTPS origin on a standard domain.",
      ),
    );
    return null;
  }

  const canonicalOrigin = parsed.origin;
  const usesCanonicalSpelling =
    value === canonicalOrigin || value === `${canonicalOrigin}/`;

  if (
    parsed.protocol !== "https:" ||
    !isStandardDomain(parsed.hostname) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    !usesCanonicalSpelling
  ) {
    issues.push(
      issue(
        "origin",
        "invalid",
        "SITE_ORIGIN must be a canonical HTTPS origin without credentials, a port, path, query, or fragment.",
      ),
    );
    return null;
  }

  return canonicalOrigin;
}

function parseDescriptor(
  rawValue: string | undefined,
  options: {
    environmentName: "SITE_LEGAL_JURISDICTION" | "SITE_OPERATOR_NAME";
    field: "legalJurisdiction" | "operatorName";
  },
  issues: SiteConfigIssue[],
): string | null {
  const value = rawValue?.trim();

  if (!value) {
    issues.push(
      issue(options.field, "missing", `${options.environmentName} is required.`),
    );
    return null;
  }

  if (
    Array.from(value).length > MAX_DESCRIPTOR_LENGTH ||
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(
      value,
    )
  ) {
    issues.push(
      issue(
        options.field,
        "invalid",
        `${options.environmentName} must be 1 to ${MAX_DESCRIPTOR_LENGTH} characters without control characters.`,
      ),
    );
    return null;
  }

  return value;
}

function parseContactEmail(
  rawValue: string | undefined,
  issues: SiteConfigIssue[],
): string | null {
  const value = rawValue?.trim();

  if (!value) {
    issues.push(
      issue("contactEmail", "missing", "SITE_CONTACT_EMAIL is required."),
    );
    return null;
  }

  const atIndex = value.indexOf("@");
  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1).toLowerCase();
  const hasOneAtSign = atIndex > 0 && atIndex === value.lastIndexOf("@");
  const localPartIsValid =
    localPart.length <= 64 &&
    /^[a-z0-9._+-]+$/i.test(localPart) &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..");

  if (
    value.length > MAX_EMAIL_LENGTH ||
    !hasOneAtSign ||
    !localPartIsValid ||
    !isStandardDomain(domain)
  ) {
    issues.push(
      issue(
        "contactEmail",
        "invalid",
        `SITE_CONTACT_EMAIL must be a valid email address no longer than ${MAX_EMAIL_LENGTH} characters.`,
      ),
    );
    return null;
  }

  return value;
}

export function readSiteConfig(
  environment: SiteConfigEnvironment = process.env,
): SiteConfig {
  const issues: SiteConfigIssue[] = [];
  const origin = parseOrigin(environment.SITE_ORIGIN, issues);
  const operatorName = parseDescriptor(
    environment.SITE_OPERATOR_NAME,
    {
      environmentName: "SITE_OPERATOR_NAME",
      field: "operatorName",
    },
    issues,
  );
  const contactEmail = parseContactEmail(
    environment.SITE_CONTACT_EMAIL,
    issues,
  );
  const legalJurisdiction = parseDescriptor(
    environment.SITE_LEGAL_JURISDICTION,
    {
      environmentName: "SITE_LEGAL_JURISDICTION",
      field: "legalJurisdiction",
    },
    issues,
  );

  return {
    contactEmail,
    issues,
    legalJurisdiction,
    operatorName,
    origin,
    ready: issues.length === 0,
  };
}
import { isPublicWebsiteHostname } from "@/lib/website-url";
