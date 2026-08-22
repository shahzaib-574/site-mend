import { randomUUID } from "node:crypto";

import { normalizeWebsiteUrl } from "@/lib/website-url";
import {
  admitScanTarget,
  ScanAdmissionError,
  type AdmittedScanTarget,
} from "@/server/scan-admission";

import { RateLimitExceededError } from "./errors";
import type {
  DistributedRateLimiter,
  RateLimitPolicy,
  RateLimitScope,
} from "./rate-limiter";
import type {
  ScanJobPayload,
  ScanQueue,
  ScanStatusRecord,
} from "./scan-queue";

const rateLimitPolicies = {
  scanClient: { limit: 5, windowMs: 10 * 60_000 },
  scanGlobal: { limit: 60, windowMs: 60_000 },
  scanTarget: { limit: 3, windowMs: 60 * 60_000 },
  statusClient: { limit: 120, windowMs: 60_000 },
  statusGlobal: { limit: 1_200, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface SubmittedScan {
  scanId: string;
  status: "queued";
  statusUrl: string;
  target: {
    hostname: string;
    origin: string;
  };
}

interface ScanJobServiceDependencies {
  admitTarget?: (input: string) => Promise<AdmittedScanTarget>;
  createId?: () => string;
  now?: () => Date;
  queue: ScanQueue;
  rateLimiter: DistributedRateLimiter;
}

export class ScanJobService {
  private readonly admitTarget;
  private readonly createId;
  private readonly now;

  constructor(private readonly dependencies: ScanJobServiceDependencies) {
    this.admitTarget = dependencies.admitTarget ?? admitScanTarget;
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  private async enforceLimit(
    scope: RateLimitScope,
    identity: string,
    policy: RateLimitPolicy,
  ): Promise<void> {
    const decision = await this.dependencies.rateLimiter.consume(
      scope,
      identity,
      policy,
    );

    if (!decision.allowed) {
      throw new RateLimitExceededError(decision.retryAfterSeconds);
    }
  }

  async submit(input: string, clientIp: string): Promise<SubmittedScan> {
    await this.enforceLimit("scan-global", "all", rateLimitPolicies.scanGlobal);
    await this.enforceLimit(
      "scan-client",
      clientIp,
      rateLimitPolicies.scanClient,
    );

    const normalized = normalizeWebsiteUrl(input);

    if (!normalized.ok) {
      throw new ScanAdmissionError("INVALID_TARGET", normalized.message);
    }

    await this.enforceLimit(
      "scan-target",
      normalized.hostname,
      rateLimitPolicies.scanTarget,
    );

    const admitted = await this.admitTarget(normalized.url);

    if (
      admitted.hostname !== normalized.hostname ||
      admitted.origin !== normalized.url
    ) {
      throw new Error("Scan admission returned an unexpected target.");
    }

    const generatedId = this.createId();

    if (!uuidPattern.test(generatedId)) {
      throw new Error("The scan ID generator returned an invalid ID.");
    }

    const scanId = `scan-${generatedId}`;
    const payload: ScanJobPayload = {
      requestedAt: this.now().toISOString(),
      scanId,
      schemaVersion: 1,
      target: {
        hostname: admitted.hostname,
        origin: admitted.origin,
      },
    };

    await this.dependencies.queue.enqueue(payload);

    return {
      scanId,
      status: "queued",
      statusUrl: "/api/scans/status",
      target: payload.target,
    };
  }

  async getStatus(
    scanId: string,
    clientIp: string,
  ): Promise<ScanStatusRecord | null> {
    await this.enforceLimit(
      "status-global",
      "all",
      rateLimitPolicies.statusGlobal,
    );
    await this.enforceLimit(
      "status-client",
      clientIp,
      rateLimitPolicies.statusClient,
    );

    return this.dependencies.queue.getStatus(scanId);
  }
}
