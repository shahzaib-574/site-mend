"use client";

import { HardDocumentLink } from "@/components/hard-document-link";
import { PublicHeader } from "@/components/public-site-shell";

export default function ErrorPage({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <>
      <PublicHeader />
      <main className="report-page" id="main-content" tabIndex={-1}>
        <section aria-labelledby="error-title" className="soft-panel report-empty">
          <p className="section-kicker">SiteMend paused safely</p>
          <h1 className="report-state-title" id="error-title">
            This page could not finish loading.
          </h1>
          <p className="report-state-copy" role="alert">
            No internal error detail or partial result is shown. Try the page again,
            or return to the third-party-free homepage.
          </p>
          <div className="information-actions mt-6">
            <button className="primary-action" onClick={reset} type="button">
              Try again
            </button>
            <HardDocumentLink className="secondary-action" href="/">
              Return home
            </HardDocumentLink>
          </div>
        </section>
      </main>
    </>
  );
}
