import type { ReactNode } from "react";

import { PublicFooter, PublicHeader } from "@/components/public-site-shell";

export function InformationPage({
  eyebrow,
  introduction,
  title,
  children,
}: Readonly<{
  eyebrow: string;
  introduction: string;
  title: string;
  children: ReactNode;
}>) {
  return (
    <>
      <PublicHeader />
      <main id="main-content" tabIndex={-1}>
        <article className="information-page">
          <div className="information-hero soft-panel">
            <p className="section-kicker">{eyebrow}</p>
            <h1 className="information-title">{title}</h1>
            <p className="information-introduction">{introduction}</p>
          </div>

          <div className="information-content">{children}</div>
        </article>
      </main>
      <PublicFooter />
    </>
  );
}

export function InformationSection({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="information-section">
      <h2>{title}</h2>
      <div className="information-section-copy">{children}</div>
    </section>
  );
}

export function InformationCallout({
  children,
  label = "Important information",
}: Readonly<{ children: ReactNode; label?: string }>) {
  return (
    <aside aria-label={label} className="information-callout" role="note">
      {children}
    </aside>
  );
}
