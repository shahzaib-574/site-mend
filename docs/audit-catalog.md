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
- Severity, confidence, and affected-page count
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

## Scan admission gate

Audit rules never run for a target that fails server-side scan admission. The gate
validates the origin, bounds DNS work, requires every resolved IPv4 or IPv6 answer
to be public, and revalidates every redirect destination. Admission failures are
scan errors rather than website findings and do not affect a site's health score.

The current gate is an internal service only. It does not fetch pages or expose a
public API. Its threat model and required crawler invariants are documented in
[`security/scan-admission.md`](security/scan-admission.md).
