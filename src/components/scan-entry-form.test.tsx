import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ScanEntryForm } from "./scan-entry-form";

describe("ScanEntryForm", () => {
  it("accepts a bare public domain and explains that no live scan ran", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    await user.type(screen.getByLabelText(/website address/i), "Example.com/about");
    await user.click(screen.getByRole("button", { name: /check my website/i }));

    expect(
      screen.getByRole("heading", { name: /example.com is ready/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/example.com\//i)).toBeInTheDocument();
    expect(screen.getByText(/without starting a live scan/i)).toBeInTheDocument();
  });

  it("announces an invalid local address and keeps the input value", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.type(input, "http://localhost");
    await user.click(screen.getByRole("button", { name: /check my website/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/public domain/i);
    expect(input).toHaveValue("http://localhost");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("clears an error when the user edits the address", async () => {
    const user = userEvent.setup();
    render(<ScanEntryForm />);

    const input = screen.getByLabelText(/website address/i);
    await user.click(screen.getByRole("button", { name: /check my website/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(input, "example.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
