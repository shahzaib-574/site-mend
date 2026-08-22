import { afterEach, describe, expect, it, vi } from "vitest";

const robotsPolicyBehavior = vi.hoisted(() => ({
  mode: "pass" as "evaluation-error" | "parse-error" | "pass",
}));

vi.mock("./robots-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./robots-policy")>();

  return {
    ...actual,
    parseRobotsPolicy: vi.fn((text: string, productToken: string) => {
      if (robotsPolicyBehavior.mode === "parse-error") {
        const error = new actual.RobotsPolicyComplexityError();
        error.message = "page-authored parser detail";
        throw error;
      }

      const policy = actual.parseRobotsPolicy(text, productToken);

      if (robotsPolicyBehavior.mode === "evaluation-error") {
        return {
          isAllowed: () => {
            const error = new actual.RobotsPolicyComplexityError();
            error.message = "page-authored matcher detail";
            throw error;
          },
        };
      }

      return policy;
    }),
  };
});

import type { AdmittedScanTarget } from "../../server/scan-admission";
import type { ScanJobPayload } from "../../server/scan-jobs/scan-queue";
import { HomepageCrawler } from "./homepage-crawler";
import type {
  PinnedHttpClient,
  PinnedHttpResponse,
} from "./pinned-http-client";
import { parseRobotsPolicy } from "./robots-policy";

const payload: ScanJobPayload = {
  requestedAt: "2026-08-21T12:00:00.000Z",
  scanId: "scan-11111111-1111-4111-8111-111111111111",
  schemaVersion: 1,
  target: {
    hostname: "example.com",
    origin: "https://example.com/",
  },
};

const unavailableError = {
  code: "ROBOTS_UNAVAILABLE",
  message: "The website's robots policy could not be checked safely.",
};

function admitted(value: string): AdmittedScanTarget {
  const url = new URL(value);

  return {
    addresses: [{ address: "93.184.216.34", family: 4 }],
    hostname: url.hostname,
    origin: `${url.protocol}//${url.hostname}/`,
    url: url.toString(),
  };
}

function robotsResponse(): PinnedHttpResponse {
  return {
    body: (async function* () {
      yield Buffer.from("User-agent: *\nAllow: /\n");
    })(),
    dispose: vi.fn(async () => undefined),
    headers: { "content-type": "text/plain" },
    statusCode: 200,
  };
}

function crawler(response: PinnedHttpResponse) {
  const requested: string[] = [];
  const http: PinnedHttpClient = {
    get: vi.fn(async (target) => {
      requested.push(target.url);

      if (target.url !== "https://example.com/robots.txt") {
        throw new Error(`Unexpected homepage request: ${target.url}`);
      }

      return response;
    }),
  };
  const crawl = new HomepageCrawler({
    admitInitial: vi.fn(async (value: string) => admitted(value)),
    admitRedirect: vi.fn(
      async (location: string, current: AdmittedScanTarget) =>
        admitted(new URL(location, current.url).toString()),
    ),
    http,
  });

  return { crawl, requested };
}

afterEach(() => {
  robotsPolicyBehavior.mode = "pass";
  vi.mocked(parseRobotsPolicy).mockClear();
});

describe("robots complexity integration", () => {
  it("maps parser complexity to an unavailable policy and disposes the response", async () => {
    robotsPolicyBehavior.mode = "parse-error";
    const response = robotsResponse();
    const { crawl, requested } = crawler(response);

    await expect(crawl.crawl(payload)).rejects.toMatchObject(unavailableError);

    expect(parseRobotsPolicy).toHaveBeenCalledWith(
      "User-agent: *\nAllow: /\n",
      "SiteMendBot",
    );
    expect(response.dispose).toHaveBeenCalledOnce();
    expect(requested).toEqual(["https://example.com/robots.txt"]);
  });

  it("maps matcher complexity to an unavailable policy before fetching the homepage", async () => {
    robotsPolicyBehavior.mode = "evaluation-error";
    const response = robotsResponse();
    const { crawl, requested } = crawler(response);

    await expect(crawl.crawl(payload)).rejects.toMatchObject(unavailableError);

    expect(response.dispose).toHaveBeenCalledOnce();
    expect(requested).toEqual(["https://example.com/robots.txt"]);
  });
});
