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
- The public live-scan interface has a second server-only gate. It is enabled only
  when both `PUBLIC_SCAN_UI_ENABLED` and `SCAN_INTAKE_ENABLED` are exactly `true`;
  the UI flag is presentation-only and cannot bypass the API gate.

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

The enqueued request payload stores no client IP or its digest, submitted
path/query/fragment, DNS answer, cookie, authorization header, credential, or
fetched content. A completed worker return value can contain the bounded internal
crawl evidence documented in `crawler-worker.md`; it is not itself the public
contract. Queue and Redis errors are not exposed to clients.

Queued, running, and failed statuses expose metadata only. A completed status can
add exactly one versioned result with `schemaVersion: 1`, a bounded ISO completion
timestamp, a `fetched` or `blocked-by-robots` outcome, and the allowlisted
`homepage-v1` audit report. That report contains exactly the nine known checks and
findings attributable to failed checks. It contains no score.

The status boundary does not serialize BullMQ `returnvalue` directly. It strictly
decodes the real crawler evidence, recomputes the deterministic report in trusted
server code, verifies that the worker report matches, and then creates a separate
public copy. Raw crawl transport fields, HTML, body hashes, headers, failure
reasons, stack traces, Redis errors, and unknown worker fields stay private.
Page-authored title and description excerpts are omitted, and non-public canonical
targets receive a fixed withholding label. Unknown, contradictory, or malformed
completed results fail closed with a generic `503`; they are never downgraded to
an empty or partially trusted report. Unknown or removed jobs and invalid scan IDs
continue to share the generic `404` response. The final public result has a
256 KiB serialized ceiling derived above the reviewed `homepage-v1` producer
maximum.

The unguessable scan ID is a bearer capability, not authentication. Anyone who
receives it can read its public scan metadata and completed report until BullMQ
removes the job. Responses remain `no-store`; application logs, analytics,
referrers, support tooling, and UI copy must not leak bearer IDs or authorization
values. Durable
history, ownership, revocation, and access control require the future authenticated
project store.

Completed and failed job removal uses BullMQ age and count settings. Cleanup is
triggered lazily by later job completions rather than by an exact expiry timer:
an active queue can remove a result because of its count limit, while an idle
queue can retain it beyond the configured age. Neither the one-day completed age
nor seven-day failed age is a hard at-most TTL.

## Browser bearer boundary

The public result handoff uses `/scan#scan-<lowercase UUIDv4>`. URL fragments do
not enter the document request or HTTP referrer, reducing accidental capability
leakage through hosting, proxy, analytics, and outbound-navigation logs. The
browser validates the fragment, calls only the fixed `/api/scans/status` endpoint,
and supplies the ID as `Authorization: Bearer <scanId>`. It does not navigate to
or fetch an arbitrary response-provided URL, and it never puts the capability in
an API request path or query. Every proxy, access logger, APM agent, trace
collector, and support capture must redact the authorization header.

The raw user entry is normalized before transmission. Only its public origin may
be posted, restored after Back navigation, or displayed; submitted paths,
queries, fragments, credentials, and custom ports are not retained. Create
requests omit credentials and referrers, reject redirects, time out within a
fixed client budget, and are never retried automatically. Non-success responses
are byte-bounded and must match both the exact public error envelope and the
expected HTTP status/code pairing. Network, timeout, unreadable, and server-error
outcomes do not claim that no job was created because acceptance can be ambiguous.

Client responses are size-bounded and strictly decoded with exact keys, known
versions/rules, bounded text and arrays, valid timestamps, and immutable scan
identity across polls. Unknown or malformed data becomes a generic unavailable
state rather than a partial result. Page-authored values are React text only;
evidence and affected URLs are not links, HTML, Markdown, images, or CSS.

Polling uses recursive timeouts after the previous request settles, one abortable
request at a time, bounded backoff and `Retry-After`, visibility/offline pauses,
and terminal-state stopping. A late or stale response cannot regress a completed
scan. The report document is explicitly no-store, no-referrer, noindex,
noarchive, and frame-denied, and it loads no ads, analytics, pixels, remote report
images, or outbound report links.

## Deployment gate

Before setting `SCAN_INTAKE_ENABLED=true`:

1. deploy durable Redis with authentication, encryption in transit, persistence,
   memory policy, backups, and private-network access controls;
2. deploy a trusted edge that strips and overwrites the configured client-IP
   header, redacts `Authorization` from access logs and traces, and verify that
   redaction end to end with a disposable bearer before proceeding;
3. deploy the worker using the isolation gate in `crawler-worker.md` and confirm
   it re-admits and pins every connection;
4. configure edge rate and body-size limits;
5. verify queue depth, oldest-job age, Redis memory, rejection counts, and worker
   failures are monitored; and
6. test disabling intake independently of stopping workers; and
7. verify application logs, APM, support captures, and error reporting also omit
   status bearer values.

After those checks and an intake/status smoke test, enable
`PUBLIC_SCAN_UI_ENABLED=true` last. For rollback, disable the UI gate first; it
immediately restores the address-only preview without stopping already queued
work.

Until those gates pass, the committed default remains disabled.
