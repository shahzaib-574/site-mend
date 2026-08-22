# SiteMend

**Scan. Understand. Fix. Verify. Monitor.**

SiteMend is an open-source, plain-language website health checker. It brings
search visibility, technical reliability, performance, content structure, and
AI-search readiness into one prioritized workflow without overwhelming website
owners with SEO jargon.

## Product promise

Paste a website, see what is broken, understand what matters most, follow an
exact fix, verify the improvement, and monitor for important regressions.

## Status

SiteMend is in active foundation development. See the
[implementation plan](docs/implementation-plan.md),
[architecture](docs/architecture.md), and [audit catalog](docs/audit-catalog.md).

## Development

Requirements: Node.js 22 and npm 10 or newer.

```bash
npm install
npm run dev
```

The feature-gated scan API also requires Redis and trusted reverse-proxy client
identity. It stays disabled by default; see [the scan API guide](docs/api/scans.md)
before configuring it. The public progress/results experience has its own
server-only rollout gate and cannot enable intake by itself. Do not enable either
public boundary until authorization-header redaction has been verified across the
edge, application logs, tracing, APM, and support tooling.

The homepage crawler is built and run as a separate Node.js service. It also
stays disabled by default. Read the
[crawler worker security and deployment guide](docs/security/crawler-worker.md)
before starting it or enabling public intake.

Before opening a pull request:

```bash
npm run verify
```

All product work is delivered through focused pull requests. Read
[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) before changing the
repository.

## License

SiteMend is available under the [MIT License](LICENSE).
