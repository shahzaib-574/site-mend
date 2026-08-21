import { lookup } from "node:dns/promises";

import { ScanAdmissionError } from "./errors";
import { assessPublicIpAddress, type IpFamily } from "./ip-policy";

export interface DnsAddress {
  address: string;
  family: number;
}

export interface PublicDnsAddress {
  address: string;
  family: IpFamily;
}

export type DnsLookup = (
  hostname: string,
) => Promise<ReadonlyArray<DnsAddress>>;

export type PublicHostResolver = (
  hostname: string,
) => Promise<ReadonlyArray<PublicDnsAddress>>;

interface PublicDnsResolverOptions {
  lookup?: DnsLookup;
  maxAnswers?: number;
  timeoutMs?: number;
}

const MAX_DNS_ANSWERS = 16;
const MAX_DNS_LOOKUP_TIMEOUT_MS = 3_000;

const defaultDnsLookup: DnsLookup = async (hostname) => {
  return lookup(hostname, { all: true, verbatim: true });
};

function assertBoundedInteger(
  name: string,
  value: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 1 to ${maximum}.`);
  }
}

export function createPublicDnsResolver(
  options: PublicDnsResolverOptions = {},
): PublicHostResolver {
  const lookupHostname = options.lookup ?? defaultDnsLookup;
  const maxAnswers = options.maxAnswers ?? MAX_DNS_ANSWERS;
  const timeoutMs = options.timeoutMs ?? MAX_DNS_LOOKUP_TIMEOUT_MS;

  assertBoundedInteger("maxAnswers", maxAnswers, MAX_DNS_ANSWERS);
  assertBoundedInteger(
    "timeoutMs",
    timeoutMs,
    MAX_DNS_LOOKUP_TIMEOUT_MS,
  );

  return async (hostname) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new ScanAdmissionError(
            "DNS_LOOKUP_TIMEOUT",
            "We could not check that website's network address in time. Try again.",
          ),
        );
      }, timeoutMs);
    });

    let answers: ReadonlyArray<DnsAddress>;

    try {
      answers = await Promise.race([
        lookupHostname(hostname),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof ScanAdmissionError) {
        throw error;
      }

      throw new ScanAdmissionError(
        "DNS_LOOKUP_FAILED",
        "We could not find that website. Check the address and try again.",
      );
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }

    if (!Array.isArray(answers)) {
      throw new ScanAdmissionError(
        "INVALID_DNS_ANSWER",
        "That website returned invalid network address data.",
      );
    }

    if (answers.length === 0) {
      throw new ScanAdmissionError(
        "NO_DNS_ANSWERS",
        "We could not find that website. Check the address and try again.",
      );
    }

    if (answers.length > maxAnswers) {
      throw new ScanAdmissionError(
        "TOO_MANY_DNS_ANSWERS",
        "That website has too many network addresses to scan safely.",
      );
    }

    const approvedAnswers = new Map<string, PublicDnsAddress>();

    for (const answer of answers) {
      if (
        typeof answer !== "object" ||
        answer === null ||
        typeof answer.address !== "string" ||
        typeof answer.family !== "number"
      ) {
        throw new ScanAdmissionError(
          "INVALID_DNS_ANSWER",
          "That website returned invalid network address data.",
        );
      }

      const assessment = assessPublicIpAddress(answer.address, answer.family);

      if (!assessment.allowed) {
        const code =
          assessment.reason === "non-public"
            ? "NON_PUBLIC_ADDRESS"
            : "INVALID_DNS_ANSWER";
        const message =
          code === "NON_PUBLIC_ADDRESS"
            ? "SiteMend can only scan websites on the public internet."
            : "That website returned an invalid network address.";

        throw new ScanAdmissionError(code, message);
      }

      approvedAnswers.set(`${assessment.family}:${answer.address}`, {
        address: answer.address,
        family: assessment.family,
      });
    }

    return [...approvedAnswers.values()];
  };
}

export const resolvePublicHostname = createPublicDnsResolver();
