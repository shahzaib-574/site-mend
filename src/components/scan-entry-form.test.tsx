import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ScanEntryForm } from "./scan-entry-form";

describe("ScanEntryForm", () => {
  it("accepts a bare public domain and explains that no live scan ran", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    await user.type(screen.getByLabelText(/website address/i), "Example.com/about");
    await user.click(screen.getByRole("button", { name: /check this address/i }));

    expect(
      screen.getByRole("heading", { name: /address confirmed for example.com/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/example.com\//i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/without fetching the site/i);
  });

  it("announces an invalid local address and keeps the input value", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.type(input, "http://localhost");
    await user.click(screen.getByRole("button", { name: /check this address/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/public domain/i);
    expect(input).toHaveValue("http://localhost");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("clears an error when the user edits the address", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.click(screen.getByRole("button", { name: /check this address/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(input, "example.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("supports keyboard submission and exposes the result as a polite status", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.type(input, "example.com{Enter}");

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAccessibleName(/address confirmed for example.com/i);
    expect(input).toHaveAttribute("aria-describedby", "website-help");
  });

  it("allows long accepted hostnames and URLs to wrap inside the status", async () => {
    const user = userEvent.setup();
    const hostname = `${"a".repeat(63)}.example.com`;
    render(<ScanEntryForm />);

    await user.type(screen.getByLabelText(/website address/i), hostname);
    await user.click(screen.getByRole("button", { name: /check this address/i }));

    for (const address of screen.getAllByText(new RegExp(hostname, "i"))) {
      expect(address).toHaveClass("user-address");
    }
  });
});
