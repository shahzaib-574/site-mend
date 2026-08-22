import {
  type PublicAuditCategory,
  type PublicAuditPriority,
  type PublicAuditStatus,
  type PublicHomepageCheck,
  type PublicHomepageFinding,
  type PublicHomepageRuleId,
  type PublicScanStatusRecord,
} from "@/lib/public-scan-contract";

type CompletedPublicScan = Extract<
  PublicScanStatusRecord,
  Readonly<{ status: "completed" }>
>;

type PublicScanResultsProps = Readonly<{
  record: CompletedPublicScan;
}>;

const priorityOrder: Readonly<Record<PublicAuditPriority, number>> = {
  "fix-now": 0,
  "fix-soon": 1,
  improvement: 2,
  optional: 3,
};

const priorityLabels: Readonly<Record<PublicAuditPriority, string>> = {
  "fix-now": "Fix now",
  "fix-soon": "Fix soon",
  improvement: "Improvement",
  optional: "Optional",
};

const priorityClasses: Readonly<Record<PublicAuditPriority, string>> = {
  "fix-now": "text-danger",
  "fix-soon": "text-accent-strong",
  improvement: "text-accent",
  optional: "text-muted",
};

const categoryLabels: Readonly<Record<PublicAuditCategory, string>> = {
  "content-structure": "Content structure",
  "search-visibility": "Search visibility",
  "technical-health": "Technical health",
};

const confidenceLabels: Readonly<
  Record<PublicHomepageFinding["confidence"], string>
> = {
  high: "High",
  medium: "Medium",
};

const effortLabels: Readonly<Record<PublicHomepageFinding["effort"], string>> = {
  high: "High",
  low: "Low",
  medium: "Medium",
};

const statusLabels: Readonly<Record<PublicAuditStatus, string>> = {
  failed: "Needs attention",
  "not-applicable": "Not checked",
  passed: "Passed",
};

const statusClasses: Readonly<Record<PublicAuditStatus, string>> = {
  failed: "text-danger",
  "not-applicable": "text-muted",
  passed: "text-success",
};

const ruleLabels: Readonly<Record<PublicHomepageRuleId, string>> = {
  "CONTENT-HEADINGS-001": "Heading structure",
  "SEARCH-CANONICAL-001": "Canonical URL",
  "SEARCH-DESCRIPTION-001": "Meta description",
  "SEARCH-INDEXING-001": "Indexing directives",
  "SEARCH-ROBOTS-001": "robots.txt access",
  "SEARCH-TITLE-001": "Homepage title",
  "TECH-HTTPS-001": "HTTPS",
  "TECH-REDIRECTS-001": "Redirects",
  "TECH-STATUS-001": "Homepage response",
};

const timestampFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return `${timestampFormatter.format(date)} UTC`;
}

function sortFindings(
  findings: ReadonlyArray<PublicHomepageFinding>,
): ReadonlyArray<PublicHomepageFinding> {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (left, right) =>
        priorityOrder[left.finding.priority] -
          priorityOrder[right.finding.priority] || left.index - right.index,
    )
    .map(({ finding }) => finding);
}

