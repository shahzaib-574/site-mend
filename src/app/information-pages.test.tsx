import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AboutPage, { generateMetadata as generateAboutMetadata } from "./about/page";
import ContactPage, {
  generateMetadata as generateContactMetadata,
} from "./contact/page";
import PrivacyPage, {
  generateMetadata as generatePrivacyMetadata,
} from "./privacy/page";
import TermsPage, { generateMetadata as generateTermsMetadata } from "./terms/page";

const informationPages: ReadonlyArray<{
  Page: ComponentType;
  heading: string;
  generateMetadata: () => ReturnType<typeof generateAboutMetadata>;
  name: string;
}> = [
  {
    Page: AboutPage,
    heading: "Website health without the wall of jargon.",
    generateMetadata: generateAboutMetadata,
    name: "About",
  },
  {
    Page: ContactPage,
    heading: "Send the right detail to the right place.",
    generateMetadata: generateContactMetadata,
    name: "Contact",
  },
  {
    Page: PrivacyPage,
    heading: "A small data footprint for a small, focused scan.",
    generateMetadata: generatePrivacyMetadata,
    name: "Privacy",
  },
  {
    Page: TermsPage,
    heading: "Use SiteMend responsibly and verify every result.",
    generateMetadata: generateTermsMetadata,
    name: "Terms",
  },
];

