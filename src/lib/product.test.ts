import { describe, expect, it } from "vitest";

import { product } from "./product";

describe("product contract", () => {
  it("keeps the product name and action-oriented promise explicit", () => {
    expect(product.name).toBe("SiteMend");
    expect(product.tagline).toContain("Fix");
    expect(product.promise).toContain("next fix");
  });
});
