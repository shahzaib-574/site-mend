# Architecture

## System shape

SiteMend currently ships a web foundation and targets an Android companion in a
later phase. Production scanning is designed to run on isolated cloud workers,
never on the mobile device or the web request process.

```text
Current Next.js web / planned Android companion
              |
 API, admission, and distributed limits
              |
        durable scan queue
              |
  +-----------+------------+----------------+
  | HTML crawler | Browser worker | Data adapters |
  +-----------+------------+----------------+
              |
   versioned deterministic audit engine
              |
 findings, scores, fixes, snapshots, alerts
```

## Current and candidate stack

- Next.js and TypeScript for the web experience
- Android decision gate between a Trusted Web Activity/PWA shell and a native
  React Native/Expo client; neither is selected or implemented yet
- Fastify or NestJS for the long-lived API boundary
- PostgreSQL for projects, scans, findings, tasks, and entitlements
- Redis/BullMQ for durable work scheduling
- Playwright and isolated Chromium for rendered checks
- Lighthouse for controlled lab diagnostics
- S3-compatible object storage for bounded scan artifacts

The current repository begins with the Next.js product experience. Its
feature-gated scan API validates a bounded request, requires trusted-proxy client
identity, applies distributed Redis limits, admits DNS, and writes a minimal
versioned BullMQ job. A separately built Node.js worker can consume one homepage
job, enforce robots.txt, pin an admitted address, and return bounded evidence.
The worker streams that evidence through the first nine versioned homepage rules;
it does not retain raw HTML. Both services remain disabled by default until the
deployment isolation gate is satisfied. For a completed job, the status API can
publish a versioned, allowlisted homepage result containing only completion time,
the `fetched` or `blocked-by-robots` outcome, and the `homepage-v1` report. Queued,
running, and failed states remain metadata-only.

The public web experience is separately feature-gated. When both the server-only
UI gate and intake gate are enabled, it submits only a normalized origin and
renders queued, running, completed, failed, unavailable, offline, and removed
states. The bearer scan ID travels in the `/scan` URL fragment, so the document
request and referrer do not contain it. The browser derives the status endpoint
from a strictly decoded ID, accepts only the allowlisted public contract, and
never renders partial or unknown response data.

## Trust boundaries

Submitted URLs and fetched responses are hostile. URL validation must happen
before scheduling, after DNS resolution, and after every redirect. Private,
loopback, link-local, multicast, and metadata ranges are blocked for IPv4 and IPv6.

DNS admission does not replace connection-time enforcement. The crawler must pin
an admitted address, preserve the hostname for TLS and HTTP validation, verify the
connected socket address, and disable automatic redirects. See
[`security/scan-admission.md`](security/scan-admission.md) for the full boundary.

The queue producer stores no client identity, submitted path/query, DNS answer,
credential, or content. Its abuse, privacy, and deployment controls are defined in
[`security/scan-intake.md`](security/scan-intake.md).

Public scan IDs are anonymous, ephemeral bearer capabilities rather than durable
report storage or authenticated authorization. The API strictly decodes crawl
evidence, recomputes the deterministic audit, verifies the worker copy, and then
rebuilds completed results field by field. Unknown, contradictory, or malformed
worker results receive a generic unavailable response. The API never exposes
BullMQ `returnvalue` directly, crawl transport fields, HTML, hashes, raw header
blocks, failure details, page-authored text excerpts, non-public canonical
targets, or scores. A small allowlist of normalized signals, such as effective
indexing directives, can appear as finding evidence. BullMQ's age/count removal
is lazy, so configured retention windows are not hard TTLs.

The `/scan` document is no-store, no-referrer, noindex, frame-denied, and free of
ads, analytics, pixels, and external report resources. Client polling is
single-flight, abortable, visibility/network aware, and bounded. Status reads use
a fixed API path and carry the capability only in an authorization header that
the edge and observability stack must demonstrably redact. The raw URL
entry is normalized before transmission; its path, query, and fragment are not
stored in the UI, navigation, or request body.

The scan entry and report create a hard third-party boundary. The bearer exists
in the scan-entry window after the create response and before navigation, so the
entry document itself must be isolated: `/` is permanently ad-free and receives
the same self-only, no-off-origin resource CSP as every current route. A
successful scan opens `/scan#<capability>` as a new document instead of retaining
the homepage's client runtime. Advertising, analytics, or consent code must never
be added to the root layout because a root script would also execute on `/scan`
and could read its fragment. Any future approved third-party code is confined to
an explicit content-route layout; its scan CTA must use a native full-document
link into `/` before the user can submit. `/scan`, `/api/**`,
legal/contact/consent, authentication, account, dashboard, form, progress, error,
and private-result surfaces stay outside that layout. The report CSP also denies
off-origin connections and subresources. This boundary complements
authorization-header redaction; it does not replace it.

Public release identity is server-only runtime configuration. Until a final HTTPS
origin, operator, contact, and jurisdiction pass validation, SiteMend emits no
canonical host or sitemap URL. Public pages emit `noindex, nofollow` metadata and
remain crawlable so compliant crawlers can observe it. `/scan` likewise remains
crawlable solely so its permanent response-level `noindex` can be observed, while
`/api/**` is disallowed. Preview hosting should add access control when
non-discovery is required because robots directives are not access control.
Information pages describe only implemented behavior and do not invent an
operator, processor, retention guarantee, or legal jurisdiction.

Browser workers are isolated from application credentials and the private network,
with CPU, memory, wall-clock, redirect, request, and response limits. Deep or
authenticated crawling requires verified ownership.

The current HTTP crawler is a separate service process, but process separation in
source code is not an operating-system sandbox. Its required container, credential,
filesystem, and egress controls are defined in
[`security/crawler-worker.md`](security/crawler-worker.md).

## Audit model

Objective findings are produced by versioned deterministic rules. Each result
stores rule version, evidence, affected URLs, confidence, user-facing priority,
and a verification procedure. AI can translate that evidence into plain language
or platform guidance, but cannot invent or replace it.

The implemented `homepage-v1` rules run in the standalone worker against bounded
initial-HTML evidence. They cover final status, HTTPS, robots access, redirects,
title, description, canonical, headings, and page-level indexing directives. No
score is calculated yet, and rendered-page, field-data, multi-page, and AI
readiness checks remain separate future stages. The same nine checks and any
findings from failed checks form the only report accepted by the public completed
result contract.

## Initial data entities

User, Workspace, Member, Project, Website, Verification, ScanJob, PageSnapshot,
AuditDefinition, Finding, FindingOccurrence, ScoreSnapshot, FixTask, Integration,
Report, Subscription, and NotificationPreference.
