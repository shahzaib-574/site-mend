import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateMetadata, HomePage } from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Home", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_CONTACT_EMAIL", "");
    vi.stubEnv("SITE_LEGAL_JURISDICTION", "");
    vi.stubEnv("SITE_OPERATOR_NAME", "");
    vi.stubEnv("SITE_ORIGIN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds the home canonical only for complete release identity", () => {
    expect(generateMetadata().alternates).toBeUndefined();

    vi.stubEnv("SITE_CONTACT_EMAIL", "privacy@sitemend.app");
    vi.stubEnv("SITE_LEGAL_JURISDICTION", "Pakistan");
    vi.stubEnv("SITE_OPERATOR_NAME", "SiteMend Labs");
    vi.stubEnv("SITE_ORIGIN", "https://sitemend.app");

    expect(generateMetadata()).toMatchObject({
      alternates: { canonical: "https://sitemend.app/" },
      title: { absolute: "SiteMend — Clear public-homepage health checks" },
    });
  });

  it("exposes a complete landmark and heading structure", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary navigation/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("uses only real section targets in the primary navigation", () => {
    render(<HomePage />);

    const navigation = screen.getByRole("navigation", { name: /primary navigation/i });
    const mobileNavigation = screen.getByRole("navigation", {
      name: /mobile navigation/i,
    });
    const expectedLinks = [
      ["How it works", "/#how-it-works"],
      ["What we check", "/#what-we-check"],
      ["Why SiteMend", "/#why-sitemend"],
    ];

    for (const [name, href] of expectedLinks) {
      expect(within(navigation).getByRole("link", { name })).toHaveAttribute("href", href);
      expect(within(mobileNavigation).getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
      expect(document.querySelector(new URL(href, "https://sitemend.test").hash)).toBeInTheDocument();
    }

    expect(screen.getByText("Navigation menu").closest("summary")).toHaveClass(
      "mobile-nav-toggle",
    );

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
      "/#how-it-works",
      "/#what-we-check",
      "/#why-sitemend",
    ]);
    expect(
      within(screen.getByRole("banner"))
        .getAllByRole("link")
        .every((link) => link.dataset.navigation === "new-document"),
    ).toBe(true);
  });

  it("links the shared footer to public information pages", () => {
    render(<HomePage />);

    const navigation = screen.getByRole("navigation", { name: /footer navigation/i });

    for (const [name, href] of [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ]) {
      const link = within(navigation).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("data-navigation", "new-document");
    }
  });

  it("puts the primary check before the detailed scope while keeping every limit explicit", () => {
    render(<HomePage liveScanningEnabled />);

    const scope = screen.getByText(/this release checks one public homepage/i);
    const form = screen.getByLabelText(/website address/i).closest("form");

    expect(form).not.toBeNull();
    expect(
      form!.compareDocumentPosition(scope) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(scope).toHaveTextContent(
      /status, HTTPS, robots access, redirects, title, description, canonical, headings, and indexing directives/i,
    );
    expect(screen.getByText(/speed, multi-page crawling, AEO, and GEO/i)).toHaveTextContent(
      /clearly marked as planned/i,
    );
    expect(screen.getAllByText("Available now")).toHaveLength(3);
    expect(screen.getAllByText("Planned")).toHaveLength(2);
    expect(screen.queryByText(/understand the whole website/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start health check/i })).toBeInTheDocument();
  });

  it("presents the full product loop and the honest address action", () => {
    render(<HomePage />);

    const workflow = screen.getByRole("list", { name: /sitemend workflow/i });
    expect(within(workflow).getAllByRole("listitem")).toHaveLength(5);

    for (const step of ["Scan", "Understand", "Fix", "Verify", "Monitor"]) {
      expect(within(workflow).getByRole("heading", { name: step })).toBeInTheDocument();
    }

    expect(screen.getByLabelText(/website address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check this address/i })).toBeInTheDocument();
    expect(screen.getByText(/preview only/i)).toBeInTheDocument();
  });

  it("has no detectable automated accessibility violations", async () => {
    render(<HomePage />);

    const result = await axe.run(document.body, {
      rules: {
        // JSDOM has no layout or canvas, so contrast is verified separately in
        // browser review and by the documented token pairings.
        "color-contrast": { enabled: false },
      },
    });

    expect(result.violations).toEqual([]);
  });
});
