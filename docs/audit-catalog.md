# Audit catalog

This catalog is the source of truth for planned checks. Each implemented rule must
gain a stable ID, version, evidence schema, severity rationale, verification step,
and focused test before merge.

| ID prefix | Area | Initial examples |
| --- | --- | --- |
| SEARCH | Search visibility | noindex, robots, sitemap, canonical, title, description |
| TECH | Technical health | status, HTTPS, redirects, broken links, response behavior |
| PERF | Speed and experience | LCP, CLS, TTFB, render blocking, images, fonts |
| CONTENT | Content and structure | headings, alternatives, duplicates, authorship |
| SCHEMA | Structured data | syntax, required fields, visible-content consistency |
| AI | AI readiness | search bot access, extractability, entities, evidence |

## Finding contract

Every finding exposes:

- Stable rule ID and rule version
- Friendly title and explanation
- Evidence and source URL
- Priority, confidence, and affected URLs
- Impact and estimated effort
- Platform-aware remediation
- Verification method
- Lab, field, derived, or experimental data label

## Priority language

- **Fix now**: site-wide availability/indexing failure or serious safety issue
- **Fix soon**: high-impact, well-supported problem
- **Improvement**: meaningful but non-blocking opportunity
- **Optional**: low-impact or experimental guidance

Experimental signals cannot independently create a critical or high-severity
finding or materially lower the overall score.

## Implemented homepage ruleset

`homepage-v1` contains nine deterministic rules at rule version `1.0.0`. A rule
returns `passed`, `failed`, or `not-applicable`; only failed checks contain a
finding. Findings use the full contract above and label their evidence as
`derived`. This ruleset does not calculate or change a health score.

| Rule ID | Pass condition | Failure priority | Reproducible evidence |
| --- | --- | --- | --- |
| `TECH-STATUS-001` | Final response is HTTP 200 | Fix now | Final sanitized URL and status |
| `TECH-HTTPS-001` | Final response URL uses HTTPS | Fix now | Final sanitized URL |
| `SEARCH-ROBOTS-001` | SiteMendBot is allowed to fetch every homepage hop | Fix now | robots origin, found/not-found state, and blocked URL |
| `TECH-REDIRECTS-001` | Zero redirects, or one permanent 301/308 redirect | Fix soon for a chain; Improvement for a temporary redirect | Ordered sanitized hops and status codes |
| `SEARCH-TITLE-001` | Exactly one non-empty HTML title | Fix soon | Count, empty count, first bounded value, and normalized length |
| `SEARCH-DESCRIPTION-001` | Exactly one non-empty meta description | Improvement | Count, empty count, first bounded value, and normalized length |
| `SEARCH-CANONICAL-001` | Exactly one valid self-referencing HTTP(S) canonical | Fix soon for invalid/conflicting; Improvement for a different target; Optional when absent | Count, sanitized targets, validity, and page match |
| `CONTENT-HEADINGS-001` | One non-empty H1, no empty headings, and no observed level jumps | Fix soon when a non-empty H1 is absent; Improvement for multiple H1s, empty headings, or skipped levels | H1-H6 counts, non-empty counts, bounded outline, and skipped-level count |
| `SEARCH-INDEXING-001` | No effective noindex or nofollow directive | Fix now for noindex; Fix soon for nofollow | Normalized directives from robots/googlebot meta and X-Robots-Tag |

A missing robots.txt is recorded as `not-found` and permits the crawl; it is not a
website failure. A robots denial prevents the remaining page-dependent rules from
running. A non-200 response still produces status, HTTPS, robots, and redirect
checks, while checks that require HTML become `not-applicable`.

Title and description lengths are retained as bounded advanced evidence, not used
as rigid pass/fail thresholds. A missing canonical is optional because canonical
markup is a recommendation, not an indexability requirement. A canonical pointing
elsewhere is medium-confidence guidance because cross-page canonicalization can be
intentional. Title, description, and canonical tags placed after an explicit body
start are not credited; robots meta directives remain effective in the body.

## Public homepage result

A completed public status exposes the report only inside this allowlisted,
versioned result envelope:

```text
{ schemaVersion: 1, completedAt, outcome, report }
```

`outcome` is `fetched` or `blocked-by-robots`. `report` is a schema-version `1`,
`homepage-v1` report with exactly the nine checks above and findings that
correspond to failed checks. Queued, running, and failed statuses expose no
report. The contract deliberately excludes scores and all internal crawl
transport evidence, including raw HTML, body hashes, response headers, redirect
request internals, and BullMQ failure or return-value fields. Unknown or malformed
completed results fail closed rather than publishing a partial report.
The API recomputes the report from strictly decoded crawler evidence and verifies
the worker copy before publication. Public evidence omits page-authored title and
description excerpts and replaces non-public canonical targets with a fixed
withholding label.

## Scan admission gate

Audit rules never run for a target that fails server-side scan admission. The gate
validates the origin, bounds DNS work, requires every resolved IPv4 or IPv6 answer
to be public, and revalidates every redirect destination. Admission failures are
scan errors rather than website findings and do not affect a site's health score.

The feature-gated scan API invokes this gate before durable queue admission. It
does not fetch pages. Its target threat model, queue-producer privacy controls, and
required crawler invariants are documented in
[`security/scan-admission.md`](security/scan-admission.md) and
[`security/scan-intake.md`](security/scan-intake.md).

## Homepage crawl evidence boundary

The standalone worker produces schema-version `2` crawl results with robots
access, final status, sanitized redirect locations, accepted media type, response
bytes, a SHA-256 body digest, bounded structured homepage evidence, and the
`homepage-v1` audit report. It never returns the robots file or raw homepage body.
These fields are the worker's internal evidence contract, not the public status
contract. The status API rebuilds and returns only the public homepage result
defined above. The first rules create findings but do not calculate or change a
health score. See [`security/crawler-worker.md`](security/crawler-worker.md).
