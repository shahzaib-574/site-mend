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
        <div className="mx-auto flex w-full max-w-7xl flex-col items-stretch gap-2 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-8 lg:px-10">
          <HardDocumentLink
            ariaLabel={`${product.name} home`}
            className="inline-flex min-h-12 w-fit items-center gap-3 rounded-xl font-extrabold tracking-[-0.03em] text-ink"
            href="/"
          >
            <span aria-hidden="true" className="brand-mark">
              S
            </span>
            <span className="text-lg">{product.name}</span>
          </HardDocumentLink>

          <nav
            aria-label="Primary navigation"
            className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto"
          >
            {primaryLinks.map((link) => (
              <HardDocumentLink
                className="nav-link grow basis-32 justify-center text-center sm:grow-0 sm:basis-auto"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </HardDocumentLink>
            ))}
          </nav>

          <HardDocumentLink
            className="primary-action min-h-12 w-full justify-center sm:ml-2 sm:w-auto"
            href="/#website-check"
          >
            Check an address
            <span aria-hidden="true" className="action-arrow">
              ↓
            </span>
          </HardDocumentLink>
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
