# Scan intake security boundary

The public scan route is an abuse-sensitive queue producer. It is separate from
the future crawler and cannot fetch page content.

## Request boundary

- Intake is disabled unless `SCAN_INTAKE_ENABLED` is exactly `true`.
- Only `application/json` is accepted.
- Bodies are stream-counted and stopped above 4 KiB even when `Content-Length` is
  absent or dishonest.
- The JSON object must contain exactly one string property named `url`.
- A trusted reverse proxy must overwrite the configured client-IP header with one
  canonical address. Missing, malformed, or ambiguous identity fails closed.
- Responses use `Cache-Control: no-store`, hide infrastructure details, and never
  reflect submitted URLs or credentials in error messages.

## Distributed abuse controls

Global, client, destination, and status-polling counters use a single-key atomic
Redis Lua operation. Client IPs and normalized hostnames are HMACed with a secret
before becoming Redis keys. The secret must be independent of authentication and
encryption keys and rotated through a deliberate deployment because rotation
resets active windows.

The individual counters are atomic; consuming several scopes and adding the queue
job are intentionally not one cross-key transaction. A later failure may consume
quota without creating a job, which is safer than refund logic that can race or
be abused.

Application limits supplement, rather than replace, edge request-size, connection,
and volumetric denial-of-service controls.

## Queue privacy and integrity

The versioned payload contains only scan ID, request time, normalized public
origin, and hostname. Status reads validate the complete stored shape and rebuild
the public response field by field. Unexpected fields, mismatched scan IDs,
malformed origins, and corrupt timestamps fail closed instead of being returned.

The queue stores no client IP or its digest, submitted path/query/fragment, DNS
answer, cookie, authorization header, credential, or fetched content. Queue and
Redis errors are not exposed to clients.

## Deployment gate

Before setting `SCAN_INTAKE_ENABLED=true`:

1. deploy durable Redis with authentication, encryption in transit, persistence,
   memory policy, backups, and private-network access controls;
2. deploy a trusted edge that strips and overwrites the configured client-IP
   header;
3. deploy the worker using the isolation gate in `crawler-worker.md` and confirm
   it re-admits and pins every connection;
4. configure edge rate and body-size limits;
5. verify queue depth, oldest-job age, Redis memory, rejection counts, and worker
   failures are monitored; and
6. test disabling intake independently of stopping workers.

Until those gates pass, the committed default remains disabled.
