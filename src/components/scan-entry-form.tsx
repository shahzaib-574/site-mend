"use client";

import { FormEvent, useState } from "react";

import {
  normalizeWebsiteUrl,
  type WebsiteUrlResult,
} from "@/lib/website-url";

const healthAreas = [
  "Search visibility",
  "Speed and experience",
  "Technical health",
  "Content structure",
  "AI readiness",
];

export function ScanEntryForm() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<WebsiteUrlResult | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(normalizeWebsiteUrl(value));
  }

  const error = result && !result.ok ? result.message : undefined;
  const accepted = result?.ok ? result : undefined;

  return (
    <div className="rounded-[2rem] border border-slate-200/80 bg-white p-3 shadow-[0_28px_80px_-38px_rgba(15,23,42,0.4)] sm:p-4">
      <form onSubmit={handleSubmit} noValidate>
        <label
          className="mb-2 block px-2 text-sm font-semibold text-slate-800"
          htmlFor="website"
        >
          Your website address
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <input
              aria-describedby={error ? "website-error" : "website-help"}
              aria-invalid={Boolean(error)}
              autoCapitalize="none"
              autoComplete="url"
              className="h-14 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-4 focus:ring-teal-600/10 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/10"
              id="website"
              inputMode="url"
              name="website"
              onChange={(event) => {
                setValue(event.target.value);
                if (result) setResult(null);
              }}
              placeholder="example.com"
              spellCheck={false}
              type="text"
              value={value}
            />
          </div>
          <button
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-semibold text-white transition hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 active:translate-y-px"
            type="submit"
          >
            Check my website
            <span aria-hidden="true" className="transition group-hover:translate-x-1">
              →
            </span>
          </button>
        </div>

        {error ? (
          <p
            className="mt-3 px-2 text-sm font-medium text-red-700"
            id="website-error"
            role="alert"
          >
            {error}
          </p>
        ) : (
          <p className="mt-3 px-2 text-sm text-slate-500" id="website-help">
            No account needed. Start with any public website.
          </p>
        )}
      </form>

      {accepted ? (
        <section
          aria-live="polite"
          className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-5"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-teal-700 text-sm font-bold text-white"
            >
              ✓
            </span>
            <div>
              <h2 className="font-bold text-slate-950">
                {accepted.hostname} is ready for a health check
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                We&apos;ll start at {accepted.url}. This preview validates your
                website address without starting a live scan.
              </p>
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Planned health areas">
            {healthAreas.map((area) => (
              <li
                className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-900"
                key={area}
              >
                {area}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
