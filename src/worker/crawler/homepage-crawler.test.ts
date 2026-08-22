import { describe, expect, it, vi } from "vitest";

import type { AdmittedScanTarget } from "../../server/scan-admission";
import type { ScanJobPayload } from "../../server/scan-jobs/scan-queue";
import { HomepageCrawler } from "./homepage-crawler";
import type {
  PinnedHttpClient,
  PinnedHttpResponse,
} from "./pinned-http-client";

const payload: ScanJobPayload = {
  requestedAt: "2026-08-21T12:00:00.000Z",
  scanId: "scan-11111111-1111-4111-8111-111111111111",
  schemaVersion: 1,
  target: {
    hostname: "example.com",
    origin: "https://example.com/",
  },
};

function admitted(value: string): AdmittedScanTarget {
  return admittedWithAddress(value, "93.184.216.34");
}

function admittedWithAddress(
  value: string,
  address: string,
): AdmittedScanTarget {
  const url = new URL(value);
  return {
    addresses: [{ address, family: 4 }],
    hostname: url.hostname,
    origin: `${url.protocol}//${url.hostname}/`,
    url: url.toString(),
  };
}

function fakeAdmission() {
  return {
    admitInitial: vi.fn(async (value: string) => admitted(value)),
    admitRedirect: vi.fn(
      async (location: string, current: AdmittedScanTarget) =>
        admitted(new URL(location, current.url).toString()),
    ),
  };
}

function fakeResponse(
  statusCode: number,
  options: {
    body?: string;
    headers?: Record<string, string | string[]>;
  } = {},
): PinnedHttpResponse {
  return {
    body: (async function* () {
      if (options.body) {
        yield Buffer.from(options.body);
      }
    })(),
    dispose: vi.fn(async () => undefined),
    headers: options.headers ?? {},
    statusCode,
  };
}

function queuedHttp(
  responses: Record<string, PinnedHttpResponse>,
): PinnedHttpClient & { pinnedAddresses: string[]; requested: string[] } {
  const pinnedAddresses: string[] = [];
  const requested: string[] = [];

  return {
    get: vi.fn(async (target) => {
      requested.push(target.url);
      pinnedAddresses.push(target.addresses[0]?.address ?? "missing");
      const response = responses[target.url];

      if (!response) {
        throw new Error(`Unexpected test request: ${target.url}`);
      }

      return response;
    }),
    pinnedAddresses,
    requested,
  };
}

function crawler(
  http: PinnedHttpClient,
  admission = fakeAdmission(),
): HomepageCrawler {
  return new HomepageCrawler({
    ...admission,
    clock: () => new Date("2026-08-21T12:01:00.000Z"),
    http,
  });
}

describe("HomepageCrawler", () => {
  it("fetches robots first and returns bounded evidence without raw HTML", async () => {
    const robots = fakeResponse(200, {
      body: "User-agent: *\nAllow: /\n",
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
    const homepage = fakeResponse(200, {
      body: "<html><title>Safe evidence</title></html>",
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const http = queuedHttp({
      "https://example.com/": homepage,
      "https://example.com/robots.txt": robots,
    });

    const result = await crawler(http).crawl(payload);

    expect(http.requested).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
    ]);
    expect(result).toMatchObject({
      completedAt: "2026-08-21T12:01:00.000Z",
      homepage: {
        body: {
          bytes: 41,
          contentType: "text/html",
          document: {
            title: {
              count: 1,
              first: { text: "Safe evidence" },
            },
          },
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        finalUrl: "https://example.com/",
        statusCode: 200,
      },
      outcome: "fetched",
      scanId: payload.scanId,
      schemaVersion: 2,
    });
    expect(result.audit.checks).toHaveLength(9);
    expect(JSON.stringify(result)).not.toContain("<html>");
    expect(robots.dispose).toHaveBeenCalled();
    expect(homepage.dispose).toHaveBeenCalled();
  });

  it("uses newly admitted addresses after the robots check", async () => {
    let initialAdmissions = 0;
    const admission = {
      admitInitial: vi.fn(async (value: string) => {
        initialAdmissions += 1;
        return admittedWithAddress(
          value,
          initialAdmissions === 1 ? "93.184.216.34" : "93.184.216.35",
        );
      }),
      admitRedirect: vi.fn(async (location: string, current: AdmittedScanTarget) =>
        admittedWithAddress(
          new URL(location, current.url).toString(),
          "93.184.216.36",
        ),
      ),
    };
    const http = queuedHttp({
      "https://example.com/": fakeResponse(204),
      "https://example.com/robots.txt": fakeResponse(404),
    });

    await crawler(http, admission).crawl(payload);

    expect(http.pinnedAddresses).toEqual([
      "93.184.216.35",
      "93.184.216.36",
    ]);
  });

  it("completes with robots evidence without fetching a blocked homepage", async () => {
    const http = queuedHttp({
      "https://example.com/robots.txt": fakeResponse(200, {
        body: "User-agent: SiteMendBot\nDisallow: /\n",
        headers: { "content-type": "text/plain" },
      }),
    });

    const result = await crawler(http).crawl(payload);

    expect(result).toMatchObject({
      blockedAt: "https://example.com/",
      homepage: null,
      outcome: "blocked-by-robots",
      robots: [{ origin: "https://example.com/", status: "found" }],
    });
    expect(http.requested).toEqual(["https://example.com/robots.txt"]);
  });

  it("checks robots for a new redirect origin before fetching it", async () => {
    const http = queuedHttp({
      "https://example.com/": fakeResponse(301, {
        headers: { location: "https://www.example.com/home?token=private" },
      }),
      "https://example.com/robots.txt": fakeResponse(404),
      "https://www.example.com/home?token=private": fakeResponse(200, {
        body: "<html>final</html>",
        headers: { "content-type": "text/html" },
      }),
      "https://www.example.com/robots.txt": fakeResponse(200, {
        body: "User-agent: *\nAllow: /home\n",
        headers: { "content-type": "text/plain" },
      }),
    });

    const result = await crawler(http).crawl(payload);

    expect(http.requested).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
      "https://www.example.com/robots.txt",
      "https://www.example.com/home?token=private",
    ]);
    expect(result).toMatchObject({
      homepage: {
        finalUrl: "https://www.example.com/home",
        redirects: [
          {
            from: "https://example.com/",
            statusCode: 301,
            to: "https://www.example.com/home",
          },
        ],
      },
      outcome: "fetched",
      robots: [
        { origin: "https://example.com/", status: "not-found" },
        { origin: "https://www.example.com/", status: "found" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("token=private");
  });

  it("fails closed when robots cannot be checked", async () => {
    const http = queuedHttp({
      "https://example.com/robots.txt": fakeResponse(503),
    });

    await expect(crawler(http).crawl(payload)).rejects.toMatchObject({
      code: "ROBOTS_UNAVAILABLE",
    });
    expect(http.requested).toEqual(["https://example.com/robots.txt"]);
  });

  it("enforces the global redirect budget", async () => {
    let hop = 0;
    const requested: string[] = [];
    const http: PinnedHttpClient = {
      get: vi.fn(async (target) => {
        requested.push(target.url);

        if (target.url.endsWith("/robots.txt")) {
          return fakeResponse(404);
        }

        hop += 1;
        return fakeResponse(302, { headers: { location: `/hop-${hop}` } });
      }),
    };

    await expect(crawler(http).crawl(payload)).rejects.toMatchObject({
      code: "REDIRECT_LIMIT",
    });
    expect(requested).toHaveLength(7);
  });
});
