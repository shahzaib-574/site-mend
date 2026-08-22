import type { ReactNode } from "react";

export function HardDocumentLink({
  ariaLabel,
  children,
  className,
  href,
}: Readonly<{
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  href:
    | "/"
    | "/about"
    | "/contact"
    | "/privacy"
    | "/terms"
    | `/#${string}`;
}>) {
  return (
    <a
      aria-label={ariaLabel}
      className={className}
      data-navigation="new-document"
      href={href}
    >
      {children}
    </a>
  );
}
