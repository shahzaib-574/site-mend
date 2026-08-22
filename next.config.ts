import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

// Next 16 emits inline framework/bootstrap scripts and styles for App Router
// hydration. A static next.config header cannot attach per-request nonces, so
// keep those inline allowances narrow: resource origins stay same-origin,
// attribute scripts/styles are denied, and eval is enabled only for dev tools.
const isolatedDocumentContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self'",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'none'",
  "worker-src 'self'",
].join("; ");

const isolatedDocumentHeaders = [
  {
    key: "Content-Security-Policy",
    value: isolatedDocumentContentSecurityPolicy,
  },
  { key: "Permissions-Policy", value: "browsing-topics=()" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Default-deny every current document, including scan entry, legal,
        // errors, and unknown routes. A future monetized editorial subtree must
        // deliberately narrow this matcher in its own audited release.
        source: "/:path*",
        headers: [...isolatedDocumentHeaders],
      },
      {
        source: "/scan",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },
  // Queue clients rely on Node.js connection and script-loading behavior and
  // must remain server-only native dependencies in Route Handlers.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
