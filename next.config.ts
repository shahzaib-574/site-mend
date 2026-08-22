import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/scan",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "Permissions-Policy", value: "browsing-topics=()" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
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
