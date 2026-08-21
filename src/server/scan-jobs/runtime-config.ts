import { ScanRuntimeConfigurationError } from "./errors";

export interface ScanRuntimeConfig {
  clientIpHeader: string;
  rateLimitKeySecret: string;
  redisUrl: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

function requireValue(environment: Environment, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new ScanRuntimeConfigurationError(`${name} is required.`);
  }

  return value;
}

function parseRedisUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new ScanRuntimeConfigurationError("REDIS_URL is invalid.");
  }

  if (
    (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") ||
    !parsed.hostname ||
    parsed.hash
  ) {
    throw new ScanRuntimeConfigurationError("REDIS_URL is invalid.");
  }

  return parsed.toString();
}

function parseHeaderName(value: string): string {
  const headerName = value.toLowerCase();

  if (!/^[a-z0-9-]{1,64}$/.test(headerName)) {
    throw new ScanRuntimeConfigurationError(
      "SCAN_TRUSTED_CLIENT_IP_HEADER must be a valid header name.",
    );
  }

  return headerName;
}

export function readScanRuntimeConfig(
  environment: Environment = process.env,
): ScanRuntimeConfig {
  if (environment.SCAN_INTAKE_ENABLED !== "true") {
    throw new ScanRuntimeConfigurationError(
      "SCAN_INTAKE_ENABLED must be true before scan intake is available.",
    );
  }

  const rateLimitKeySecret = requireValue(
    environment,
    "SCAN_RATE_LIMIT_KEY_SECRET",
  );

  if (Buffer.byteLength(rateLimitKeySecret, "utf8") < 32) {
    throw new ScanRuntimeConfigurationError(
      "SCAN_RATE_LIMIT_KEY_SECRET must be at least 32 bytes.",
    );
  }

  return {
    clientIpHeader: parseHeaderName(
      requireValue(environment, "SCAN_TRUSTED_CLIENT_IP_HEADER"),
    ),
    rateLimitKeySecret,
    redisUrl: parseRedisUrl(requireValue(environment, "REDIS_URL")),
  };
}
