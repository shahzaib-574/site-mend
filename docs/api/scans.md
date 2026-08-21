# Scan intake API

The scan intake API creates durable, anonymous homepage health-check jobs. It is
feature-gated off by default and must remain disabled until an isolated crawler
worker is deployed.

## Runtime configuration

Copy `.env.example` to a local environment file and provide:

| Variable | Requirement |
| --- | --- |
| `SCAN_INTAKE_ENABLED` | Must be exactly `true`; otherwise valid intake and status requests fail closed with `503`. |
| `REDIS_URL` | A durable `redis://` or TLS `rediss://` connection URL. |
| `SCAN_TRUSTED_CLIENT_IP_HEADER` | One header set by a trusted proxy to a single canonical IPv4 or IPv6 address. |
| `SCAN_RATE_LIMIT_KEY_SECRET` | At least 32 random bytes used to HMAC rate-limit identities. |

The trusted reverse proxy must strip the named header from inbound traffic and
replace it with the canonical client address. Never configure a pass-through
header that a browser can supply directly.

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
    "statusUrl": "/api/scans/scan-11111111-1111-4111-8111-111111111111",
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
GET /api/scans/scan-11111111-1111-4111-8111-111111111111
```

The status contract exposes only `queued`, `running`, `completed`, or `failed`,
the public target origin, the scan ID, and the queue timestamp. It never exposes
BullMQ failure reasons, stack traces, worker data, or Redis errors. Unknown,
removed, malformed, and invalid scan IDs return the same `404` response.

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
records are retained for at most one day/10,000 jobs and failed status records for
at most seven days/25,000 jobs, with BullMQ's documented lazy cleanup behavior.

No worker or page fetch exists yet. Enabling intake without a compatible worker
would accumulate waiting jobs and is prohibited.

The required CI quality job runs the fixed-window Lua script and BullMQ queue
adapter against an ephemeral Redis service. `REDIS_TEST_URL` is test-only and must
point to a disposable Redis database; the test uses unique keys and queue names
and does not flush the database.
