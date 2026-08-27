import type { Metadata } from "next";
import { connection } from "next/server";

import { PublicFooter, PublicHeader } from "@/components/public-site-shell";
import { ScanEntryForm } from "@/components/scan-entry-form";
import { createPublicPageMetadata } from "@/lib/public-page-metadata";
import { isPublicScanUiEnabled } from "@/server/public-scan-ui-config";

const homeDescription =
  "Check one public homepage for status, HTTPS, robots access, redirects, title, description, canonical, headings, and indexing directives. Speed, multi-page crawling, AEO, and GEO are planned.";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return createPublicPageMetadata({
    description: homeDescription,
    path: "/",
    title: {
      absolute: "SiteMend — Clear public-homepage health checks",
    },
  });
}

const healthAreas = [
  {
    number: "01",
    eyebrow: "Technical",
    status: "Available now",
    title: "Homepage access",
    description:
      "Status, HTTPS, robots access, and redirect evidence from one bounded homepage crawl.",
  },
  {
    number: "02",
    eyebrow: "SEO",
    status: "Available now",
    title: "Search essentials",
    description:
      "Title, description, canonical URL, and indexing directives explained in plain language.",
  },
  {
    number: "03",
    eyebrow: "Content",
    status: "Available now",
    title: "Heading structure",
    description:
      "Homepage H1 usage and heading hierarchy checked with deterministic evidence.",
  },
  {
    number: "04",
    eyebrow: "Experience",
    status: "Planned",
    title: "Speed and usability",
    description:
      "Core Web Vitals, loading, interaction, and layout evidence are on the roadmap.",
  },
  {
    number: "05",
    eyebrow: "AEO + GEO",
    status: "Planned",
    title: "AI answer readiness",
    description:
      "AI crawler access and citation readiness are planned without imaginary rankings or guarantees.",
  },
];

const steps = [
  {
    title: "Scan",
    description: "Collect repeatable evidence from one public homepage.",
  },
  {
    title: "Understand",
    description: "See what happened and why it matters in everyday language.",
  },
  {
    title: "Fix",
    description: "Start with the clearest high-impact action, not a wall of warnings.",
  },
  {
    title: "Verify",
    description: "Run the same check again and confirm that the evidence changed.",
  },
  {
    title: "Monitor",
    description: "Planned: catch important regressions with scheduled checks.",
  },
];

const principles = [
  {
    title: "Evidence before scores",
    description:
      "Every finding should show what SiteMend observed. No invented measurements or mystery grades.",
  },
  {
    title: "One next action",
    description:
      "Priority, impact, and a concrete fix appear before secondary detail, so the report stays usable.",
  },
  {
    title: "Safe by default",
    description:
      "Checks are read-only, addresses are validated, and SiteMend never changes your website.",
  },
];

