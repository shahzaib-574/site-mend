export type WebsiteUrlResult =
  | {
      ok: true;
      hostname: string;
      url: string;
    }
  | {
      ok: false;
      message: string;
    };

const blockedHostnameSuffixes = [
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localhost",
  ".test",
];

function isIpLiteral(hostname: string) {
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const isIpv6 = hostname.includes(":");

  return isIpv4 || isIpv6;
}

function isPublicDomain(hostname: string) {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".") ||
    !hostname.includes(".") ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix)) ||
    isIpLiteral(hostname)
  ) {
    return false;
  }

  return hostname.split(".").every((label) => {
    return (
      label.length > 0 &&
      label.length <= 63 &&
      !label.startsWith("-") &&
      !label.endsWith("-") &&
      /^[a-z0-9-]+$/i.test(label)
    );
  });
}

export function normalizeWebsiteUrl(input: string): WebsiteUrlResult {
  const value = input.trim();

  if (!value) {
    return { ok: false, message: "Enter your website address to continue." };
  }

  if (value.length > 2_048) {
    return { ok: false, message: "That website address is too long." };
  }

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value)
    ? value
    : `https://${value}`;

  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    return {
      ok: false,
      message: "Enter a valid website, such as example.com.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "SiteMend can only check HTTP or HTTPS websites.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "Remove the username and password from the website address.",
    };
  }

  if (parsed.port) {
    return {
      ok: false,
      message: "Use the public website address without a custom port.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!isPublicDomain(hostname)) {
    return {
      ok: false,
      message: "Enter a public domain name rather than a local address or IP.",
    };
  }

  return {
    ok: true,
    hostname,
    url: `${parsed.protocol}//${hostname}/`,
  };
}
