# SiteMend implementation plan

## Product north star

SiteMend is the easiest website health-check tool. Its value loop is:

> Scan -> Understand -> Fix -> Verify -> Monitor

The primary customer is a small web or SEO agency managing 5-30 WordPress or
Shopify sites. Freelancers, developers, and individual site owners are secondary
customers. The north-star metric is **websites with at least one verified fix per
month**.

## Current foundation status

- Public URL entry and plain-language landing experience are implemented.
- Server-side URL/DNS admission and redirect revalidation are implemented.
- A feature-gated, Redis-rate-limited BullMQ intake and public status contract are
  implemented but disabled by default.
- A feature-gated standalone worker can safely fetch robots.txt and one homepage,
  follow re-admitted redirects, stream bounded document evidence, and run nine
  versioned deterministic homepage checks.
- Multi-page crawling, browser rendering, scoring, persistence, and public result
  delivery do not exist yet. Enabling intake remains blocked until the worker is
  deployed with its required isolation and monitoring controls.

## Experience principles

1. Deliver useful results before registration.
2. Use plain language and disclose technical evidence progressively.
3. Show five priority actions instead of an unfiltered issue dump.
4. Give every finding an exact fix and a way to verify it.
5. Clearly distinguish measured, derived, and experimental signals.
6. Never promise search rankings or AI citations.
7. Build the web workflow first; make Android the alert and task companion.

## MVP journey

1. A visitor submits a public website URL without creating an account.
2. A progress screen explains the scan in human terms.
3. SiteMend scans the homepage, robots.txt, sitemap, up to 25 internal pages,
   one mobile performance profile, and available field data.
4. Results show an overall health score, category scores, the five most important
   findings, and checks that passed.
5. A finding explains evidence, impact, effort, affected pages, platform-specific
   remediation, and verification.
6. Registration saves the scan and unlocks rescans, history, monitoring, and
   alerts.

The initial design target is a useful public result within two minutes. This is
a product target, not a promise that bypasses safe crawling or reliable evidence.

## Friendly score categories

| Category | Weight |
| --- | ---: |
| Search visibility | 30% |
| Speed and experience | 25% |
| Technical health | 20% |
| Content and structure | 15% |
| AI readiness | 10% |

Internally, priority considers severity, reach, confidence, and effort. Users see
`Fix now`, `Fix soon`, `Improvement`, or `Optional`. Site-wide indexing failures
cap the overall score so healthy secondary checks cannot hide a critical blocker.

## MVP scope

### Search visibility

- Availability, status codes, HTTPS, and mixed content
- robots.txt parsing and site-wide search blocking
- Page-level indexing directives
- Sitemap discovery, validity, and URL health
- Canonical conflicts, redirect chains, loops, and broken internal links
- Click depth, viewport, titles, descriptions, and heading checks

### Speed and experience

- LCP, CLS, TTFB, and available INP field data
- Total Blocking Time and other lab diagnostics
- Render blocking, oversized images, caching, compression, fonts, and third parties
- Explicit separation between lab and real-user field measurements

### Content and structure

- Page-purpose clarity, headings, duplicate content, and image alternatives
- Important pages with weak internal linking
- Author, publication, update, and organization signals where relevant
- Page-type-aware quality checks instead of rigid word-count thresholds

### Structured data

- JSON-LD, Microdata, and RDFa discovery
- Syntax and required-property validation
- Visible-content consistency
- Organization, Article, Product, LocalBusiness, and Breadcrumb guidance

### AI readiness

- Search-crawler accessibility and robot rules
- Important content availability in initial HTML
- Clear entities, factual consistency, descriptive headings, evidence, and sources
- Experimental signals labeled as such and excluded from material score impact

## Explicit non-goals for MVP

- A proprietary backlink or keyword database
- Global rank tracking
- Large-scale AI prompt monitoring
- Enterprise-scale crawling
- Automatic mutation of customer websites
- Guaranteed ranking or citation predictions

## Delivery roadmap

### Phase 0 - validation and UX (weeks 1-2)

- Five-screen prototype and plain-language copy tests
- First 40 audit definitions and evidence requirements
- Ten agency interviews, five pilots, and three paid founding commitments

Exit: target users understand the product and first action without instruction.

### Phase 1 - platform foundation (weeks 3-4)

- Authentication boundary, PostgreSQL model, scan API, Redis queue, safe URL
  validation, basic crawler worker, and progress events

Exit: safely crawl and normalize 25 internal public pages.

Progress: secure intake and the isolated-process homepage crawler foundation are
implemented. Internal-link discovery and the owned-site 25-page crawl remain.

### Phase 2 - deterministic audit engine (weeks 5-6)

- Versioned rule format, initial visibility/metadata/link checks, evidence storage,
  finding grouping, score calculation, and golden test fixtures

Exit: at least 25 deterministic checks with regression tests.

Progress: `homepage-v1` implements the first nine checks for status, HTTPS,
robots access, redirects, title, description, canonical, headings, and indexing
directives. The worker emits complete finding contracts, but grouping, scoring,
persistence, and the remaining checks are still open.

### Phase 3 - performance and AI readiness (weeks 7-8)

- Isolated Lighthouse worker, field-data adapter, schema parser, crawler-access
  checks, content structure checks, and platform detection

Exit: every high-severity result contains reproducible evidence.

### Phase 4 - easiest web experience (weeks 9-10)

- Public scan, friendly progress, results dashboard, top-five findings, issue
  detail, fix instructions, responsive behavior, and advanced evidence

Exit: a non-expert identifies and understands the first fix without help.

### Phase 5 - verify and monitor (weeks 11-12)

- Saved projects, rescans, snapshots, before/after comparison, scheduling, alerts,
  shared reports, and Search Console integration

Exit: resolved issues are automatically verified by a rescan.

### Phase 6 - agency and revenue (weeks 13-14)

- Workspaces, portfolio view, roles, client reports, white labeling, subscriptions,
  entitlements, and usage metering

Exit: an agency can onboard five sites and share separate reports.

### Phase 7 - Android companion and launch hardening (weeks 15-16)

- Portfolio health, critical push alerts, issue checklist, rescan, report sharing,
  account state, crash reporting, closed Play test, load and security testing

Exit: Android users can manage urgent work without the desktop dashboard.

## Quality gates

- Normal scans complete successfully at least 95% of the time in beta fixtures.
- High-severity rules have evidence and focused regression tests.
- Required CI, dependency audit, security audit, review, and acceptance checks pass.
- Public scanning cannot access internal or metadata networks.
- A user can fix, rescan, and observe a verified resolution.
- Ten beta customers have used the workflow and five have paid before public launch.

## Commercial entitlements

| Plan | Initial entitlement |
| --- | --- |
| Free | One site, 25 pages, manual scan |
| Starter | One site, 500 pages, weekly monitoring |
| Pro | Five sites, pooled allowance, integrations and reports |
| Agency | 25 sites, teams, client portals and white labeling |

Pricing is validated with pilot customers before it becomes a hard-coded product
contract.

## Later opportunities

WordPress and Shopify integrations, safe one-click fixes, development workflow
integrations, uptime monitoring, competitive benchmarks, prompt tracking, custom
rules, a public API, and white-label infrastructure are post-fit work.
