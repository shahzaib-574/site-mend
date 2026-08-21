export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigurationError";
  }
}

export interface ScanWorkerConfig {
  concurrency: number;
  keySecret: string;
  redisUrl: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

function requireValue(environment: Environment, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new WorkerConfigurationError(`${name} is required.`);
  }

  return value;
}

function parseRedisUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new WorkerConfigurationError("REDIS_URL is invalid.");
  }

  if (
    (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") ||
    !parsed.hostname ||
    parsed.hash
  ) {
    throw new WorkerConfigurationError("REDIS_URL is invalid.");
  }

  return parsed.toString();
}

function parseConcurrency(value: string | undefined): number {
  const text = value?.trim() || "2";

  if (!/^[1-4]$/.test(text)) {
    throw new WorkerConfigurationError(
      "SCAN_WORKER_CONCURRENCY must be an integer from 1 to 4.",
    );
  }

  return Number(text);
}

export function readScanWorkerConfig(
  environment: Environment = process.env,
): ScanWorkerConfig {
  if (environment.SCAN_WORKER_ENABLED !== "true") {
    throw new WorkerConfigurationError(
      "SCAN_WORKER_ENABLED must be true before the worker can start.",
    );
  }

  const keySecret = requireValue(environment, "SCAN_WORKER_KEY_SECRET");

  if (Buffer.byteLength(keySecret, "utf8") < 32) {
    throw new WorkerConfigurationError(
      "SCAN_WORKER_KEY_SECRET must be at least 32 bytes.",
    );
  }

  return {
    concurrency: parseConcurrency(environment.SCAN_WORKER_CONCURRENCY),
    keySecret,
    redisUrl: parseRedisUrl(requireValue(environment, "REDIS_URL")),
  };
}
