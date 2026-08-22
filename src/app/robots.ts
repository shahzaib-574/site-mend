import type { MetadataRoute } from "next";

import { readSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const config = readSiteConfig();

  if (!config.ready || !config.origin) {
    return {
      rules: {
        allow: "/",
        disallow: "/api/",
        userAgent: "*",
      },
    };
  }

  return {
    host: config.origin,
    rules: {
      allow: "/",
      disallow: "/api/",
      userAgent: "*",
    },
    sitemap: `${config.origin}/sitemap.xml`,
  };
}
