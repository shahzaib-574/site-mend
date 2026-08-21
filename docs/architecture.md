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
Both services remain disabled by default until the deployment isolation gate is
satisfied. The status API reads only a small validated public projection.

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

Browser workers are isolated from application credentials and the private network,
with CPU, memory, wall-clock, redirect, request, and response limits. Deep or
authenticated crawling requires verified ownership.

The current HTTP crawler is a separate service process, but process separation in
source code is not an operating-system sandbox. Its required container, credential,
filesystem, and egress controls are defined in
[`security/crawler-worker.md`](security/crawler-worker.md).

## Audit model

Objective findings are produced by versioned deterministic rules. Each result
stores rule version, evidence, affected resource, confidence, severity, and a
verification procedure. AI can translate that evidence into plain language or
platform guidance, but cannot invent or replace it.

## Initial data entities

User, Workspace, Member, Project, Website, Verification, ScanJob, PageSnapshot,
AuditDefinition, Finding, FindingOccurrence, ScoreSnapshot, FixTask, Integration,
Report, Subscription, and NotificationPreference.