describe("public information pages", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_CONTACT_EMAIL", "");
    vi.stubEnv("SITE_LEGAL_JURISDICTION", "");
    vi.stubEnv("SITE_OPERATOR_NAME", "");
    vi.stubEnv("SITE_ORIGIN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(informationPages)(
    "$name has shared semantics, root-safe links, and no automated accessibility violations",
    async ({ Page, heading }) => {
      render(<Page />);

      expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
        "href",
        "#main-content",
      );
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
      expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();

      const primaryNavigation = screen.getByRole("navigation", {
        name: /primary navigation/i,
      });
      expect(
        within(screen.getByRole("banner"))
          .getAllByRole("link")
          .map((link) => link.getAttribute("href")),
      ).toEqual([
        "/",
        "/#how-it-works",
        "/#what-we-check",
        "/#why-sitemend",
        "/#website-check",
      ]);
      expect(
        within(screen.getByRole("banner"))
          .getAllByRole("link")
          .every((link) => link.dataset.navigation === "new-document"),
      ).toBe(true);
      expect(
        within(primaryNavigation)
          .getAllByRole("link")
          .every((link) => link.getAttribute("href")?.startsWith("/#")),
      ).toBe(true);

      const footerNavigation = screen.getByRole("navigation", {
        name: /footer navigation/i,
      });
      for (const href of ["/about", "/contact", "/privacy", "/terms"]) {
        const link = within(footerNavigation).getByRole("link", {
          name: new RegExp(href.slice(1), "i"),
        });
        expect(link).toHaveAttribute("href", href);
        expect(link).toHaveAttribute("data-navigation", "new-document");
      }

      const result = await axe.run(document.body, {
        rules: {
          // JSDOM cannot calculate rendered contrast; browser review covers the
          // documented design-token pairings.
          "color-contrast": { enabled: false },
        },
      });

      expect(result.violations).toEqual([]);
    },
  );

  it("defines a unique, truthful title and description for every route", () => {
    const metadata = informationPages.map(({ generateMetadata }) =>
      generateMetadata(),
    );
    const titles = metadata.map((entry) => entry.title);
    const descriptions = metadata.map((entry) => entry.description);

    expect(titles.every((title) => typeof title === "string" && title.length > 0)).toBe(true);
    expect(descriptions.every((description) => typeof description === "string" && description.length > 0)).toBe(true);
    expect(new Set(titles).size).toBe(informationPages.length);
    expect(new Set(descriptions).size).toBe(informationPages.length);
    expect(metadata.every((entry) => entry.alternates === undefined)).toBe(true);
    expect(
      metadata.every(
        (entry) =>
          entry.robots &&
          typeof entry.robots === "object" &&
          entry.robots.index === false &&
          entry.robots.follow === false,
      ),
    ).toBe(true);
  });

  it("emits the exact route canonicals only after complete release configuration", () => {
    vi.stubEnv("SITE_CONTACT_EMAIL", "privacy@sitemend.app");
    vi.stubEnv("SITE_LEGAL_JURISDICTION", "Pakistan");
    vi.stubEnv("SITE_OPERATOR_NAME", "SiteMend Labs");
    vi.stubEnv("SITE_ORIGIN", "https://sitemend.app");

    expect(
      informationPages.map(({ generateMetadata }) =>
        generateMetadata().alternates?.canonical,
      ),
    ).toEqual([
      "https://sitemend.app/about",
      "https://sitemend.app/contact",
      "https://sitemend.app/privacy",
      "https://sitemend.app/terms",
    ]);
  });

  it("routes ordinary support publicly and suspected vulnerabilities privately", () => {
    render(<ContactPage />);

    expect(screen.getByRole("link", { name: /open github issues/i })).toHaveAttribute(
      "href",
      "https://github.com/shahzaib-574/site-mend/issues",
    );
    expect(screen.getByRole("link", { name: /read security\.md/i })).toHaveAttribute(
      "href",
      "https://github.com/shahzaib-574/site-mend/blob/main/SECURITY.md",
    );
    expect(screen.getByRole("link", { name: /start a private advisory/i })).toHaveAttribute(
      "href",
      "https://github.com/shahzaib-574/site-mend/security/advisories/new",
    );
    expect(screen.getByText(/never share a scan bearer link/i)).toBeInTheDocument();
    expect(document.querySelector('a[href^="mailto:"]')).not.toBeInTheDocument();
  });

  it("publishes only a complete validated production identity", () => {
    vi.stubEnv("SITE_CONTACT_EMAIL", "privacy@sitemend.app");
    vi.stubEnv("SITE_LEGAL_JURISDICTION", "Pakistan");
    vi.stubEnv("SITE_OPERATOR_NAME", "SiteMend Labs");
    vi.stubEnv("SITE_ORIGIN", "https://sitemend.app");

    render(<ContactPage />);

    expect(screen.getByText(/operated by/i)).toHaveTextContent("SiteMend Labs");
    expect(screen.getByText(/declared/i)).toHaveTextContent("Pakistan");
    expect(screen.getByRole("link", { name: "privacy@sitemend.app" })).toHaveAttribute(
      "href",
      "mailto:privacy@sitemend.app",
    );
  });

  it("states the implemented privacy and lazy-retention boundaries", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/only that origin is submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/keyed HMAC digests/i)).toBeInTheDocument();
    expect(screen.getByText(/sessionStorage/i)).toBeInTheDocument();
    expect(screen.getByText(/anyone with the complete bearer link/i)).toBeInTheDocument();
    expect(screen.getByText(/completed records target removal after one day/i)).toBeInTheDocument();
    expect(screen.getByText(/failed records target removal after seven days/i)).toBeInTheDocument();
    expect(screen.getByText(/not hard maximum time-to-live guarantees/i)).toBeInTheDocument();
    expect(screen.getByText(/currently loads no ads, analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/before advertising or analytics is introduced/i)).toBeInTheDocument();
  });

  it("sets responsible-use boundaries without inventing legal details", () => {
    render(<TermsPage />);

    expect(screen.getByText(/own, manage, or have permission to assess/i)).toBeInTheDocument();
    expect(screen.getByText(/respects robots\.txt/i)).toBeInTheDocument();
    expect(screen.getByText(/does not edit, deploy, or otherwise change/i)).toBeInTheDocument();
    expect(screen.getByText(/does not guarantee traffic, rankings/i)).toBeInTheDocument();
    expect(screen.getByText(/MIT License/i)).toBeInTheDocument();
    expect(screen.getByText(/has not published a commercial service operator or governing jurisdiction/i)).toBeInTheDocument();
  });
});
