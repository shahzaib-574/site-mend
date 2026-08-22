import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { ScanPageShell } from "./page";

describe("ScanPageShell", () => {
  it("fails closed with a truthful route and no status request", () => {
    render(<ScanPageShell liveScanningEnabled={false} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /public scanning is not available/i,
    );
    expect(screen.getByText(/no website request was made/i)).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("link", { name: "New check" })).toHaveAttribute(
      "href",
      "/#website-check",
    );
  });

  it("has no detectable automated accessibility violations when disabled", async () => {
    render(<ScanPageShell liveScanningEnabled={false} />);

    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
