import {
  HOMEPAGE_AUDIT_RULESET_VERSION,
  type AuditCategory,
  type AuditConfidence,
  type AuditEffort,
  type AuditEvidenceItem,
  type AuditPriority,
  type HomepageAuditCheck,
  type HomepageAuditFinding,
  type HomepageAuditInput,
  type HomepageAuditReport,
  type HomepageRuleId,
} from "./types";

const RULE_VERSION = "1.0.0" as const;

interface FailedCheckOptions {
  affectedUrls?: ReadonlyArray<string>;
  category: AuditCategory;
  confidence?: AuditConfidence;
  effort: AuditEffort;
  evidence: ReadonlyArray<AuditEvidenceItem>;
  explanation: string;
  fix: string;
  impact: string;
  priority: AuditPriority;
  ruleId: HomepageRuleId;
  summary: string;
  title: string;
  verify: string;
}

function item(label: string, value: string | number): AuditEvidenceItem {
  return { label, value: String(value) };
}

function failed(
  input: HomepageAuditInput,
  options: FailedCheckOptions,
): HomepageAuditCheck {
  const finding: HomepageAuditFinding = {
    affectedUrls:
      options.affectedUrls ?? [input.finalUrl ?? input.blockedAt ?? input.requestedUrl],
    category: options.category,
    confidence: options.confidence ?? "high",
    dataLabel: "derived",
    effort: options.effort,
    evidence: options.evidence,
    explanation: options.explanation,
    fix: options.fix,
    impact: options.impact,
    priority: options.priority,
    ruleId: options.ruleId,
    ruleVersion: RULE_VERSION,
    title: options.title,
    verify: options.verify,
  };

  return {
    category: options.category,
    evidence: options.evidence,
    finding,
    ruleId: options.ruleId,
    ruleVersion: RULE_VERSION,
    status: "failed",
    summary: options.summary,
  };
}

function passed(
  ruleId: HomepageRuleId,
  category: AuditCategory,
  summary: string,
  evidence: ReadonlyArray<AuditEvidenceItem>,
): HomepageAuditCheck {
  return {
    category,
    evidence,
    finding: null,
    ruleId,
    ruleVersion: RULE_VERSION,
    status: "passed",
    summary,
  };
}

function notApplicable(
  ruleId: HomepageRuleId,
  category: AuditCategory,
  summary: string,
): HomepageAuditCheck {
  return {
    category,
    evidence: [],
    finding: null,
    ruleId,
    ruleVersion: RULE_VERSION,
    status: "not-applicable",
    summary,
  };
}

function auditStatus(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "TECH-STATUS-001";

  if (input.statusCode === null || !input.finalUrl) {
    return notApplicable(ruleId, "technical-health", "The homepage was not fetched.");
  }

  const evidence = [
    item("Final URL", input.finalUrl),
    item("HTTP status", input.statusCode),
  ];

  if (input.statusCode === 200) {
    return passed(
      ruleId,
      "technical-health",
      "Your homepage returned HTTP 200.",
      evidence,
    );
  }

  return failed(input, {
    category: "technical-health",
    effort: "medium",
    evidence,
    explanation: `The final homepage response was HTTP ${input.statusCode} instead of a normal HTTP 200 page.`,
    fix: "Make the preferred homepage URL return its complete HTML with HTTP 200. Keep error, empty, and partial responses on their appropriate status codes.",
    impact: "Search engines and visitors may treat a non-200 homepage as unavailable or unsuitable for indexing.",
    priority: "fix-now",
    ruleId,
    summary: `The homepage returned HTTP ${input.statusCode}.`,
    title: "Your homepage did not return a normal page",
    verify: "Request the final homepage URL again and confirm that it returns HTTP 200 with the intended HTML.",
  });
}

function auditHttps(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "TECH-HTTPS-001";

  if (!input.finalUrl) {
    return notApplicable(ruleId, "technical-health", "The homepage was not fetched.");
  }

  const evidence = [item("Final URL", input.finalUrl)];

  if (new URL(input.finalUrl).protocol === "https:") {
    return passed(
      ruleId,
      "technical-health",
      "Your final homepage uses HTTPS.",
      evidence,
    );
  }

  return failed(input, {
    category: "technical-health",
    effort: "medium",
    evidence,
    explanation: "The final homepage is served over unencrypted HTTP.",
    fix: "Install a valid TLS certificate, serve the homepage on HTTPS, update internal references, and permanently redirect the HTTP version to HTTPS.",
    impact: "HTTP weakens visitor security and can make the non-secure URL a less suitable search destination.",
    priority: "fix-now",
    ruleId,
    summary: "The final homepage still uses HTTP.",
    title: "Your homepage is not protected by HTTPS",
    verify: "Open the final homepage with https:// and confirm the certificate is valid and the HTTP URL permanently redirects there.",
  });
}

