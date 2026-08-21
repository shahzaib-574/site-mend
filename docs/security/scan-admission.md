# Scan admission security boundary

Every submitted target is hostile. SiteMend must admit a target before a crawler,
browser worker, queue producer, or third-party performance adapter can use it.

## Implemented in this boundary

The server-side admission service:

- accepts only normalized HTTP or HTTPS origins without credentials or custom
  ports;
- resolves all DNS answers with a three-second timeout and a maximum of sixteen
  answers;
- fails closed when DNS fails, returns no answers, returns malformed data, or
  returns too many answers;
- rejects the entire target if any IPv4 or IPv6 answer is private, loopback,
  link-local, multicast, documentation-only, benchmarking, reserved, or otherwise
  intentionally blocked;
- deduplicates approved answers; and
- resolves relative and absolute redirect locations, then applies the complete
  URL and DNS policy again.

The feature-gated [scan intake API](../api/scans.md) can run this admission check
before adding a minimal job to Redis/BullMQ. Intake remains disabled by default
until the isolated worker exists. No page fetch or browser navigation is enabled
by either boundary.

The address policy was reviewed against IANA's current
[IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and
[IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/)
special-purpose registries on 2026-08-21. It intentionally fails closed for
special-purpose translation, protocol, and anycast ranges that are not normal
website scan destinations. IANA registry changes require a policy and regression
test review before release.

## Required invariants for the crawler PR

Admission is necessary but is not enough to stop DNS rebinding on its own. The
future HTTP worker must:

1. run in an isolated worker without access to application credentials or the
   private network;
2. connect only to an address returned by the latest admission check, while using
   the admitted hostname for TLS certificate and Host-header validation;
3. verify the connected socket address against the same IP policy;
4. disable automatic redirects and explicitly admit every `Location` target;
5. cap redirect count, request count, wall time, response bytes, decompressed
   bytes, and accepted content types;
6. never forward user cookies, authorization headers, or fetched credentials;
7. preserve the intake boundary's distributed limits and add worker-side
   concurrency and destination controls;
8. identify SiteMend's crawler and respect robots.txt; and
9. require ownership verification before deep, frequent, authenticated, or
   non-public scanning.

If address pinning is unavailable in a selected HTTP client, that client cannot
be used for hostile scan targets.

## Error handling and privacy

Admission errors have stable machine-readable codes and plain user-safe messages.
Callers must not include resolved private addresses, DNS implementation errors,
tokens, headers, or submitted credentials in logs or client responses.

The queue-producer threat model is documented separately in
[`scan-intake.md`](scan-intake.md).
