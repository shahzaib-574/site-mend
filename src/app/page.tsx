import { ScanEntryForm } from "@/components/scan-entry-form";
import { product } from "@/lib/product";

const healthAreas = [
  {
    number: "01",
    eyebrow: "SEO",
    title: "Search and indexing",
    description:
      "Status, HTTPS, redirects, robots access, canonicals, and indexing directives.",
  },
  {
    number: "02",
    eyebrow: "Experience",
    title: "Speed and usability",
    description:
      "Loading, interaction, and layout evidence translated into a practical next step.",
  },
  {
    number: "03",
    eyebrow: "Technical",
    title: "Site reliability",
    description:
      "Broken responses, redirect paths, crawl access, and the signals that keep pages dependable.",
  },
  {
    number: "04",
    eyebrow: "Content",
    title: "Page structure",
    description:
      "Titles, descriptions, headings, and content hierarchy checked in plain language.",
  },
  {
    number: "05",
    eyebrow: "AEO + GEO",
    title: "AI answer readiness",
    description:
      "Access, identity, structure, and evidence—without imaginary AI rankings or guarantees.",
  },
];

const steps = [
  {
    title: "Scan",
    description: "Collect repeatable evidence from the pages you choose.",
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
    description: "Catch important regressions before visitors or search engines do.",
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

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="border-b border-line/80" id="top">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-8 lg:px-10">
          <a
            aria-label={`${product.name} home`}
            className="inline-flex min-h-12 w-fit items-center gap-3 rounded-xl font-extrabold tracking-[-0.03em] text-ink"
            href="#top"
          >
            <span aria-hidden="true" className="brand-mark">
              S
            </span>
            <span className="text-lg">{product.name}</span>
          </a>

          <nav
            aria-label="Primary navigation"
            className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto"
          >
            <a className="nav-link" href="#how-it-works">
              How it works
            </a>
            <a className="nav-link" href="#what-we-check">
              What we check
            </a>
            <a className="nav-link" href="#why-sitemend">
              Why SiteMend
            </a>
          </nav>

          <a className="primary-action min-h-12 sm:ml-2" href="#website-check">
            Check a site
            <span aria-hidden="true" className="action-arrow">
              ↓
            </span>
          </a>
        </div>
      </header>

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
              Find what hurts your site.
              <span className="mt-2 block text-accent">Know what to fix next.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              One calm health check for SEO, speed, technical quality, content,
              AEO, and GEO—organized around evidence instead of jargon.
            </p>

            <div className="mt-9 max-w-2xl scroll-mt-6" id="website-check">
              <ScanEntryForm />
            </div>

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
              From “something feels wrong” to “it stays fixed.”
            </h2>
            <p className="section-copy">
              Each stage answers one question and leads naturally to the next.
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
              SiteMend groups related evidence so you can understand the whole
              website without switching between specialist tools.
            </p>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {healthAreas.map((area) => (
              <article className="soft-card p-5" key={area.number}>
                <div className="flex items-center justify-between gap-3">
                  <span className="step-number">{area.number}</span>
                  <span className="rounded-full border border-accent/30 bg-accent/8 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.1em] text-accent">
                    {area.eyebrow}
                  </span>
                </div>
                <h3 className="mt-7 text-lg font-black tracking-[-0.02em] text-ink">
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
                Preview your site address
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

      <footer className="border-t border-line/80">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div>
            <p className="font-extrabold text-ink">{product.name}</p>
            <p className="mt-1">{product.tagline}</p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a className="footer-link" href="#how-it-works">
              How it works
            </a>
            <a className="footer-link" href="#what-we-check">
              What we check
            </a>
            <a
              className="footer-link"
              href="https://github.com/shahzaib-574/site-mend"
              rel="noreferrer"
              target="_blank"
            >
              Open-source build
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
