type Environment = Readonly<Record<string, string | undefined>>;

export function isPublicScanUiEnabled(
  environment: Environment = process.env,
): boolean {
  return (
    environment.PUBLIC_SCAN_UI_ENABLED === "true" &&
    environment.SCAN_INTAKE_ENABLED === "true"
  );
}
