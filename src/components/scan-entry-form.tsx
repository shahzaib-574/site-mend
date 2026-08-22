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
    <div className="scan-shell">
      <form onSubmit={handleSubmit} noValidate>
        <label
          className="mb-2 block px-1 text-sm font-bold text-ink"
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
              className="website-field"
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
            className="primary-action scan-submit group"
            type="submit"
          >
            Check this address
            <span aria-hidden="true" className="action-arrow">
              →
            </span>
          </button>
        </div>

        {error ? (
          <p
            className="mt-3 px-1 text-sm font-bold text-danger"
            id="website-error"
            role="alert"
          >
            {error}
          </p>
        ) : (
          <p className="mt-3 px-1 text-sm text-muted" id="website-help">
            Enter a public domain. This step checks the address only.
          </p>
        )}
      </form>

      {accepted ? (
        <section
          aria-labelledby="website-ready-title"
          aria-live="polite"
          className="form-status mt-4"
          role="status"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 border-success bg-success text-sm font-black text-white"
            >
              ✓
            </span>
            <div className="min-w-0">
              <h2 className="font-extrabold text-ink" id="website-ready-title">
                Address confirmed for{" "}
                <span className="user-address">{accepted.hostname}</span>
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                SiteMend would begin at{" "}
                <span className="user-address font-mono">{accepted.url}</span>. This
                preview validates the target without fetching the site or starting
                a live audit.
              </p>
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Planned health areas">
            {healthAreas.map((area) => (
              <li
                className="rounded-full border border-accent/40 bg-surface px-3 py-1.5 text-xs font-bold text-accent-strong"
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
