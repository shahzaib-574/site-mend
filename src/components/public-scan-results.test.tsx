import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_HOMEPAGE_RULES,
  type PublicAuditCategory,
  type PublicAuditPriority,
  type PublicHomepageFinding,
  type PublicHomepageRuleId,
  type PublicScanStatusRecord,
} from "@/lib/public-scan-contract";

import { PublicScanResults } from "./public-scan-results";

type CompletedPublicScan = Extract<
  PublicScanStatusRecord,
  Readonly<{ status: "completed" }>
>;

type FindingSpec = Readonly<{
  overrides?: Partial<PublicHomepageFinding>;
  priority: PublicAuditPriority;
  ruleId: PublicHomepageRuleId;
  title: string;
}>;

const queuedAt = "2026-08-21T10:00:00.000Z";
const completedAt = "2026-08-21T10:00:05.000Z";

function categoryFor(ruleId: PublicHomepageRuleId): PublicAuditCategory {
  const rule = PUBLIC_HOMEPAGE_RULES.find(
    (candidate) => candidate.ruleId === ruleId,
  );

  if (!rule) {
    throw new Error(`Unknown rule ${ruleId}`);
  }

  return rule.category;
}

function makeFinding(spec: FindingSpec): PublicHomepageFinding {
  const category = categoryFor(spec.ruleId);

  return {
    affectedUrls: ["https://example.com/"],
    category,
    confidence: "high",
    dataLabel: "derived",
    effort: "low",
    evidence: [{ label: "Observed value", value: spec.title }],
    explanation: `${spec.title} was observed in the homepage evidence.`,
    fix: `Fix ${spec.title.toLowerCase()} in the initial homepage response.`,
    impact: `${spec.title} can affect visitors or search visibility.`,
    priority: spec.priority,
    ruleId: spec.ruleId,
    ruleVersion: "1.0.0",
    title: spec.title,
    verify: `Fetch the homepage again and verify ${spec.title.toLowerCase()}.`,
    ...spec.overrides,
  };
}

function makeRecord(
  options: Readonly<{
    findingSpecs?: ReadonlyArray<FindingSpec>;
    notCheckedRuleIds?: ReadonlyArray<PublicHomepageRuleId>;
    outcome?: "blocked-by-robots" | "fetched";
    target?: CompletedPublicScan["target"];
  }> = {},
): CompletedPublicScan {
  const findings = (options.findingSpecs ?? []).map(makeFinding);
  const findingByRule = new Map(
    findings.map((finding) => [finding.ruleId, finding] as const),
  );
  const notCheckedRuleIds = new Set(options.notCheckedRuleIds ?? []);
  const checks = PUBLIC_HOMEPAGE_RULES.map((rule) => {
    const finding = findingByRule.get(rule.ruleId) ?? null;
    const status = finding
      ? ("failed" as const)
      : notCheckedRuleIds.has(rule.ruleId)
        ? ("not-applicable" as const)
        : ("passed" as const);

    return {
      category: rule.category,
      evidence:
        status === "not-applicable"
          ? []
          : [{ label: "Rule evidence", value: `Evidence for ${rule.ruleId}` }],
      finding,
      ruleId: rule.ruleId,
      ruleVersion: "1.0.0" as const,
      status,
      summary:
        status === "not-applicable"
          ? "The homepage HTML was not available."
          : `Summary for ${rule.ruleId}`,
    };
  });

  return {
    queuedAt,
    result: {
      completedAt,
      outcome: options.outcome ?? "fetched",
      report: {
        checks,
        findings,
        rulesetVersion: "homepage-v1",
        schemaVersion: 1,
      },
      schemaVersion: 1,
    },
    scanId: "scan-11111111-1111-4111-8111-111111111111",
    status: "completed",
    target: options.target ?? {
      hostname: "example.com",
      origin: "https://example.com",
    },
  };
}

