import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { HomePage } from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Home", () => {
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
    const expectedLinks = [
      ["How it works", "#how-it-works"],
      ["What we check", "#what-we-check"],
      ["Why SiteMend", "#why-sitemend"],
    ];

    for (const [name, href] of expectedLinks) {
      expect(within(navigation).getByRole("link", { name })).toHaveAttribute("href", href);
      expect(document.querySelector(href)).toBeInTheDocument();
    }

    expect(
      within(screen.getByRole("banner"))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "#top",
      "#how-it-works",
      "#what-we-check",
      "#why-sitemend",
      "#website-check",
    ]);
  });

  it("states the bounded live scope before submission and labels roadmap work", () => {
    render(<HomePage liveScanningEnabled />);

    expect(screen.getByText(/this release checks one public homepage/i)).toHaveTextContent(
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
