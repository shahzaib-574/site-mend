# SiteMend

**Scan. Understand. Fix. Verify.**

SiteMend is an open-source, plain-language website health checker. It brings
search visibility, technical reliability, performance, content structure, and
AI-search readiness into one prioritized workflow without overwhelming website
owners with SEO jargon.

## Product promise

Paste a website, see what is broken, understand what matters most, follow an
exact fix, and verify the improvement.

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
before configuring it.

Before opening a pull request:

```bash
npm run verify
```

All product work is delivered through focused pull requests. Read
[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) before changing the
repository.

## License

SiteMend is available under the [MIT License](LICENSE).