const manyFindingSpecs: ReadonlyArray<FindingSpec> = [
  {
    priority: "optional",
    ruleId: "TECH-STATUS-001",
    title: "Optional status review",
  },
  {
    priority: "fix-soon",
    ruleId: "TECH-HTTPS-001",
    title: "HTTPS needs attention",
  },
  {
    priority: "improvement",
    ruleId: "SEARCH-ROBOTS-001",
    title: "Improve robots access",
  },
  {
    priority: "fix-now",
    ruleId: "TECH-REDIRECTS-001",
    title: "Redirects need an immediate fix",
  },
  {
    priority: "optional",
    ruleId: "SEARCH-TITLE-001",
    title: "Optional title review",
  },
  {
    priority: "fix-now",
    ruleId: "SEARCH-DESCRIPTION-001",
    title: "Description needs an immediate fix",
  },
  {
    priority: "improvement",
    ruleId: "SEARCH-CANONICAL-001",
    title: "Improve the canonical",
  },
  {
    priority: "fix-soon",
    ruleId: "CONTENT-HEADINGS-001",
    title: "Headings need attention",
  },
  {
    priority: "fix-now",
    ruleId: "SEARCH-INDEXING-001",
    title: "Indexing needs an immediate fix",
  },
];

describe("PublicScanResults", () => {
  it("shows target, outcome, timestamps, honest scope, counts, and all checks", async () => {
    const user = userEvent.setup();
    const record = makeRecord({ findingSpecs: manyFindingSpecs });
    render(<PublicScanResults record={record} />);

    expect(
      screen.getByRole("heading", { name: "Results for example.com" }),
    ).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByText("Homepage fetched")).toBeInTheDocument();
    expect(screen.getAllByText(/Aug 21, 2026/)).toHaveLength(2);
    expect(
      screen.getByText(/nine deterministic checks derived from a bounded homepage crawl/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not include speed measurements, real-user field data, multi-page crawling, AEO, or GEO/i),
    ).toBeInTheDocument();

    const summary = screen.getByRole("heading", { name: "Check summary" }).parentElement;
    expect(summary).not.toBeNull();
    expect(within(summary!).getByText("Needs attention").nextElementSibling).toHaveTextContent("9");
    expect(within(summary!).getByText("Passed").nextElementSibling).toHaveTextContent("0");
    expect(within(summary!).getByText("Not checked").nextElementSibling).toHaveTextContent("0");
    expect(screen.queryByText(/^N\/?A$/i)).not.toBeInTheDocument();

    await user.click(screen.getByText("View all 9 checks"));
    const allChecks = screen.getByRole("list", { name: "All homepage checks" });
    expect(allChecks.children).toHaveLength(9);
    expect(within(allChecks).getByText("Homepage response")).toBeInTheDocument();
    expect(within(allChecks).getByText("Indexing directives")).toBeInTheDocument();
    expect(
      within(allChecks).getAllByText("View check evidence")[0],
    ).toHaveTextContent(/for Homepage response/i);
  });

  it("orders the first five findings by priority and keeps every remaining finding reachable", async () => {
    const user = userEvent.setup();
    render(<PublicScanResults record={makeRecord({ findingSpecs: manyFindingSpecs })} />);

    const priorityList = screen.getByRole("list", {
      name: "Highest-priority findings",
    });
    const visibleTitles = within(priorityList)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);

    expect(visibleTitles).toEqual([
      "Redirects need an immediate fix",
      "Description needs an immediate fix",
      "Indexing needs an immediate fix",
      "HTTPS needs attention",
      "Headings need attention",
    ]);
    expect(
      within(priorityList).getAllByText("View fix, evidence, and verification")[0],
    ).toHaveTextContent(/for Redirects need an immediate fix/i);

    const remainingSummary = screen.getByText("View 4 more findings");
    const remainingDisclosure = remainingSummary.closest("details");
    expect(remainingDisclosure).not.toHaveAttribute("open");
    await user.click(remainingSummary);
    expect(remainingDisclosure).toHaveAttribute("open");

    const remainingList = screen.getByRole("list", { name: "Remaining findings" });
    expect(within(remainingList).getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(
      within(remainingList).getByRole("heading", {
        level: 3,
        name: "Improve robots access",
      }),
    ).toBeInTheDocument();
    expect(
      within(remainingList).getByRole("heading", {
        level: 3,
        name: "Optional title review",
      }),
    ).toBeInTheDocument();
  });

  it("makes finding disclosures keyboard operable and exposes every required detail", async () => {
    const user = userEvent.setup();
    const spec: FindingSpec = {
      overrides: {
        affectedUrls: ["https://example.com/", "https://example.com/home"],
        confidence: "medium",
        effort: "high",
        evidence: [{ label: "HTTP status", value: "500" }],
        fix: "Return the intended homepage with HTTP 200.",
        impact: "Visitors and crawlers can treat the homepage as unavailable.",
        verify: "Request the homepage again and confirm HTTP 200.",
      },
      priority: "fix-now",
      ruleId: "TECH-STATUS-001",
      title: "Homepage response failed",
    };
    render(<PublicScanResults record={makeRecord({ findingSpecs: [spec] })} />);

    await user.tab();
    const disclosure = screen.getByText("View fix, evidence, and verification");
    expect(disclosure).toHaveFocus();
    expect(disclosure.tagName).toBe("SUMMARY");

    // JSDOM does not implement the browser's native Enter/Space activation for
    // summary elements. Focus traversal proves keyboard reachability; clicking
    // exercises the same native disclosure default action for its content.
    await user.click(disclosure);

    expect(disclosure.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Visitors and crawlers can treat the homepage as unavailable.")).toBeVisible();
    expect(screen.getByText("High")).toBeVisible();
    expect(screen.getByText("Medium")).toBeVisible();
    expect(screen.getByText("Return the intended homepage with HTTP 200.")).toBeVisible();
    expect(screen.getByText("HTTP status")).toBeVisible();
    expect(screen.getByText("500")).toBeVisible();
    expect(screen.getByText("https://example.com/home")).toBeVisible();
    expect(screen.getByText("Request the homepage again and confirm HTTP 200.")).toBeVisible();
  });

  it("renders hostile report strings only as inert text and creates no links or injected HTML", async () => {
    const user = userEvent.setup();
    const hostileTitle = '<img src=x onerror="alert(1)">';
    const hostileScript = "<script>window.stolen = true</script>";
    const hostileUrl = "https://example.com/<svg/onload=alert(1)>";
    const record = makeRecord({
      findingSpecs: [
        {
          overrides: {
            affectedUrls: [hostileUrl],
            evidence: [{ label: "<b>Observed</b>", value: hostileScript }],
            explanation: hostileScript,
            fix: hostileScript,
            impact: hostileScript,
            verify: hostileScript,
          },
          priority: "fix-now",
          ruleId: "TECH-STATUS-001",
          title: hostileTitle,
        },
      ],
      target: {
        hostname: "<strong>example.com</strong>",
        origin: "https://example.com/<iframe>",
      },
    });
    const { container } = render(<PublicScanResults record={record} />);

    expect(screen.getByText(hostileTitle)).toBeInTheDocument();
    expect(screen.getByText("https://example.com/<iframe>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain(record.scanId);

    await user.click(screen.getByText("View fix, evidence, and verification"));
    expect(screen.getAllByText(hostileScript)).toHaveLength(5);
    expect(screen.getByText(hostileUrl)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.innerHTML).toContain("&lt;script&gt;");
  });

  it("keeps long titles, evidence, summaries, and URLs in wrapping containers", async () => {
    const user = userEvent.setup();
    const longString = `start-${"x".repeat(8_000)}-end`;
    const record = makeRecord({
      findingSpecs: [
        {
          overrides: {
            affectedUrls: [`https://example.com/${longString}`],
            evidence: [{ label: "Long evidence", value: longString }],
            explanation: longString,
            fix: longString,
            impact: longString,
            verify: longString,
          },
          priority: "fix-now",
          ruleId: "TECH-STATUS-001",
          title: longString,
        },
      ],
      target: {
        hostname: longString,
        origin: `https://${longString}.example`,
      },
    });
    render(<PublicScanResults record={record} />);

    for (const element of screen.getAllByText(longString)) {
      expect(element).toHaveClass("[overflow-wrap:anywhere]");
    }

    await user.click(screen.getByText("View fix, evidence, and verification"));
    expect(screen.getByText(`https://example.com/${longString}`)).toHaveClass(
      "[overflow-wrap:anywhere]",
    );
    expect(screen.getByText("Long evidence").nextElementSibling).toHaveClass(
      "[overflow-wrap:anywhere]",
    );
  });

  it("explains a robots-blocked result without turning unavailable checks into passes", async () => {
    const user = userEvent.setup();
    const notCheckedRuleIds = PUBLIC_HOMEPAGE_RULES.map(({ ruleId }) => ruleId).filter(
      (ruleId) => ruleId !== "SEARCH-ROBOTS-001",
    );
    const record = makeRecord({
      findingSpecs: [
        {
          priority: "fix-now",
          ruleId: "SEARCH-ROBOTS-001",
          title: "SiteMend is blocked from your homepage",
        },
      ],
      notCheckedRuleIds,
      outcome: "blocked-by-robots",
    });
    render(<PublicScanResults record={record} />);

    expect(screen.getByText("Blocked by robots.txt")).toBeInTheDocument();
    expect(screen.getByText(/checks that needed that HTML are marked Not checked/i)).toBeInTheDocument();
    expect(
      screen.getByText(/robots\.txt access check derived from pre-fetch policy evidence/i),
    ).toHaveTextContent(/other eight homepage checks are marked Not checked/i);
    expect(
      screen.queryByText(/nine deterministic checks derived from a bounded homepage crawl/i),
    ).not.toBeInTheDocument();

    const summary = screen.getByRole("heading", { name: "Check summary" }).parentElement!;
    expect(within(summary).getByText("Needs attention").nextElementSibling).toHaveTextContent("1");
    expect(within(summary).getByText("Passed").nextElementSibling).toHaveTextContent("0");
    expect(within(summary).getByText("Not checked").nextElementSibling).toHaveTextContent("8");

    await user.click(screen.getByText("View all 9 checks"));
    const checks = screen.getByRole("list", { name: "All homepage checks" });
    expect(within(checks).getAllByText("Not checked")).toHaveLength(8);
    expect(within(checks).getByText("Needs attention")).toBeInTheDocument();
  });

  it("states the bounded result when all nine homepage checks pass", async () => {
    const user = userEvent.setup();
    render(<PublicScanResults record={makeRecord()} />);

    expect(
      screen.getByText("No fixes were found in these nine homepage checks."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Highest-priority findings" })).not.toBeInTheDocument();
    expect(screen.queryByText(/perfect|healthy everywhere|all site checks/i)).not.toBeInTheDocument();

    await user.click(screen.getByText("View all 9 checks"));
    const checks = screen.getByRole("list", { name: "All homepage checks" });
    expect(within(checks).getAllByText("Passed")).toHaveLength(9);
  });

  it(
    "has no detectable automated accessibility violations",
    async () => {
      render(<PublicScanResults record={makeRecord({ findingSpecs: manyFindingSpecs })} />);

      for (const disclosure of document.querySelectorAll("details")) {
        disclosure.open = true;
      }

      const result = await axe.run(document.body, {
        rules: {
          "color-contrast": { enabled: false },
        },
      });

      expect(result.violations).toEqual([]);
    },
    15_000,
  );
});
