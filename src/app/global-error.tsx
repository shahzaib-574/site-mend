"use client";

import { HardDocumentLink } from "@/components/hard-document-link";

import styles from "./global-error.module.css";

export default function GlobalError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <html lang="en">
      <head>
        <title>SiteMend unavailable</title>
      </head>
      <body className={styles.shell}>
        <main className={styles.main} id="main-content" tabIndex={-1}>
          <section aria-labelledby="global-error-title" className={styles.panel}>
            <p className={styles.kicker}>SiteMend paused safely</p>
            <h1 className={styles.title} id="global-error-title">
              SiteMend could not load this view.
            </h1>
            <p className={styles.copy} role="alert">
              No internal error detail or partial result is shown. Try once more, or
              open a fresh homepage document.
            </p>
            <div className={styles.actions}>
              <button className={styles.retry} onClick={reset} type="button">
                Try again
              </button>
              <HardDocumentLink className={styles.home} href="/">
                Open SiteMend home
              </HardDocumentLink>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