function auditRobots(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "SEARCH-ROBOTS-001";
  const evidence = input.robots.map((robot) =>
    item(
      robot.origin,
      robot.status === "found" ? "robots.txt checked" : "No robots.txt found; access allowed",
    ),
  );

  if (!input.blockedAt) {
    return passed(
      ruleId,
      "search-visibility",
      "SiteMend was allowed to fetch the homepage.",
      evidence,
    );
  }

  return failed(input, {
    affectedUrls: [input.blockedAt],
    category: "search-visibility",
    effort: "low",
    evidence: [...evidence, item("Blocked URL", input.blockedAt)],
    explanation: "robots.txt disallows SiteMendBot from fetching this homepage, so the remaining page checks could not run.",
    fix: "Review the matching robots.txt group and allow SiteMendBot to fetch the public homepage if you want it audited.",
    impact: "SiteMend cannot inspect or verify the page. This result does not by itself prove that search-engine crawlers are blocked.",
    priority: "fix-now",
    ruleId,
    summary: "robots.txt blocked the homepage scan.",
    title: "SiteMend is blocked from your homepage",
    verify: "Test the homepage against robots.txt as SiteMendBot, then rescan and confirm this check passes.",
  });
}

function auditRedirects(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "TECH-REDIRECTS-001";

  if (!input.finalUrl) {
    return notApplicable(ruleId, "technical-health", "The homepage was not fetched.");
  }

  const evidence = [
    item("Redirect hops", input.redirects.length),
    ...input.redirects.map((redirect, index) =>
      item(
        `Hop ${index + 1}`,
        `${redirect.statusCode}: ${redirect.from} -> ${redirect.to}`,
      ),
    ),
  ];
  const temporary = input.redirects.filter((redirect) =>
    [302, 303, 307].includes(redirect.statusCode),
  );

  if (input.redirects.length > 1) {
    return failed(input, {
      category: "technical-health",
      effort: "medium",
      evidence,
      explanation: `The homepage takes ${input.redirects.length} redirect hops before reaching the final page.`,
      fix: "Point the starting homepage URL and internal links directly to the final preferred URL, using one permanent redirect where a redirect is necessary.",
      impact: "Extra hops add delay and make crawling, caching, and URL consolidation less direct.",
      priority: "fix-soon",
      ruleId,
      summary: `The homepage uses a ${input.redirects.length}-hop redirect chain.`,
      title: "Your homepage takes multiple detours",
      verify: "Request the starting URL again and confirm it reaches the preferred homepage in no more than one redirect.",
    });
  }

  if (temporary.length > 0) {
    return failed(input, {
      category: "technical-health",
      confidence: "medium",
      effort: "low",
      evidence,
      explanation: `The homepage uses HTTP ${temporary[0]?.statusCode}, which describes a temporary redirect.`,
      fix: "If this move is intended to be lasting, replace the temporary redirect with HTTP 301 or 308. Keep it temporary when the destination really is short-lived.",
      impact: "A temporary redirect can make the preferred long-term homepage less explicit to clients and search engines.",
      priority: "improvement",
      ruleId,
      summary: "The homepage uses a temporary redirect.",
      title: "Confirm whether this homepage redirect is temporary",
      verify: "Request the starting URL and confirm the redirect status matches whether the move is temporary or permanent.",
    });
  }

  return passed(
    ruleId,
    "technical-health",
    input.redirects.length === 0
      ? "Your homepage loads without a redirect."
      : "Your homepage reaches its preferred URL in one permanent redirect.",
    evidence,
  );
}

