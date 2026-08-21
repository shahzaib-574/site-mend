# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security advisory flow for this repository.

Include reproduction steps, affected versions, impact, and any suggested
mitigation. Do not access data that does not belong to you.

## Security posture

SiteMend treats URLs and remote responses as hostile. Scanner work must include
SSRF defenses, redirect and DNS revalidation, private-network blocking, strict
resource limits, browser isolation, rate limiting, and secret-safe logging.

No crawler feature may merge without a focused threat-model note and tests for
its relevant trust boundary.
