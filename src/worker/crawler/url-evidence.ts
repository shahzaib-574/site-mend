export interface RedirectEvidence {
  from: string;
  statusCode: number;
  to: string;
}

export function toEvidenceUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

export function isRedirectStatus(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode);
}
