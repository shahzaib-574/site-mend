# Scan intake API

The scan intake API creates durable, anonymous homepage health-check jobs. It is
feature-gated off by default and must remain disabled until an isolated crawler
worker is deployed.

## Runtime configuration

Copy `.env.example` to a local environment file and provide:

| Variable | Requirement |
| --- | --- |
| `SCAN_INTAKE_ENABLED` | Must be exactly `true`; otherwise valid intake and status requests fail closed with `503`. |
| `PUBLIC_SCAN_UI_ENABLED` | Must also be exactly `true` before the public live-scan interface appears. This server-only presentation gate cannot enable intake. |
| `REDIS_URL` | A durable `redis://` or TLS `rediss://` connection URL. |
| `SCAN_TRUSTED_CLIENT_IP_HEADER` | One header set by a trusted proxy to a single canonical IPv4 or IPv6 address. |
| `SCAN_RATE_LIMIT_KEY_SECRET` | At least 32 random bytes used to HMAC rate-limit identities. |

Worker configuration is intentionally separate. See
[`../security/crawler-worker.md`](../security/crawler-worker.md); enabling a
worker does not enable intake, and enabling intake does not start a worker.

The trusted reverse proxy must strip the named header from inbound traffic and
replace it with the canonical client address. Never configure a pass-through
header that a browser can supply directly.

Enable services in this order: isolated worker and monitoring, intake/status
smoke test, then public UI. Roll back the UI gate first. Both UI and intake gates
remain `false` in the committed example environment.

Before enabling intake, verify that the edge, application access logger, APM,
tracing, and support tooling redact the `Authorization` header. Logging a status
bearer grants report access; a written redaction policy without an observed
production-like verification is not sufficient.

## Create a scan

```http
POST /api/scans
Content-Type: application/json

{"url":"https://example.com"}
```

The body is limited to 4 KiB and must contain exactly one string property named
`url`. A successful request returns `202 Accepted`, `Cache-Control: no-store`, and
a `Location` header:

```json
{
  "data": {
    "scanId": "scan-11111111-1111-4111-8111-111111111111",
    "status": "queued",
    "statusUrl": "/api/scans/status",
    "target": {
      "hostname": "example.com",
      "origin": "https://example.com/"
    }
  },
  "message": "Your website health check is queued."
}
```

The submitted path, query, fragment, DNS addresses, client IP, cookies, and
authorization data are never placed in the queue payload.

## Read scan status

```http
GET /api/scans/status
Authorization: Bearer scan-11111111-1111-4111-8111-111111111111
```

The status endpoint is fixed: the bearer must never be put in a request path or
query string. Missing, malformed, non-v4, or non-lowercase bearer values return
the same controlled `404` envelope as an unknown or removed job. Status responses
are `no-store` and vary on `Authorization`; compliant access logging must still
redact the header.

Every status response exposes only `queued`, `running`, `completed`, or `failed`,
the public target origin, the scan ID, and the queue timestamp. `queued`,
`running`, and `failed` responses are metadata-only. They never include partial
worker output, failure reasons, stack traces, or retry details.

A `completed` response additionally exposes one allowlisted public result:

```ts
type PublicHomepageResult = {
  schemaVersion: 1;
  completedAt: string;
  outcome: "fetched" | "blocked-by-robots";
  report: {
    schemaVersion: 1;
    rulesetVersion: "homepage-v1";
    checks: HomepageAuditCheck[]; // Exactly the nine homepage-v1 checks.
    findings: HomepageAuditFinding[]; // Failed-check findings only.
  };
};
```

The two allowed outcomes are `fetched` and `blocked-by-robots`. The report always
contains the nine `homepage-v1` checks for status, HTTPS, robots access,
redirects, title, description, canonical, headings, and indexing directives;
checks that could not run are explicitly `not-applicable`.