function auditTitle(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "SEARCH-TITLE-001";
  const title = input.document?.title;

  if (!title || !input.finalUrl) {
    return notApplicable(ruleId, "search-visibility", "No homepage HTML was available.");
  }

  const evidence = [
    item("Title elements", title.count),
    item("Empty title elements", title.emptyCount),
    ...(title.first
      ? [item("First title", title.first.text), item("Title length", title.first.length)]
      : []),
  ];

  if (title.count === 1 && title.emptyCount === 0) {
    return passed(
      ruleId,
      "search-visibility",
      "Your homepage has one non-empty title.",
      evidence,
    );
  }

  const missing = title.count === 0 || title.emptyCount === title.count;
  return failed(input, {
    category: "search-visibility",
    effort: "low",
    evidence,
    explanation: missing
      ? "The initial homepage HTML does not provide a non-empty title element."
      : `The initial homepage HTML contains ${title.count} title elements, so the intended title is ambiguous.`,
    fix: "Add one concise, descriptive <title> for the homepage in the initial HTML and remove empty or duplicate title elements.",
    impact: "The title is a strong source for browser labels and search-result title links; missing or competing titles reduce clarity.",
    priority: "fix-soon",
    ruleId,
    summary: missing ? "The homepage title is missing or empty." : "The homepage has multiple titles.",
    title: missing ? "Give your homepage a clear title" : "Keep one clear homepage title",
    verify: "View the initial HTML and confirm it contains exactly one non-empty <title>, then rescan.",
  });
}

function auditDescription(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "SEARCH-DESCRIPTION-001";
  const description = input.document?.description;

  if (!description || !input.finalUrl) {
    return notApplicable(ruleId, "search-visibility", "No homepage HTML was available.");
  }

  const evidence = [
    item("Meta descriptions", description.count),
    item("Empty descriptions", description.emptyCount),
    ...(description.first
      ? [
          item("First description", description.first.text),
          item("Description length", description.first.length),
        ]
      : []),
  ];

  if (description.count === 1 && description.emptyCount === 0) {
    return passed(
      ruleId,
      "search-visibility",
      "Your homepage has one non-empty meta description.",
      evidence,
    );
  }

  const missing = description.count === 0 || description.emptyCount === description.count;
  return failed(input, {
    category: "search-visibility",
    effort: "low",
    evidence,
    explanation: missing
      ? "The initial homepage HTML does not provide a non-empty meta description."
      : `The initial homepage HTML contains ${description.count} meta descriptions, so the intended summary is ambiguous.`,
    fix: "Add one useful <meta name=\"description\"> summary to the initial HTML and remove empty or duplicate description tags.",
    impact: "Search engines may use this summary when describing the page, although they can choose other page text for a result snippet.",
    priority: "improvement",
    ruleId,
    summary: missing
      ? "The homepage description is missing or empty."
      : "The homepage has multiple descriptions.",
    title: missing
      ? "Add a useful homepage summary"
      : "Keep one homepage summary",
    verify: "View the initial HTML and confirm it contains one non-empty meta description, then rescan.",
  });
}

