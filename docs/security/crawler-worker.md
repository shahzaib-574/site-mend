# Homepage crawler worker security boundary

The homepage crawler is a standalone Node.js service that consumes
`homepage-health-check` jobs from BullMQ. It is source-separated from Next.js and
has its own build, start command, feature gate, concurrency, secret, Redis
connections, and graceful shutdown. Source separation is not a substitute for a
container or operating-system sandbox.

## Data flow and output

The worker accepts only the exact queue schema: scan ID, request timestamp,
normalized public origin, and hostname. It validates the job name and requires the
BullMQ job ID to equal the scan ID.

For a completed fetch it returns schema-version `1` data containing:

- scan ID, completion time, and `fetched` or `blocked-by-robots` outcome;
- robots origin, found/not-found state, bounded byte count, SHA-256 digest, and
  sanitized redirect evidence;
- homepage status, accepted media type, bounded byte count, SHA-256 digest, and
  sanitized redirect evidence.

URLs in evidence omit query strings and fragments. Response bodies, cookies,
authorization data, `Set-Cookie`, arbitrary headers, DNS answers, socket
addresses, and fetched credentials are never returned. BullMQ failures contain
internal safe error messages, and the public status API never exposes them.

## Enforced request boundary

Every network response and queue value is hostile. The worker:

1. revalidates the complete queue payload;
2. admits DNS immediately before robots connections and re-admits a page after
   any robots request so a stale answer cannot be reused;
3. connects Undici to one approved IP while keeping the admitted hostname as the
   HTTP origin and TLS SNI/certificate identity;
4. checks the connected socket's remote address against both the exact pinned IP
   and the public-IP policy before allowing Undici to send the request;
5. does not use environment proxies or automatic redirects;
6. explicitly normalizes and DNS-admits every redirect destination, rejects
   loops, and checks robots for every new page origin;
7. sends only fixed `Accept`, `Accept-Encoding: identity`, `Cache-Control`, and
   identifying `User-Agent` headers; and
8. streams evidence and destroys the client after each request rather than
   pooling connections across admissions.

The product token is `SiteMendBot` and the identification string links to the
public repository. robots.txt handling follows the conservative rules below:

- `200 text/plain` is parsed as strict UTF-8;
- `204` is treated as an empty policy;
- `404` and `410` mean no policy was found;
- redirects are followed only through the same admission boundary; and
- every other status, invalid encoding, invalid media type, oversized file, or
  fetch error fails closed without requesting the page.

If a page is disallowed, the job completes as `blocked-by-robots` and does not
request it.

## Fixed resource limits

| Resource | Limit |
| --- | ---: |
| Worker concurrency per process | 1-4; default 2 |
| Simultaneous crawls per hostname | 1 across workers |
| Destination lease | 45 seconds |
| Total job wall time | 30 seconds |
| Requests across robots and homepage | 8 |
| Redirects across the job | 5 |
| DNS lookup | 3 seconds, 16 answers |
| Socket connect | 5 seconds |
| Response headers/body inactivity | 8 seconds each |
| Response headers | 16 KiB |
| robots.txt body | 500 KiB |
| Homepage body | 2 MiB |
| Accepted content encoding | identity only |
| Homepage body types | `text/html`, `application/xhtml+xml` |

Redis destination keys are HMAC digests, not raw hostnames. Lease release uses a
compare-and-delete Lua script so one worker cannot delete another worker's lease.

## Runtime configuration

Build and run the worker separately from the web service:

```bash
npm run build:worker
npm run start:worker
```

| Variable | Requirement |
| --- | --- |
| `SCAN_WORKER_ENABLED` | Must be exactly `true`; otherwise startup fails closed. |
| `REDIS_URL` | Authenticated `redis://` or TLS `rediss://` URL. |
| `SCAN_WORKER_KEY_SECRET` | At least 32 random bytes and different from intake/auth/encryption secrets. |
| `SCAN_WORKER_CONCURRENCY` | Optional integer from 1 to 4; default 2. |

SIGINT and SIGTERM stop new work, wait for the bounded active jobs to finish, and
then close Redis connections. The committed example keeps both intake and worker
disabled.

## Deployment isolation gate

Before setting `SCAN_WORKER_ENABLED=true`, operators must verify all of the
following outside this repository:

1. deploy the worker as its own non-root container/service, not in the Next.js
   process or host;
2. mount a read-only root filesystem with a small dedicated temporary directory,
   no host filesystem mounts, and no container runtime socket;
3. provide only worker Redis credentials and its HMAC secret—no database,
   application, cloud-control-plane, OAuth, storage, or signing credentials;
4. enforce CPU, memory, process, file-descriptor, and execution-time limits;
5. deny private, loopback, link-local, multicast, metadata, control-plane, and
   cluster-network egress at the network layer; allow only the trusted DNS
   resolver, Redis, and public HTTP/HTTPS destinations required for crawling;
6. use a trusted recursive resolver and prevent arbitrary DNS-server selection;
7. restrict Redis credentials/network access, persistence, backups, memory policy,
   and TLS as required by the intake deployment gate;
8. monitor queue depth, oldest-job age, job duration, failure codes, stalled jobs,
   destination contention, container restarts, and denied egress; and
9. run an SSRF canary test proving loopback, RFC1918/ULA, link-local, metadata, and
   rebinding destinations are denied before enabling public intake.

Only after this checklist and the scan-intake checklist pass may
`SCAN_INTAKE_ENABLED=true` be considered. The two feature gates must be tested
independently.

## Rollback

Set `SCAN_INTAKE_ENABLED=false` first to stop new jobs. Allow bounded active work
to finish, then stop the worker or set `SCAN_WORKER_ENABLED=false` before restart.
Destination leases expire after 45 seconds if a process is terminated. Retained
jobs contain metadata/hash evidence only; removing them follows the queue
retention policy and is a separate deliberate operation.
