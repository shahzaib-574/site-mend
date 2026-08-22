import type { MetadataRoute } from "next";

import { readSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

const PUBLIC_PATHS = ["/", "/about", "/contact", "/privacy", "/terms"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const config = readSiteConfig();

  if (!config.ready || !config.origin) {
    return [];
  }

  return PUBLIC_PATHS.map((path) => ({
    url: new URL(path, `${config.origin}/`).toString(),
  }));
}
