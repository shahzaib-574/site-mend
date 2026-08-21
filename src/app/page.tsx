import { ScanEntryForm } from "@/components/scan-entry-form";
import { product } from "@/lib/product";

const healthAreas = [
  {
    number: "01",
    title: "Can people find you?",
    description:
      "We look for indexing blocks, broken pages, confusing titles, and search visibility problems.",
  },
  {
    number: "02",
    title: "Does your site feel fast?",
    description:
      "We translate loading, interaction, and layout measurements into fixes people can actually follow.",
  },
  {
    number: "03",
    title: "Can AI understand you?",
    description:
      "We check access, structure, identity, and evidence without promising imaginary AI rankings.",
  },
];

const steps = ["Scan", "Understand", "Fix", "Verify"];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f8f2] text-slate-950">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
        <a
          className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
          href="#top"
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-xl bg-slate-950 text-lg font-black text-[#c9ff72] shadow-lg shadow-slate-950/15"
          >
            S
          </span>
          <span className="text-lg font-extrabold tracking-[-0.03em]">{product.name}</span>
        </a>
        <a
          className="rounded-full border border-slate-300 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          href="https://github.com/shahzaib-574/site-mend"
          rel="noreferrer"
          target="_blank"
        >
          View the open-source build
        </a>
      </header>

      <section
        className="relative mx-auto grid w-full max-w-7xl gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28 lg:pt-20"
        id="top"
      >
        <div
          aria-hidden="true"
          className="absolute -right-64 -top-36 size-[36rem] rounded-full bg-[#c9ff72]/35 blur-3xl"
        />
        <div className="relative z-10 max-w-3xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-900/10 bg-white/70 px-4 py-2 text-sm font-bold text-teal-900 shadow-sm">
            <span className="size-2 rounded-full bg-teal-600" aria-hidden="true" />
            Website health, explained simply
          </p>
          <h1 className="max-w-3xl text-balance text-5xl font-black leading-[0.96] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-7xl">
            Your website has a pulse.
            <span className="block text-teal-700">Let&apos;s make it stronger.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            Find what&apos;s broken, understand what matters, and get the clearest
            next fix—without learning a new SEO language.
          </p>

          <div className="mt-10 max-w-2xl">
            <ScanEntryForm />
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
            {[
              "No signup to start",
              "Plain-language answers",
              "We never change your site",
            ].map((item) => (
              <li className="inline-flex items-center gap-2" key={item}>
                <span aria-hidden="true" className="font-black text-teal-700">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <aside className="relative z-10 self-center lg:pl-8" aria-label="How SiteMend works">
          <div className="rotate-1 rounded-[2.25rem] bg-slate-950 p-6 text-white shadow-[0_35px_90px_-40px_rgba(15,23,42,0.8)] sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold text-slate-400">A clearer health report</p>
                <p className="mt-1 text-xl font-bold">Only what matters next</p>
              </div>
              <span className="rounded-full bg-[#c9ff72] px-3 py-1.5 text-xs font-black text-slate-950">
                PLAIN ENGLISH
              </span>
            </div>

            <div className="mt-7 space-y-4">
              {healthAreas.map((area) => (
                <article
                  className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 transition hover:bg-white/[0.09]"
                  key={area.number}
                >
                  <div className="flex gap-4">
                    <span className="font-mono text-sm font-bold text-[#c9ff72]">
                      {area.number}
                    </span>
                    <div>
                      <h2 className="font-bold">{area.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {area.description}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="border-y border-slate-200 bg-white/70">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">
                One simple loop
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                From “something&apos;s wrong” to “it&apos;s fixed.”
              </h2>
            </div>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {steps.map((step, index) => (
                <li
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  key={step}
                >
                  <span className="text-xs font-black text-teal-700">0{index + 1}</span>
                  <p className="mt-5 font-extrabold">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <p>SiteMend is being built in public.</p>
        <p>{product.tagline}</p>
      </footer>
    </main>
  );
}
