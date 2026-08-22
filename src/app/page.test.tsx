import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("exposes a complete landmark and heading structure", () => {
    render(<Home />);

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
    render(<Home />);

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
  });

  it("presents the full product loop and the honest address action", () => {
    render(<Home />);

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
    render(<Home />);

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
