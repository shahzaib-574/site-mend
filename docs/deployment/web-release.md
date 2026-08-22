# Web release runbook

## Purpose

This runbook prepares SiteMend for a public HTTPS deployment without pretending
that a repository, preview URL, or successful build is a production release. It
is provider-neutral: the hosting account, custom domain, operator identity, and
processors must be confirmed by the owner before the release gate can pass.

## Required owner decisions

Confirm and record all of the following before deploying a public production
environment:

- the final custom HTTPS origin;
- the operator or legal entity responsible for the service;
- a monitored privacy and support email address;
- the applicable legal jurisdiction and target markets;
- the web, worker, Redis, edge, monitoring, error-reporting, DNS, and email
  providers that will process data;
- hard deletion behavior or an owner-approved description of the queue's current
  lazy retention targets; and
- whether public intake is still disabled for a content-only launch.

Do not copy example identities, domains, email addresses, or publisher IDs into
production. SiteMend's server-only release variables are:

```text
SITE_ORIGIN
SITE_OPERATOR_NAME
SITE_CONTACT_EMAIL
SITE_LEGAL_JURISDICTION
```

`SITE_ORIGIN` is one custom `https://` origin without credentials, a custom port,
path, query, or fragment. Missing or invalid release identity fails closed:
preview deployments receive no production canonical/sitemap host, and public
pages emit `noindex, nofollow` metadata while remaining crawlable so compliant
crawlers can see it. `/scan` remains crawlable so its permanent response-level
`noindex` can be observed; `/api/**` is disallowed. Robots directives are not
access control, so protect a non-public preview at the hosting edge. Supply the
complete identity to the production runtime; the indexable pages then emit
absolute canonicals for that origin.

## Service topology

Deploy three separate private trust zones:

1. **Web/API service** — serves the Next.js application, validates admission,
   rate limits requests, and enqueues bounded jobs. It does not fetch submitted
   websites.
2. **Crawler worker** — runs the standalone worker artifact with no application
   or deployment credentials, a read-only filesystem, constrained CPU/memory,
   and egress limited to admitted public web destinations plus private Redis.
3. **Redis** — uses authentication, encryption in transit, private-network access,
   persistence and backup settings suited to the selected provider, and a memory
   policy compatible with BullMQ.

A trusted edge sits in front of the web service. It removes every client-supplied
identity header, writes one canonical client IP to
`SCAN_TRUSTED_CLIENT_IP_HEADER`, limits request bodies/connections/volume, forces
HTTPS, serves a verified `Strict-Transport-Security` policy chosen for the final
domain (including subdomains only when the owner has verified they are HTTPS),
and redacts `Authorization` from access logs, traces, APM, error reports, support
captures, and exports.

## Build and runtime

Use the repository's supported Node version and immutable lockfile:

```bash
npm ci
npm run verify
npm run build
```

Run the web artifact with `npm start` and the separately built worker with
`npm run start:worker`. Never run the crawler inside the web request process.
Load real secrets from the provider's secret store; do not bake them into an
image, `NEXT_PUBLIC_*`, a CI log, or a repository file. The non-secret `SITE_*`
identity is read at runtime; configure one immutable set per deployment, restart
after a change, and verify the HTML, robots, and sitemap responses agree before
opening traffic.

Keep these switches at exact lowercase `false` for the first deployment:

```text
SCAN_INTAKE_ENABLED=false
PUBLIC_SCAN_UI_ENABLED=false
SCAN_WORKER_ENABLED=false
```

## Pre-activation security gate

Complete the full crawler and intake checklists in
[`../security/crawler-worker.md`](../security/crawler-worker.md) and
[`../security/scan-intake.md`](../security/scan-intake.md). In addition:

1. confirm `/scan` is no-store, no-referrer, noindex, frame-denied, and constrained
   by its self-only CSP;
2. confirm `/scan` contains no advertising, analytics, CMP, pixel, remote image,
   iframe, or external report link;
3. submit a disposable test scan and search the edge, application, trace/APM,
   error-reporting, and support systems for the complete bearer; there must be no
   match in a request path, query, referrer, `Authorization` value, or captured
   browser URL;
4. confirm only the normalized origin enters the queue and browser Back restores
   no submitted path, query, fragment, credentials, or custom port;
5. verify worker DNS/redirect re-admission and connection pinning from the actual
   production network; and
6. configure alerts for queue depth, oldest-job age, Redis memory, edge rejects,
   worker failures/timeouts, web 5xx responses, and disabled-worker backlog.

Do not enable intake if the disposable-bearer test or worker isolation test cannot
be performed end to end.

## Rollout order

1. Deploy web pages with release identity configured and all scan switches off.
2. Verify `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/robots.txt`, and
   `/sitemap.xml` from the public origin. The sitemap must contain no `/scan` or
   `/api/` URL.
3. Verify HTTP redirects to HTTPS, the certificate chain is valid, and staging or
   localhost never appears in metadata.
4. Start Redis and monitoring, then start one worker with intake still off.
5. Enable `SCAN_WORKER_ENABLED=true` and run an operator-only queue smoke test.
6. Enable `SCAN_INTAKE_ENABLED=true`; validate admission, limits, queue progress,
   results, removal, and failure behavior.
7. Enable `PUBLIC_SCAN_UI_ENABLED=true` last and repeat the 320px/desktop browser
   journey.

## Rollback

Disable `PUBLIC_SCAN_UI_ENABLED` first so new visitors return to address preview.
Disable `SCAN_INTAKE_ENABLED` next to stop new jobs, while allowing already queued
work to settle. Stop workers only after deciding how queued jobs will be handled.
Revert the release artifact if page or header behavior is faulty; do not restore
traffic by bypassing the edge, logging, admission, or isolation gates.

Advertising is a later release with its own gate. Do not add AdSense, analytics,
or a CMP while diagnosing or rolling back scanning.
