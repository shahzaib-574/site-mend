import { BlockList } from "node:net";

import { Client, buildConnector } from "undici";

import {
  assessPublicIpAddress,
  type AdmittedScanTarget,
  type PublicDnsAddress,
} from "../../server/scan-admission";
import { CRAWL_LIMITS } from "./crawl-budget";
import { CrawlerError, toCrawlerError } from "./errors";

export const SITE_MEND_ROBOTS_TOKEN = "SiteMendBot";
export const SITE_MEND_USER_AGENT =
  "SiteMendBot/0.1 (+https://github.com/shahzaib-574/site-mend)";

export type HttpResponseHeaders = Readonly<
  Record<string, string | ReadonlyArray<string> | undefined>
>;

export interface PinnedHttpResponse {
  body: AsyncIterable<Uint8Array>;
  dispose(): Promise<void>;
  headers: HttpResponseHeaders;
  statusCode: number;
}

export interface PinnedHttpRequest {
  accept: string;
  maxResponseBytes: number;
  signal: AbortSignal;
}

export interface PinnedHttpClient {
  get(
    target: AdmittedScanTarget,
    request: PinnedHttpRequest,
  ): Promise<PinnedHttpResponse>;
}

type Connector = ReturnType<typeof buildConnector>;

function selectPinnedAddress(
  addresses: ReadonlyArray<PublicDnsAddress>,
): PublicDnsAddress {
  const address =
    addresses.find((candidate) => candidate.family === 4) ?? addresses[0];

  if (!address) {
    throw new CrawlerError(
      "FETCH_FAILED",
      "The website has no approved address to connect to.",
    );
  }

  return address;
}

export function createPinnedConnector(
  hostname: string,
  pinnedAddress: PublicDnsAddress,
  baseConnector: Connector = buildConnector({
    allowH2: false,
    maxCachedSessions: 0,
    rejectUnauthorized: true,
    timeout: CRAWL_LIMITS.connectTimeoutMs,
  }),
): Connector {
  const pinnedAddresses = new BlockList();
  pinnedAddresses.addAddress(
    pinnedAddress.address,
    pinnedAddress.family === 4 ? "ipv4" : "ipv6",
  );

  return (options, callback) => {
    if (options.hostname.toLowerCase() !== hostname) {
      callback(
        new CrawlerError(
          "SOCKET_MISMATCH",
          "The HTTP client attempted an unexpected destination.",
        ),
        null,
      );
      return;
    }

    baseConnector(
      {
        ...options,
        hostname: pinnedAddress.address,
        servername: options.protocol === "https:" ? hostname : undefined,
      },
      (error, socket) => {
        if (error) {
          callback(error, null);
          return;
        }

        const remoteAddress = socket.remoteAddress;
        const assessment = remoteAddress
          ? assessPublicIpAddress(remoteAddress, pinnedAddress.family)
          : { allowed: false as const, reason: "invalid" as const };
        const matchesPinnedAddress =
          remoteAddress !== undefined &&
          pinnedAddresses.check(
            remoteAddress,
            pinnedAddress.family === 4 ? "ipv4" : "ipv6",
          );

        if (!assessment.allowed || !matchesPinnedAddress) {
          socket.destroy();
          callback(
            new CrawlerError(
              "SOCKET_MISMATCH",
              "The connected address did not match the admitted address.",
            ),
            null,
          );
          return;
        }

        callback(null, socket);
      },
    );
  };
}

export class UndiciPinnedHttpClient implements PinnedHttpClient {
  async get(
    target: AdmittedScanTarget,
    request: PinnedHttpRequest,
  ): Promise<PinnedHttpResponse> {
    const url = new URL(target.url);

    if (
      url.hostname !== target.hostname ||
      `${url.protocol}//${url.hostname}/` !== target.origin
    ) {
      throw new CrawlerError(
        "FETCH_FAILED",
        "The admitted website target was internally inconsistent.",
      );
    }

    const pinnedAddress = selectPinnedAddress(target.addresses);
    const client = new Client(url.origin, {
      allowH2: false,
      bodyTimeout: CRAWL_LIMITS.bodyTimeoutMs,
      connect: createPinnedConnector(target.hostname, pinnedAddress),
      headersTimeout: CRAWL_LIMITS.headersTimeoutMs,
      maxHeaderSize: CRAWL_LIMITS.maxHeaderBytes,
      maxResponseSize: request.maxResponseBytes + 1,
      pipelining: 0,
    });

    try {
      const response = await client.request({
        bodyTimeout: CRAWL_LIMITS.bodyTimeoutMs,
        headers: {
          accept: request.accept,
          "accept-encoding": "identity",
          "cache-control": "no-cache",
          "user-agent": SITE_MEND_USER_AGENT,
        },
        headersTimeout: CRAWL_LIMITS.headersTimeoutMs,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        signal: request.signal,
      });
      let disposed = false;

      return {
        body: response.body,
        dispose: async () => {
          if (disposed) {
            return;
          }

          disposed = true;
          response.body.destroy();

          try {
            await client.destroy();
          } catch (error) {
            throw toCrawlerError(error);
          }
        },
        headers: response.headers,
        statusCode: response.statusCode,
      };
    } catch (error) {
      await client.destroy().catch(() => undefined);

      if (request.signal.aborted) {
        throw request.signal.reason instanceof Error
          ? request.signal.reason
          : new CrawlerError(
              "CRAWL_ABORTED",
              "The website scan was cancelled.",
            );
      }

      throw toCrawlerError(error);
    }
  }
}