function auditCanonical(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "SEARCH-CANONICAL-001";
  const canonical = input.document?.canonical;

  if (!canonical || !input.finalUrl) {
    return notApplicable(ruleId, "search-visibility", "No homepage HTML was available.");
  }

  const evidence = [
    item("Canonical elements", canonical.count),
    ...canonical.entries.map((entry, index) =>
      item(
        `Canonical ${index + 1}`,
        entry.valid
          ? `${entry.url} (${entry.matchesPage ? "matches page" : "different from page"})`
          : "Missing or invalid HTTP(S) URL",
      ),
    ),
  ];

  if (canonical.count === 0) {
    return failed(input, {
      category: "search-visibility",
      confidence: "medium",
      effort: "low",
      evidence,
      explanation: "The homepage does not declare a canonical URL. A canonical is recommended for making the preferred version explicit, but it is not required for indexing.",
      fix: "If the homepage has duplicate URL variants, add one absolute self-referencing rel=\"canonical\" URL in the initial HTML.",
      impact: "Search engines must rely on other signals to choose between duplicate homepage URLs.",
      priority: "optional",
      ruleId,
      summary: "The homepage has no canonical URL.",
      title: "Make the preferred homepage URL explicit",
      verify: "View the initial HTML and confirm one canonical points to the preferred homepage URL.",
    });
  }

  if (
    canonical.count !== 1 ||
    canonical.entriesTruncated ||
    !canonical.entries[0]?.valid
  ) {
    return failed(input, {
      category: "search-visibility",
      effort: "low",
      evidence,
      explanation: "The homepage has multiple, missing-value, or invalid canonical declarations, so the preferred URL is unclear.",
      fix: "Keep exactly one absolute HTTP(S) canonical URL in the initial HTML and remove conflicting or invalid canonical tags.",
      impact: "Conflicting canonical signals can cause search engines to select an unexpected preferred URL.",
      priority: "fix-soon",
      ruleId,
      summary: "The homepage canonical is conflicting or invalid.",
      title: "Keep one valid homepage canonical",
      verify: "View the initial HTML and confirm there is exactly one valid canonical declaration, then rescan.",
    });
  }

  if (!canonical.entries[0].matchesPage) {
    return failed(input, {
      category: "search-visibility",
      confidence: "medium",
      effort: "low",
      evidence,
      explanation: "The homepage canonical points to a different URL. This can be intentional, but it should match the page you want search engines to treat as preferred.",
      fix: "Confirm the target is intentional. Otherwise update the canonical to the preferred homepage URL and align redirects and internal links with it.",
      impact: "A different canonical can ask search engines to consolidate this homepage under another URL.",
      priority: "improvement",
      ruleId,
      summary: "The canonical points to a different URL.",
      title: "Confirm the homepage canonical target",
      verify: "Compare the canonical with the intended preferred homepage URL and rescan after aligning them.",
    });
  }

  return passed(
    ruleId,
    "search-visibility",
    "Your homepage has one self-referencing canonical.",
    evidence,
  );
}

function auditHeadings(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "CONTENT-HEADINGS-001";
  const headings = input.document?.headings;

  if (!headings || !input.finalUrl) {
    return notApplicable(ruleId, "content-structure", "No homepage HTML was available.");
  }

  const evidence = [
    item("H1 headings", headings.counts.h1),
    item("Non-empty H1 headings", headings.nonEmptyCounts.h1),
    item("H2-H6 headings", Object.values(headings.counts).slice(1).reduce((a, b) => a + b, 0)),
    item("Empty headings", headings.emptyCount),
    item("Skipped levels", headings.skippedLevelCount),
  ];

  if (headings.nonEmptyCounts.h1 === 0) {
    return failed(input, {
      category: "content-structure",
      effort: "low",
      evidence,
      explanation: "The initial homepage HTML does not contain a non-empty H1 heading for its main topic.",
      fix: "Add one visible, descriptive H1 near the main content and organize supporting sections with lower heading levels.",
      impact: "A clear main heading helps visitors and assistive technology understand the page's purpose and structure.",
      priority: "fix-soon",
      ruleId,
      summary: "The homepage has no H1 heading.",
      title: "Add a clear main homepage heading",
      verify: "Inspect the initial HTML and rendered page, confirm the main topic uses an H1, then rescan.",
    });
  }

  if (headings.counts.h1 > 1) {
    return failed(input, {
      category: "content-structure",
      confidence: "medium",
      effort: "low",
      evidence,
      explanation: `The homepage contains ${headings.counts.h1} H1 headings. Multiple H1s can be valid, but one main heading is usually easier to scan and maintain.`,
      fix: "Confirm that each H1 represents a true top-level section. If not, keep one main H1 and change supporting headings to the appropriate lower level.",
      impact: "A simpler hierarchy can make the page structure clearer to visitors and assistive technology.",
      priority: "improvement",
      ruleId,
      summary: "The homepage has multiple H1 headings.",
      title: "Simplify the homepage heading hierarchy",
      verify: "Review the rendered heading outline and confirm it communicates one clear page topic.",
    });
  }

  if (headings.emptyCount > 0) {
    return failed(input, {
      category: "content-structure",
      effort: "low",
      evidence,
      explanation: `The homepage contains ${headings.emptyCount} empty heading element(s).`,
      fix: "Remove empty heading elements or give each one visible text that accurately introduces its section.",
      impact: "Empty headings add noise to the document outline, especially for visitors using assistive navigation.",
      priority: "improvement",
      ruleId,
      summary: "The homepage contains empty headings.",
      title: "Remove empty headings",
      verify: "Review the heading outline and confirm every heading has useful visible text, then rescan.",
    });
  }

  if (headings.skippedLevelCount > 0) {
    return failed(input, {
      category: "content-structure",
      confidence: "medium",
      effort: "low",
      evidence,
      explanation: `The heading outline jumps over a level ${headings.skippedLevelCount} time(s).`,
      fix: "Use heading levels to reflect section nesting without jumping from, for example, H2 directly to H4.",
      impact: "A sequential outline is easier for visitors using assistive navigation to understand.",
      priority: "improvement",
      ruleId,
      summary: "The homepage heading outline skips levels.",
      title: "Make the heading order easier to follow",
      verify: "Review the heading outline in document order and confirm each nested section advances by no more than one level.",
    });
  }

  return passed(
    ruleId,
    "content-structure",
    "Your homepage has one H1 and a sequential heading outline.",
    evidence,
  );
}

