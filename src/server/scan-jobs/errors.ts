export class ClientIdentityError extends Error {
  constructor() {
    super("A trusted client IP address is required.");
    this.name = "ClientIdentityError";
  }
}

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many scan requests.");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ScanRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanRuntimeConfigurationError";
  }
}
