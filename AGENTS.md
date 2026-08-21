<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SiteMend global repository instructions

These instructions apply to the entire repository.

## Product north star

SiteMend must be the easiest website health-check tool to understand and act on.
The core loop is **Scan -> Understand -> Fix -> Verify -> Monitor**. SEO, Core Web
Vitals, content structure, and AI-search readiness power the engine, but the
default interface uses plain language and shows the five most important actions.

## Mandatory pull-request workflow

- Never implement a product feature, bug fix, refactor, or dependency upgrade
  directly on `main`.
- Start from an up-to-date `main` and create one focused branch per change:
  `feat/<name>`, `fix/<name>`, `docs/<name>`, or `chore/<name>`.
- Keep each PR small enough to audit and roll back independently. Separate
  unrelated changes.
- Every PR must state its user outcome, acceptance criteria, risks, test evidence,
  audit result, review result, and rollback plan.
- Before merge, the PR must pass the required `quality` and `dependency-audit`
  checks, have no unresolved review conversations, and be reviewed against the
  acceptance criteria and security/privacy checklist.
- A review may be performed by a human maintainer or a designated reviewing
  agent, but it must be documented on the PR. Do not silently self-certify.
- Merge with squash only. Delete the feature branch after merge.
- Direct pushes to `main`, force pushes, skipped hooks, and bypassed required
  checks are prohibited.

## Definition of done

A change is complete only when:

1. Acceptance criteria are demonstrably satisfied.
2. Relevant unit, integration, and accessibility tests exist and pass.
3. `npm run verify` passes locally.
4. High/critical dependency vulnerabilities are absent or explicitly risk-accepted.
5. Security, privacy, performance, and failure states were audited.
6. User-facing copy is understandable without SEO knowledge.
7. Documentation and the audit catalog are updated when behavior changes.
8. The PR review is recorded and all findings are resolved.

## Product and UX rules

- Give useful scan results before requiring registration.
- Prefer “Your homepage image loads too slowly” over metric-only jargon.
- Show `Fix now`, `Fix soon`, `Improvement`, or `Optional` to users; keep raw
  scoring inputs in advanced details.
- Every finding needs evidence, impact, effort, a practical fix, affected URLs,
  confidence, and a verification method.
- Separate lab measurements from real-user field data.
- Describe AEO/GEO results as readiness signals, never guaranteed rankings or
  citations.
- Meet WCAG 2.2 AA for new user-facing flows.

## Audit-engine rules

- Deterministic code detects objective problems. AI may explain evidence or draft
  a fix, but it must not invent measurements or become the sole detector.
- Audit definitions and score weights are versioned. Historical scans retain the
  version that produced them.
- High-severity findings require reproducible evidence and a regression test.
- Avoid rigid content-length rules without considering page type and intent.

## Crawler and security rules

- Treat every submitted URL and fetched response as hostile.
- Block private, loopback, link-local, multicast, and cloud metadata addresses;
  revalidate DNS and every redirect destination.
- Enforce crawl limits, timeouts, response-size limits, content-type checks, and
  rate limits.
- Run browser workers outside the API process with isolation and constrained
  resources.
- Respect robots.txt, identify the crawler, and require ownership verification
  before deep, frequent, authenticated, or non-public scans.
- Never log secrets, OAuth tokens, cookies, authorization headers, or fetched
  private content.

## Required local checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
```

Use the combined `npm run verify` command before opening or updating a PR.
