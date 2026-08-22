import { afterEach, describe, expect, it, vi } from "vitest";

import { isPublicScanUiEnabled } from "./public-scan-ui-config";

describe("isPublicScanUiEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [true, "true", "true"],
    [false, "true", "false"],
    [false, "false", "true"],
    [false, "false", "false"],
  ] as const)(
    "returns %s when the UI gate is %s and intake is %s",
    (expected, publicScanUiEnabled, scanIntakeEnabled) => {
      expect(
        isPublicScanUiEnabled({
          PUBLIC_SCAN_UI_ENABLED: publicScanUiEnabled,
          SCAN_INTAKE_ENABLED: scanIntakeEnabled,
        }),
      ).toBe(expected);
    },
  );

  it.each([
    ["both values are missing", {}],
    ["the intake gate is missing", { PUBLIC_SCAN_UI_ENABLED: "true" }],
    ["the UI gate is missing", { SCAN_INTAKE_ENABLED: "true" }],
    [
      "the UI gate is empty",
      { PUBLIC_SCAN_UI_ENABLED: "", SCAN_INTAKE_ENABLED: "true" },
    ],
    [
      "the intake gate is empty",
      { PUBLIC_SCAN_UI_ENABLED: "true", SCAN_INTAKE_ENABLED: "" },
    ],
    [
      "the UI gate has different casing",
      {
        PUBLIC_SCAN_UI_ENABLED: "TRUE",
        SCAN_INTAKE_ENABLED: "true",
      },
    ],
    [
      "the intake gate has different casing",
      {
        PUBLIC_SCAN_UI_ENABLED: "true",
        SCAN_INTAKE_ENABLED: "TRUE",
      },
    ],
    [
      "the UI gate has surrounding whitespace",
      {
        PUBLIC_SCAN_UI_ENABLED: " true ",
        SCAN_INTAKE_ENABLED: "true",
      },
    ],
    [
      "the intake gate has surrounding whitespace",
      {
        PUBLIC_SCAN_UI_ENABLED: "true",
        SCAN_INTAKE_ENABLED: " true ",
      },
    ],
    [
      "the UI gate uses another truthy-looking value",
      {
        PUBLIC_SCAN_UI_ENABLED: "1",
        SCAN_INTAKE_ENABLED: "true",
      },
    ],
    [
      "the intake gate uses another truthy-looking value",
      {
        PUBLIC_SCAN_UI_ENABLED: "true",
        SCAN_INTAKE_ENABLED: "1",
      },
    ],
  ] as const)("fails closed when %s", (_description, environment) => {
    expect(isPublicScanUiEnabled(environment)).toBe(false);
  });

  it("defaults to the current process environment", () => {
    vi.stubEnv("PUBLIC_SCAN_UI_ENABLED", "true");
    vi.stubEnv("SCAN_INTAKE_ENABLED", "true");

    expect(isPublicScanUiEnabled()).toBe(true);
  });

  it("fails closed by default when either process value is not exactly true", () => {
    vi.stubEnv("PUBLIC_SCAN_UI_ENABLED", "true");
    vi.stubEnv("SCAN_INTAKE_ENABLED", "false");

    expect(isPublicScanUiEnabled()).toBe(false);
  });
});
