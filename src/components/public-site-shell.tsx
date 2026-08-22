import { HardDocumentLink } from "@/components/hard-document-link";
import { product } from "@/lib/product";

const primaryLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#what-we-check", label: "What we check" },
  { href: "/#why-sitemend", label: "Why SiteMend" },
] as const;

const informationLinks = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function PublicHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="public-header border-b border-line/80" id="top">
        <div className="public-header-inner">
          <HardDocumentLink
            ariaLabel={`${product.name} home`}
            className="public-brand-link"
            href="/"
          >
            <span aria-hidden="true" className="brand-mark">
              S
            </span>
            <span className="text-lg">{product.name}</span>
          </HardDocumentLink>

          <nav
            aria-label="Primary navigation"
            className="desktop-nav"
          >
            {primaryLinks.map((link) => (
              <HardDocumentLink
                className="nav-link"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </HardDocumentLink>
            ))}
          </nav>

          <HardDocumentLink
            ariaLabel="Check an address"
            className="primary-action header-scan-action"
            href="/#website-check"
          >
            <span className="header-scan-label-full">Check an address</span>
            <span aria-hidden="true" className="header-scan-label-short">
              Check
            </span>
            <span aria-hidden="true" className="action-arrow">
              ↓
            </span>
          </HardDocumentLink>

          <details className="mobile-nav">
            <summary className="mobile-nav-toggle">
              <span aria-hidden="true">☰</span>
              <span className="sr-only">Navigation menu</span>
            </summary>
            <nav aria-label="Mobile navigation" className="mobile-nav-panel">
              {primaryLinks.map((link) => (
                <HardDocumentLink className="nav-link" href={link.href} key={link.href}>
                  {link.label}
                </HardDocumentLink>
              ))}
            </nav>
          </details>
        </div>
      </header>
    </>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line/80">
      <div className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-8 text-sm text-muted sm:px-8 lg:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.3fr)] lg:items-start lg:px-10">
        <div>
          <HardDocumentLink className="footer-brand font-extrabold text-ink" href="/">
            {product.name}
          </HardDocumentLink>
          <p className="mt-1">{product.tagline}</p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-x-5 gap-y-1 lg:justify-end"
        >
          <HardDocumentLink className="footer-link" href="/#how-it-works">
            How it works
          </HardDocumentLink>
          <HardDocumentLink className="footer-link" href="/#what-we-check">
            What we check
          </HardDocumentLink>
          {informationLinks.map((link) => (
            <HardDocumentLink className="footer-link" href={link.href} key={link.href}>
              {link.label}
            </HardDocumentLink>
          ))}
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
  );
}