function EvidenceList({
  evidence,
  emptyMessage,
}: Readonly<{
  evidence: PublicHomepageFinding["evidence"];
  emptyMessage: string;
}>) {
  if (evidence.length === 0) {
    return <p className="mt-2 text-sm leading-6 text-muted">{emptyMessage}</p>;
  }

  return (
    <ul className="mt-3 grid gap-2">
      {evidence.map((item, index) => (
        <li
          className="soft-inset grid gap-1 p-3 text-sm sm:grid-cols-[minmax(8rem,0.35fr)_minmax(0,1fr)] sm:gap-4"
          key={`${item.label}-${index}`}
        >
          <span className="font-bold text-ink [overflow-wrap:anywhere]">
            {item.label}
          </span>
          <span className="font-mono leading-6 text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Finding({
  finding,
  headingId,
}: Readonly<{
  finding: PublicHomepageFinding;
  headingId: string;
}>) {
  return (
    <article aria-labelledby={headingId} className="soft-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-black uppercase tracking-[0.1em]">
        <span className={priorityClasses[finding.priority]}>
          {priorityLabels[finding.priority]}
        </span>
        <span aria-hidden="true" className="text-line">
          •
        </span>
        <span className="text-muted">{categoryLabels[finding.category]}</span>
      </div>

      <h3
        className="mt-3 text-lg font-black tracking-[-0.02em] text-ink [overflow-wrap:anywhere]"
        id={headingId}
      >
        {finding.title}
      </h3>
      <p className="mt-3 leading-7 text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
        {finding.explanation}
      </p>

      <details className="mt-5 border-t border-line pt-4">
        <summary className="min-h-12 cursor-pointer rounded-xl py-3 font-extrabold text-accent underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
          View fix, evidence, and verification
          <span className="sr-only"> for {finding.title}</span>
        </summary>

        <div className="mt-4 grid gap-6">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.1em] text-muted">
                Impact
              </dt>
              <dd className="mt-1 leading-6 text-ink [overflow-wrap:anywhere] whitespace-pre-wrap">
                {finding.impact}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.1em] text-muted">
                Effort
              </dt>
              <dd className="mt-1 font-bold text-ink">
                {effortLabels[finding.effort]}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.1em] text-muted">
                Confidence
              </dt>
              <dd className="mt-1 font-bold text-ink">
                {confidenceLabels[finding.confidence]}
              </dd>
            </div>
          </dl>

          <div>
            <h4 className="font-black text-ink">How to fix it</h4>
            <p className="mt-2 leading-7 text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
              {finding.fix}
            </p>
          </div>

          <div>
            <h4 className="font-black text-ink">Derived evidence</h4>
            <EvidenceList
              emptyMessage="No public evidence was recorded for this finding."
              evidence={finding.evidence}
            />
          </div>

          <div>
            <h4 className="font-black text-ink">Affected URLs</h4>
            {finding.affectedUrls.length === 0 ? (
              <p className="mt-2 text-sm leading-6 text-muted">
                No affected URL was recorded.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {finding.affectedUrls.map((url, index) => (
                  <li
                    className="soft-inset p-3 font-mono text-sm leading-6 text-muted [overflow-wrap:anywhere]"
                    key={`${url}-${index}`}
                  >
                    {url}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="font-black text-ink">How to verify the fix</h4>
            <p className="mt-2 leading-7 text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
              {finding.verify}
            </p>
          </div>
        </div>
      </details>
    </article>
  );
}

function FindingList({
  findings,
  idPrefix,
  label,
}: Readonly<{
  findings: ReadonlyArray<PublicHomepageFinding>;
  idPrefix: string;
  label: string;
}>) {
  return (
    <ol aria-label={label} className="grid gap-4">
      {findings.map((finding, index) => (
        <li key={`${finding.ruleId}-${index}`}>
          <Finding
            finding={finding}
            headingId={`${idPrefix}-${finding.ruleId}-${index}`}
          />
        </li>
      ))}
    </ol>
  );
}

function Check({ check }: Readonly<{ check: PublicHomepageCheck }>) {
  return (
    <li className="border-b border-line py-4 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <p className="font-extrabold text-ink">{ruleLabels[check.ruleId]}</p>
          <p className="mt-1 text-sm leading-6 text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
            {check.summary}
          </p>
        </div>
        <p
          className={`shrink-0 text-sm font-black ${statusClasses[check.status]}`}
        >
          {statusLabels[check.status]}
        </p>
      </div>

      <details className="mt-2">
        <summary className="min-h-12 cursor-pointer rounded-xl py-3 text-sm font-bold text-accent underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
          View check evidence
          <span className="sr-only"> for {ruleLabels[check.ruleId]}</span>
        </summary>
        <EvidenceList
          emptyMessage="No evidence was collected because this check did not run."
          evidence={check.evidence}
        />
      </details>
    </li>
  );
}

export function PublicScanResults({ record }: PublicScanResultsProps) {
  const { report } = record.result;
  const orderedFindings = sortFindings(report.findings);
  const priorityFindings = orderedFindings.slice(0, 5);
  const remainingFindings = orderedFindings.slice(5);
  const failedCount = report.checks.filter(
    (check) => check.status === "failed",
  ).length;
  const passedCount = report.checks.filter(
    (check) => check.status === "passed",
  ).length;
  const notCheckedCount = report.checks.filter(
    (check) => check.status === "not-applicable",
  ).length;
  const headingId = "public-scan-results-title";
  const noFindingMessage =
    notCheckedCount > 0
      ? "No fixes were produced by the checks that ran. Review the Not checked items before drawing a wider conclusion."
      : "No fixes were found in these nine homepage checks.";

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8 lg:px-10"
    >
      <header className="soft-panel p-5 sm:p-7">
        <p className="section-kicker">Completed homepage report</p>
        <h1
          className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink [overflow-wrap:anywhere] sm:text-4xl"
          id={headingId}
        >
          Results for {record.target.hostname}
        </h1>
        <p className="mt-3 font-mono text-sm leading-6 text-muted [overflow-wrap:anywhere]">
          {record.target.origin}
        </p>

        <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.1em] text-muted">
              Outcome
            </dt>
            <dd className="mt-1 font-extrabold text-ink">
              {record.result.outcome === "fetched"
                ? "Homepage fetched"
                : "Blocked by robots.txt"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.1em] text-muted">
              Queued
            </dt>
            <dd className="mt-1 text-ink">
              <time dateTime={record.queuedAt}>
                {formatTimestamp(record.queuedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.1em] text-muted">
              Completed
            </dt>
            <dd className="mt-1 text-ink">
              <time dateTime={record.result.completedAt}>
                {formatTimestamp(record.result.completedAt)}
              </time>
            </dd>
          </div>
        </dl>

        <p className="mt-5 border-t border-line pt-5 leading-7 text-muted">
          {record.result.outcome === "fetched"
            ? "SiteMend evaluated the returned homepage evidence."
            : "robots.txt stopped SiteMend before the homepage HTML was fetched. Checks that needed that HTML are marked Not checked."}
        </p>
      </header>

      <section aria-labelledby={`${headingId}-scope`} className="mt-8">
        <h2 className="text-xl font-black text-ink" id={`${headingId}-scope`}>
          What this report covers
        </h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          {record.result.outcome === "fetched"
            ? "This report contains nine deterministic checks derived from a bounded homepage crawl and its robots and redirect evidence: status, HTTPS, robots access, redirects, title, description, canonical, headings, and indexing directives."
            : "This report contains the robots.txt access check derived from pre-fetch policy evidence. The other eight homepage checks are marked Not checked because SiteMend did not fetch the homepage."}
        </p>
        <p className="mt-2 max-w-3xl leading-7 text-muted">
          It does not include speed measurements, real-user field data,
          multi-page crawling, AEO, or GEO.
        </p>
      </section>

      <section aria-labelledby={`${headingId}-summary`} className="mt-8">
        <h2 className="text-xl font-black text-ink" id={`${headingId}-summary`}>
          Check summary
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="soft-card p-4">
            <dt className="text-sm font-bold text-muted">Needs attention</dt>
            <dd className="mt-1 text-3xl font-black text-danger">{failedCount}</dd>
          </div>
          <div className="soft-card p-4">
            <dt className="text-sm font-bold text-muted">Passed</dt>
            <dd className="mt-1 text-3xl font-black text-success">{passedCount}</dd>
          </div>
          <div className="soft-card p-4">
            <dt className="text-sm font-bold text-muted">Not checked</dt>
            <dd className="mt-1 text-3xl font-black text-ink">{notCheckedCount}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby={`${headingId}-findings`} className="mt-10">
        <h2 className="text-2xl font-black tracking-[-0.03em] text-ink" id={`${headingId}-findings`}>
          What to fix first
        </h2>
        <p className="mt-2 max-w-3xl leading-7 text-muted">
          Findings are ordered by priority. Evidence and verification steps stay
          attached to each recommended fix.
        </p>

        {priorityFindings.length === 0 ? (
          <p className="soft-card mt-5 p-5 leading-7 text-ink">
            {noFindingMessage}
          </p>
        ) : (
          <div className="mt-5">
            <FindingList
              findings={priorityFindings}
              idPrefix={`${headingId}-priority`}
              label="Highest-priority findings"
            />
          </div>
        )}

        {remainingFindings.length > 0 ? (
          <details className="soft-panel mt-5 p-5">
            <summary className="min-h-12 cursor-pointer rounded-xl py-3 font-extrabold text-accent underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
              View {remainingFindings.length} more {remainingFindings.length === 1 ? "finding" : "findings"}
            </summary>
            <div className="mt-4">
              <FindingList
                findings={remainingFindings}
                idPrefix={`${headingId}-remaining`}
                label="Remaining findings"
              />
            </div>
          </details>
        ) : null}
      </section>

      <section aria-labelledby={`${headingId}-checks`} className="mt-10">
        <h2 className="text-2xl font-black tracking-[-0.03em] text-ink" id={`${headingId}-checks`}>
          All homepage checks
        </h2>
        <p className="mt-2 max-w-3xl leading-7 text-muted">
          Open the complete list to review passed, failed, and Not checked results.
        </p>
        <details className="soft-panel mt-5 p-5 sm:p-6">
          <summary className="min-h-12 cursor-pointer rounded-xl py-3 font-extrabold text-accent underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
            View all {report.checks.length} checks
          </summary>
          <ol aria-label="All homepage checks" className="mt-3">
            {report.checks.map((check) => (
              <Check check={check} key={check.ruleId} />
            ))}
          </ol>
        </details>
      </section>
    </section>
  );
}