function auditIndexing(input: HomepageAuditInput): HomepageAuditCheck {
  const ruleId = "SEARCH-INDEXING-001";
  const indexing = input.document?.indexing;

  if (!indexing || !input.finalUrl) {
    return notApplicable(ruleId, "search-visibility", "No homepage HTML was available.");
  }

  const evidence = [
    item("Indexing", indexing.effectiveIndex),
    item("Link following", indexing.effectiveFollow),
    item("Directive sources", indexing.totalSources),
    ...indexing.sources.map((source, index) =>
      item(`Source ${index + 1}`, `${source.source}: ${source.directives.join(", ")}`),
    ),
  ];

  if (indexing.effectiveIndex !== "allowed") {
    const followAlsoBlocked = indexing.effectiveFollow !== "allowed";

    return failed(input, {
      category: "search-visibility",
      effort: "low",
      evidence,
      explanation:
        indexing.effectiveIndex === "conflicting"
          ? `The homepage sends both index and noindex directives. Search engines use the more restrictive noindex instruction.${followAlsoBlocked ? " It also sends a nofollow instruction." : ""}`
          : `The homepage sends a noindex instruction in its HTML or response headers.${followAlsoBlocked ? " It also sends a nofollow instruction." : ""}`,
      fix: "If the public homepage should appear in search, remove every noindex directive from robots/googlebot meta tags and X-Robots-Tag headers. Remove page-level nofollow too if crawlers should follow homepage links. Keep either restriction only when it is intentional.",
      impact: `A supported noindex directive asks search engines to remove or exclude this homepage from search results.${followAlsoBlocked ? " Nofollow also asks supporting crawlers not to follow its links." : ""}`,
      priority: "fix-now",
      ruleId,
      summary: "The homepage asks search engines not to index it.",
      title: "Your homepage is set to stay out of search",
      verify: "Fetch the final homepage, inspect both initial HTML and X-Robots-Tag headers, and confirm no unintended noindex or nofollow remains before rescanning.",
    });
  }

  if (indexing.effectiveFollow !== "allowed") {
    return failed(input, {
      category: "search-visibility",
      effort: "low",
      evidence,
      explanation:
        indexing.effectiveFollow === "conflicting"
          ? "The homepage sends both follow and nofollow directives; the more restrictive nofollow instruction applies."
          : "The homepage sends a nofollow instruction in its HTML or response headers.",
      fix: "Remove nofollow from the page-level robots/googlebot meta tags and X-Robots-Tag headers if crawlers should follow homepage links.",
      impact: "A page-level nofollow instruction asks supporting search crawlers not to follow links from the homepage.",
      priority: "fix-soon",
      ruleId,
      summary: "The homepage asks search crawlers not to follow its links.",
      title: "Let search crawlers follow homepage links",
      verify: "Inspect the initial HTML and X-Robots-Tag headers, confirm no page-level nofollow remains, then rescan.",
    });
  }

  return passed(
    ruleId,
    "search-visibility",
    "No page-level noindex or nofollow directive was found.",
    evidence,
  );
}

export function auditHomepage(input: HomepageAuditInput): HomepageAuditReport {
  const checks = [
    auditStatus(input),
    auditHttps(input),
    auditRobots(input),
    auditRedirects(input),
    auditTitle(input),
    auditDescription(input),
    auditCanonical(input),
    auditHeadings(input),
    auditIndexing(input),
  ];

  return {
    checks,
    findings: checks.flatMap((check) => (check.finding ? [check.finding] : [])),
    rulesetVersion: HOMEPAGE_AUDIT_RULESET_VERSION,
    schemaVersion: 1,
  };
}
