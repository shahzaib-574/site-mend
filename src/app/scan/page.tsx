import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PublicScanView } from "@/components/public-scan-view";
import { product } from "@/lib/product";
import { isPublicScanUiEnabled } from "@/server/public-scan-ui-config";

export const metadata: Metadata = {
  title: "Website health check | SiteMend",
  description: "A temporary, link-access SiteMend homepage health-check report.",
  robots: {
    follow: false,
    index: false,
    noarchive: true,
  },
};

export function ScanPageShell({
  liveScanningEnabled,
}: Readonly<{ liveScanningEnabled: boolean }>) {
  return (
    <>
      <a className="skip-link" href="#scan-main">
        Skip to scan status
      </a>

      <header className="report-header border-b border-line/80">
        <div className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link
            aria-label={`${product.name} home`}
            className="inline-flex min-h-12 items-center gap-3 rounded-xl font-extrabold tracking-[-0.03em] text-ink"
            href="/"
            prefetch={false}
          >
            <span aria-hidden="true" className="brand-mark">
              S
            </span>
            <span className="text-lg">{product.name}</span>
          </Link>
          <Link className="secondary-action" href="/#website-check" prefetch={false}>
            New check
          </Link>
        </div>
      </header>

      <main className="report-page" id="scan-main" tabIndex={-1}>
        {liveScanningEnabled ? (
          <PublicScanView />
        ) : (
          <section aria-labelledby="scan-disabled-title" className="soft-panel report-empty">
            <p className="section-kicker">Live checks are paused</p>
            <h1 className="report-state-title" id="scan-disabled-title">
              Public scanning is not available right now.
            </h1>
            <p className="report-state-copy">
              No website request was made. You can still return to the homepage
              and check that an address is formatted correctly.
            </p>
            <Link className="primary-action mt-6" href="/#website-check" prefetch={false}>
              Check an address
            </Link>
          </section>
        )}
      </main>
    </>
  );
}

export default async function ScanPage() {
  await connection();

  return <ScanPageShell liveScanningEnabled={isPublicScanUiEnabled()} />;
}
