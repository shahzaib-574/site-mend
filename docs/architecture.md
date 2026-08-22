# Architecture

## System shape

SiteMend is a web SaaS with an Android companion. Scanning runs on isolated cloud
workers, never on the mobile device or the web request process.

```text
Next.js web / Android companion
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

## Proposed stack

- Next.js and TypeScript for the web experience
- React Native/Expo for Android
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

Public status URLs are anonymous, ephemeral bearer links rather than durable
report storage or authenticated authorization. The API strictly decodes crawl
evidence, recomputes the deterministic audit, verifies the worker copy, and then
rebuilds completed results field by field. Unknown, contradictory, or malformed
worker results receive a generic unavailable response. The API never exposes
BullMQ `returnvalue` directly, crawl transport fields, HTML, hashes, headers,
failure details, page-authored text excerpts, non-public canonical targets, or
scores. BullMQ's age/count removal is lazy, so configured retention windows are
not hard TTLs.

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
