import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server.node";
import { describe, expect, it, vi } from "vitest";

import ErrorPage from "./error";
import GlobalError from "./global-error";
import NotFound, { metadata as notFoundMetadata } from "./not-found";

describe("public error states", () => {
  it("renders a class-based, noindex 404 with a hard return boundary", async () => {
    const { container } = render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /does not match a SiteMend page/i,
    );
    expect(screen.getByRole("link", { name: /return home/i })).toHaveAttribute(
      "data-navigation",
      "new-document",
    );
    expect(container.querySelector("[style]")).toBeNull();
    expect(notFoundMetadata.robots).toMatchObject({
      follow: false,
      index: false,
      noarchive: true,
    });

    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("offers an accessible retry without exposing error details", async () => {
    const reset = vi.fn();
    const privateMessage = "redis-password-do-not-render";
    const { container } = render(
      <ErrorPage error={new Error(privateMessage)} reset={reset} />,
    );

    screen.getByRole("button", { name: /try again/i }).click();
    expect(reset).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveTextContent(privateMessage);
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.querySelector('a[href^="http"]')).toBeNull();

    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("keeps the root fallback generic, class-based, and third-party free", () => {
    const privateMessage = "worker-stack-do-not-render";
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error(privateMessage)} reset={() => undefined} />,
    );

    expect(markup).toContain("SiteMend could not load this view.");
    expect(markup).toContain("<title>SiteMend unavailable</title>");
    expect(markup).toContain('data-navigation="new-document"');
    expect(markup).not.toContain("style=");
    expect(markup).not.toContain(privateMessage);
    expect(markup).not.toMatch(
      /adsbygoogle|doubleclick|google-analytics|googlesyndication|googletagmanager/i,
    );
  });
});