export function HomePage({
  liveScanningEnabled = false,
}: Readonly<{ liveScanningEnabled?: boolean }>) {
  return (
    <>
      <PublicHeader />

      <main id="main-content" tabIndex={-1}>
        <section className="hero-grid" aria-labelledby="hero-title">
          <div className="relative z-10 max-w-3xl">
            <p className="eyebrow">
              <span aria-hidden="true" className="status-dot" />
              Website health, explained simply
            </p>
            <h1
              className="hero-title mt-6 max-w-3xl text-balance font-black leading-[0.96] tracking-[-0.055em] text-ink"
              id="hero-title"
            >
              Find what hurts your homepage.
              <span className="mt-2 block text-accent">Know what to fix next.</span>
            </h1>
            <div className="hero-scan max-w-2xl" id="website-check">
              <ScanEntryForm liveScanningEnabled={liveScanningEnabled} />
            </div>

            <p className="hero-scope max-w-2xl">
              This release checks one public homepage for status, HTTPS, robots
              access, redirects, title, description, canonical, headings, and
              indexing directives. Speed, multi-page crawling, AEO, and GEO are
              clearly marked as planned.
            </p>

            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-muted">
              {["No signup to begin", "Plain-language guidance", "Read-only checks"].map(
                (item) => (
                  <li className="inline-flex items-center gap-2" key={item}>
                    <span aria-hidden="true" className="check-mark">
                      ✓
                    </span>
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          <aside className="relative z-10 self-center lg:pl-7" aria-label="Example report preview">
            <div className="soft-panel p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
                <div>
                  <p className="text-sm font-bold text-accent">Example report</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.025em] text-ink">
                    The next action stays obvious
                  </h2>
                </div>
                <span className="rounded-full border border-ink/20 bg-highlight px-3 py-1.5 text-xs font-black text-ink">
                  PREVIEW ONLY
                </span>
              </div>

              <div className="soft-inset mt-5 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="priority-mark">
                    !
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-danger">
                      Fix now
                    </p>
                    <p className="mt-1 font-extrabold text-ink">Remove an accidental noindex</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      The example keeps the observed directive, its impact, and the next fix together.
                    </p>
                  </div>
                </div>
              </div>

              <ol className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Example finding details">
                <li className="report-detail">
                  <span className="report-detail-number">01</span>
                  <div>
                    <p className="font-bold text-ink">View evidence</p>
                    <p className="mt-1 text-sm leading-5 text-muted">See the exact page signal.</p>
                  </div>
                </li>
                <li className="report-detail">
                  <span className="report-detail-number">02</span>
                  <div>
                    <p className="font-bold text-ink">Verify the fix</p>
                    <p className="mt-1 text-sm leading-5 text-muted">Repeat the same check.</p>
                  </div>
                </li>
              </ol>

              <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm font-semibold text-muted">
                <span aria-hidden="true" className="check-mark">
                  ✓
                </span>
                Every finding is designed to carry inspectable evidence.
              </p>
            </div>
          </aside>
        </section>

        <section
          aria-labelledby="workflow-title"
          className="section-shell scroll-mt-6"
          id="how-it-works"
        >
          <div className="max-w-2xl">
            <p className="section-kicker">One simple loop</p>
            <h2 className="section-title" id="workflow-title">
              From “something feels wrong” to a focused homepage fix.
            </h2>
            <p className="section-copy">
              Scan, understand, fix, and manually verify are available now.
              Scheduled monitoring is planned.
            </p>
          </div>

          <ol
            aria-label="SiteMend workflow"
            className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            {steps.map((step, index) => (
              <li className="soft-card flex flex-col p-5 lg:min-h-52" key={step.title}>
                <span className="step-number">0{index + 1}</span>
                <h3 className="mt-6 text-xl font-black tracking-[-0.025em] text-ink lg:mt-8">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="health-areas-title"
          className="section-shell scroll-mt-6 border-y border-line/80"
          id="what-we-check"
        >
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div>
              <p className="section-kicker">One health view</p>
              <h2 className="section-title" id="health-areas-title">
                The important signals belong together.
              </h2>
            </div>
            <p className="section-copy lg:justify-self-end">
              Today&apos;s report explains one homepage. Roadmap areas are labelled
              so planned coverage never looks like live evidence.
            </p>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {healthAreas.map((area) => (
              <article className="soft-card p-5" key={area.number}>
                <div className="flex items-center justify-between gap-3">
                  <span className="step-number">{area.number}</span>
                  <span className="rounded-full border border-accent/30 bg-accent/8 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.1em] text-accent">
                    {area.status}
                  </span>
                </div>
                <p className="mt-4 text-xs font-black uppercase tracking-[0.1em] text-accent">
                  {area.eyebrow}
                </p>
                <h3 className="mt-2 text-lg font-black tracking-[-0.02em] text-ink">
                  {area.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted">{area.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="principles-title"
          className="section-shell scroll-mt-6"
          id="why-sitemend"
        >
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div className="max-w-xl">
              <p className="section-kicker">Clarity is a feature</p>
              <h2 className="section-title" id="principles-title">
                Built for owners, not audit experts.
              </h2>
              <p className="section-copy">
                The interface stays calm because the work behind it is strict:
                deterministic checks, explicit evidence, and honest limitations.
              </p>
              <a className="secondary-action mt-7" href="#website-check">
                {liveScanningEnabled ? "Start a health check" : "Preview your site address"}
                <span aria-hidden="true" className="action-arrow">
                  ↑
                </span>
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {principles.map((principle, index) => (
                <article className="soft-card p-5" key={principle.title}>
                  <span aria-hidden="true" className="principle-icon">
                    {index + 1}
                  </span>
                  <h3 className="mt-6 text-lg font-black tracking-[-0.02em] text-ink">
                    {principle.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {principle.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}

export default async function Home() {
  await connection();

  return <HomePage liveScanningEnabled={isPublicScanUiEnabled()} />;
}
