import type { Metadata } from "next";

import {
  readSiteConfig,
  type SiteConfigEnvironment,
} from "@/lib/site-config";

export type PublicPagePath =
  | "/"
  | "/about"
  | "/contact"
  | "/privacy"
  | "/terms";

export function createPublicPageMetadata(
  page: Readonly<{
    description: string;
    path: PublicPagePath;
    title: Metadata["title"];
  }>,
  environment: SiteConfigEnvironment = process.env,
): Metadata {
  const release = readSiteConfig(environment);

  return {
    title: page.title,
    description: page.description,
    ...(release.ready && release.origin
      ? {
          alternates: {
            canonical: new URL(page.path, `${release.origin}/`).toString(),
          },
        }
      : {
          robots: {
            follow: false,
            index: false,
            noarchive: true,
          },
        }),
  };
}
