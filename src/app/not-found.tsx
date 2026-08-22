import type { Metadata } from "next";

import { HardDocumentLink } from "@/components/hard-document-link";
import { PublicFooter, PublicHeader } from "@/components/public-site-shell";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The requested SiteMend page could not be found.",
  robots: {
    follow: false,
    index: false,
    noarchive: true,
  },
};

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="report-page" id="main-content" tabIndex={-1}>
        <section aria-labelledby="not-found-title" className="soft-panel report-empty">
          <p className="section-kicker">Page not found</p>
          <h1 className="report-state-title" id="not-found-title">
            This address does not match a SiteMend page.
          </h1>
          <p className="report-state-copy">
            Nothing was scanned. Return home to check an address or use the public
            navigation to find product information.
          </p>
          <HardDocumentLink className="primary-action mt-6" href="/">
            Return home
          </HardDocumentLink>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
