# Architecture

## System shape

SiteMend is a web SaaS with an Android companion. Scanning runs on isolated cloud
workers, never on the mobile device or the web request process.

```text
Next.js web / Android companion
              |
       API and authentication
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

The current repository begins with the Next.js product experience. Worker and API
packages will be introduced behind explicit boundaries as their PRs begin.

## Trust boundaries

Submitted URLs and fetched responses are hostile. URL validation must happen
before scheduling, after DNS resolution, and after every redirect. Private,
loopback, link-local, multicast, and metadata ranges are blocked for IPv4 and IPv6.

Browser workers are isolated from application credentials and the private network,
with CPU, memory, wall-clock, redirect, request, and response limits. Deep or
authenticated crawling requires verified ownership.

## Audit model

Objective findings are produced by versioned deterministic rules. Each result
stores rule version, evidence, affected resource, confidence, severity, and a
verification procedure. AI can translate that evidence into plain language or
platform guidance, but cannot invent or replace it.

## Initial data entities

User, Workspace, Member, Project, Website, Verification, ScanJob, PageSnapshot,
AuditDefinition, Finding, FindingOccurrence, ScoreSnapshot, FixTask, Integration,
Report, Subscription, and NotificationPreference.
