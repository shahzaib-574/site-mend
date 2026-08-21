export type ScanAdmissionErrorCode =
  | "INVALID_TARGET"
  | "DNS_LOOKUP_FAILED"
  | "DNS_LOOKUP_TIMEOUT"
  | "NO_DNS_ANSWERS"
  | "TOO_MANY_DNS_ANSWERS"
  | "INVALID_DNS_ANSWER"
  | "NON_PUBLIC_ADDRESS";

export class ScanAdmissionError extends Error {
  readonly code: ScanAdmissionErrorCode;

  constructor(code: ScanAdmissionErrorCode, message: string) {
    super(message);
    this.name = "ScanAdmissionError";
    this.code = code;
  }
}