The API strictly decodes the bounded crawl evidence, recomputes `homepage-v1` in
trusted server code, and requires the stored worker report to match that
recomputation before constructing the public result field by field. It never
passes through BullMQ's raw `returnvalue` or exposes crawl transport data, raw
HTML, response-body hashes, HTTP headers, worker failure details, internal errors,
or a health/category score. Page-authored title and description excerpts are
omitted from the public evidence; a non-public canonical target is replaced with
a fixed withholding label. An unknown, contradictory, or malformed completed-job
result, including an unexpected field, schema, rule set, check, finding, or
outcome, fails closed with the same generic `503` response used for unavailable
scan infrastructure. The final serialized public result is capped at 256 KiB;
the cap is above the maximum currently reviewed producer-shaped report.

Unknown or removed jobs and missing or malformed bearer headers return the same
`404` response. The scan ID is an ephemeral bearer capability: anyone who obtains it can
read that scan's public metadata and, once completed, its allowlisted report. It
must not be treated as durable storage or shared as if it were an authenticated
project URL.

## Public scan experience

When both `PUBLIC_SCAN_UI_ENABLED` and `SCAN_INTAKE_ENABLED` are exactly `true`,
the homepage can submit the locally normalized public origin and open `/scan`
with the validated scan ID in the URL fragment (`/scan#scan-…`). A fragment is
not sent in the document request or HTTP referrer, which keeps the bearer ID out
of the document URL seen by hosting and proxy logs. The client sends that strictly
decoded lowercase UUIDv4 only in a redacted `Authorization: Bearer` header to the
fixed `/api/scans/status` endpoint; it never follows the `statusUrl` returned by
the create response or places the ID in an API path or query.

The UI strictly decodes bounded response data, polls with one request in flight,
pauses while hidden or offline, backs off after transient failures, and stops at
a terminal state. It shows no invented percentage, ETA, score, or partial
evidence. A completed view explicitly describes its scope as nine derived
homepage checks and does not imply performance, field-data, rendered-page,
multi-page, AEO, or GEO coverage.

Create requests omit credentials and referrers, reject redirects, have a bounded
client timeout, and are never retried automatically. Every non-`202` response is
size-bounded and must match the exact public error envelope and its allowed
status/code pairing. Because a network failure, timeout, or unreadable response
can occur after the server accepted a job, the UI does not claim that no scan was
started in those ambiguous cases.

The `/scan` document is `no-store`, `no-referrer`, frame-denied, and excluded
from indexing and archives. It contains no advertising, analytics, third-party
pixels, remote report images, or outgoing report links. Findings and evidence
are rendered as text only. Disabling the UI gate restores the address-only
preview and makes direct `/scan` visits fail closed without a status request.

## Distributed limits

Each counter is an atomic Redis fixed window. Identities are keyed HMAC digests;
raw client IPs and hostnames are not Redis key material.

| Scope | Limit |
| --- | ---: |
| All scan creation | 60 per minute |
| One client | 5 per 10 minutes |
| One destination hostname | 3 per hour |
| All status reads | 1,200 per minute |
| Status reads by one client | 120 per minute |

A rejected request returns `429` with `Retry-After`. Redis, configuration, queue,
and unexpected data failures return a generic `503` with no infrastructure detail.

## Queue contract

BullMQ queue `site-mend-scans` receives job name `homepage-health-check` with
schema version `1`. The public scan ID is also the BullMQ job ID. Completed status
records are configured for cleanup after one day or when more than 10,000 are
retained; failed records are configured for cleanup after seven days or when more
than 25,000 are retained. BullMQ applies age/count cleanup lazily when later jobs
finish, so these values are retention targets, not a hard at-most TTL. A bearer
status link can stop resolving because of either cleanup limit, and an idle queue
can retain an older record beyond its configured age.

The compatible worker is shipped as a separate, disabled-by-default build. It
returns internal crawl evidence as BullMQ worker return data (`returnvalue`). The
status API validates that data and publishes only the completed-result projection
documented above.
Enabling intake before deploying the worker with the documented isolation and
monitoring controls would accumulate waiting jobs and is prohibited.

The required CI quality job runs the fixed-window Lua script and BullMQ queue
adapter against an ephemeral Redis service. `REDIS_TEST_URL` is test-only and must
point to a disposable Redis database; the test uses unique keys and queue names
and does not flush the database.
