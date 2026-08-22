"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  decodeCreateScanEnvelope,
  decodePublicScanError,
  PublicScanClientContractError,
  readBoundedJsonResponse,
  type PublicScanErrorCode,
} from "@/lib/public-scan-client";
import {
  normalizeWebsiteUrl,
  type WebsiteUrlResult,
} from "@/lib/website-url";

const LAST_NORMALIZED_ORIGIN_KEY = "sitemend:last-normalized-origin:v1";
const CREATE_SCAN_REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const subscribeToHydration = () => () => undefined;
const readHydratedSnapshot = () => true;
const readServerSnapshot = () => false;

type CommonScanEntryFormProps = Readonly<{
  liveScanningEnabled?: boolean;
  navigateToDocument?: (target: string) => void;
}>;

type ScanEntryFormProps = CommonScanEntryFormProps &
  Readonly<
    | { mode?: "start" }
    | {
        initialOrigin: string;
        mode: "rescan";
        previousScanId: string;
      }
  >;

export function hardNavigateToDocument(
  target: string,
  location: Pick<Location, "assign"> = window.location,
): void {
  location.assign(target);
}

const healthAreas = [
  "Search visibility",
  "Speed and experience",
  "Technical health",
  "Content structure",
  "AI readiness",
];

const createErrorCodesByStatus = new Map<
  number,
  ReadonlySet<PublicScanErrorCode>
>([
  [400, new Set(["INVALID_REQUEST", "INVALID_TARGET", "NON_PUBLIC_ADDRESS"])],
  [413, new Set(["PAYLOAD_TOO_LARGE"])],
  [415, new Set(["UNSUPPORTED_MEDIA_TYPE"])],
  [
    422,
    new Set([
      "DNS_LOOKUP_FAILED",
      "DNS_LOOKUP_TIMEOUT",
      "INVALID_DNS_ANSWER",
      "NO_DNS_ANSWERS",
      "TOO_MANY_DNS_ANSWERS",
    ]),
  ],
  [429, new Set(["RATE_LIMITED"])],
  [503, new Set(["SCANNING_UNAVAILABLE"])],
]);

async function readCreateError(response: Response) {
  const error = decodePublicScanError(
    await readBoundedJsonResponse(response, 16_384),
  );

  if (!createErrorCodesByStatus.get(response.status)?.has(error.code)) {
    throw new PublicScanClientContractError();
  }

  return error;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function ScanEntryForm(props: ScanEntryFormProps) {
  const {
    liveScanningEnabled = false,
    navigateToDocument = hardNavigateToDocument,
  } = props;
  const isRescan = props.mode === "rescan";
  let trustedInitialOrigin: string | null = null;

  if (props.mode === "rescan") {
    const normalizedInitialOrigin = normalizeWebsiteUrl(props.initialOrigin);

    if (
      normalizedInitialOrigin.ok &&
      normalizedInitialOrigin.url === props.initialOrigin
    ) {
      trustedInitialOrigin = normalizedInitialOrigin.url;
    }
  }
  const hasTrustedRescanIdentity = !isRescan || trustedInitialOrigin !== null;
  const fieldId = isRescan ? "report-website" : "website";
  const [value, setValue] = useState(() => trustedInitialOrigin ?? "");
  const [result, setResult] = useState<WebsiteUrlResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    readHydratedSnapshot,
    readServerSnapshot,
  );
  const submittingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!liveScanningEnabled || isRescan) return;

    let cancelled = false;
    let restoredOrigin: string | null = null;

    try {
      const stored = window.sessionStorage.getItem(LAST_NORMALIZED_ORIGIN_KEY);
      if (stored) {
        const normalized = normalizeWebsiteUrl(stored);
        if (normalized.ok && normalized.url === stored) {
          restoredOrigin = normalized.url;
        } else {
          window.sessionStorage.removeItem(LAST_NORMALIZED_ORIGIN_KEY);
        }
      }
    } catch {
      // Storage can be unavailable in private or hardened browsing modes. Back
      // restoration is helpful, but never required to start a scan.
    }

    if (restoredOrigin) {
      queueMicrotask(() => {
        if (!cancelled) setValue(restoredOrigin);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isRescan, liveScanningEnabled]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) return;

    const normalized = normalizeWebsiteUrl(value);
    setResult(normalized);
    setSubmissionError(null);

    if (
      !normalized.ok ||
      !liveScanningEnabled ||
      !hasTrustedRescanIdentity
    ) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    let requestTimedOut = false;
    const timeout = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, CREATE_SCAN_REQUEST_TIMEOUT_MILLISECONDS);

    try {
      const response = await fetch("/api/scans", {
        body: JSON.stringify({ url: normalized.url }),
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });

      if (response.status !== 202) {
        const publicError = await readCreateError(response);
        setSubmissionError(publicError.message);
        return;
      }

      const envelope = decodeCreateScanEnvelope(
        await readBoundedJsonResponse(response),
      );

      if (
        envelope.data.target.hostname !== normalized.hostname ||
        envelope.data.target.origin !== normalized.url ||
        (isRescan && envelope.data.scanId === props.previousScanId)
      ) {
        throw new Error("The submitted scan identity changed.");
      }

      setValue(normalized.url);
      setResult(null);

      try {
        window.sessionStorage.setItem(
          LAST_NORMALIZED_ORIGIN_KEY,
          normalized.url,
        );
      } catch {
        // Navigation still works when storage is blocked.
      }

      navigateToDocument(`/scan#${envelope.data.scanId}`);
    } catch (error) {
      if (isAbortError(error)) {
        if (requestTimedOut) {
          setSubmissionError(
            "SiteMend did not receive a response in time. The check may still have been queued; wait before trying again.",
          );
        }

        return;
      }

      setSubmissionError(
        error instanceof TypeError
          ? "SiteMend could not reach the scanning service. The request outcome is unknown; check your connection before trying again."
          : "SiteMend received an unreadable scan response. No result was opened; wait before trying again.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const error = result && !result.ok ? result.message : undefined;
  const accepted = !liveScanningEnabled && result?.ok ? result : undefined;
  const rescanIdentityError =
    isRescan && !hasTrustedRescanIdentity
      ? "SiteMend could not verify this report’s website identity. Return home to start a new check."
      : null;
  const descriptionId = error
    ? `${fieldId}-error`
    : submissionError
      ? `${fieldId}-submission-error`
      : rescanIdentityError
        ? `${fieldId}-identity-error`
        : `${fieldId}-help`;
  const submitLabel = !isHydrated
    ? "Preparing secure check…"
    : isSubmitting
      ? isRescan
        ? "Starting another check…"
        : "Starting health check…"
      : isRescan
        ? "Check this website again"
      : liveScanningEnabled
        ? "Start health check"
        : "Check this address";

  return (
    <div className="scan-shell">
      <form
        action="/api/scans"
        aria-busy={!isHydrated || isSubmitting}
        method="post"
        onSubmit={handleSubmit}
        noValidate
      >
        <label
          className="mb-2 block px-1 text-sm font-bold text-ink"
          htmlFor={fieldId}
        >
          {isRescan ? "Website to check again" : "Your website address"}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <input
              aria-describedby={descriptionId}
              aria-invalid={Boolean(error)}
              autoCapitalize="none"
              autoComplete="url"
              className="website-field"
              disabled={
                !isHydrated || isSubmitting || !hasTrustedRescanIdentity
              }
              id={fieldId}
              inputMode="url"
              name="website"
              onChange={(event) => {
                setValue(event.target.value);
                if (result) setResult(null);
                if (submissionError) setSubmissionError(null);
              }}
              placeholder="example.com"
              spellCheck={false}
              type="text"
              value={value}
            />
          </div>
          <button
            className="primary-action scan-submit group"
            disabled={
              !isHydrated || isSubmitting || !hasTrustedRescanIdentity
            }
            type="submit"
          >
            {submitLabel}
            <span aria-hidden="true" className="action-arrow">
              →
            </span>
          </button>
        </div>

        {error ? (
          <p
            className="mt-3 px-1 text-sm font-bold text-danger"
            id={`${fieldId}-error`}
            role="alert"
          >
            {error}
          </p>
        ) : submissionError ? (
          <p
            className="mt-3 px-1 text-sm font-bold text-danger"
            id={`${fieldId}-submission-error`}
            role="alert"
          >
            {submissionError}
          </p>
        ) : rescanIdentityError ? (
          <p
            className="mt-3 px-1 text-sm font-bold text-danger"
            id={`${fieldId}-identity-error`}
            role="alert"
          >
            {rescanIdentityError}
          </p>
        ) : (
          <p className="mt-3 px-1 text-sm text-muted" id={`${fieldId}-help`}>
            {isRescan
              ? "Reruns the same nine public-homepage checks and opens a new temporary report. Speed, multi-page crawling, AEO, and GEO remain outside this release."
              : liveScanningEnabled
                ? "Enter a public domain. Only its public origin is submitted."
                : "Enter a public domain. This step checks the address only."}
          </p>
        )}
        <noscript>
          <p className="mt-3 px-1 text-sm font-bold text-danger">
            JavaScript is required so SiteMend can remove paths, queries, and
            fragments before submitting a public origin. No address was sent.
          </p>
        </noscript>
      </form>

      {accepted ? (
        <section
          aria-labelledby="website-ready-title"
          aria-live="polite"
          className="form-status mt-4"
          role="status"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 border-success bg-success text-sm font-black text-white"
            >
              ✓
            </span>
            <div className="min-w-0">
              <h2 className="font-extrabold text-ink" id="website-ready-title">
                Address confirmed for{" "}
                <span className="user-address">{accepted.hostname}</span>
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                SiteMend would begin at{" "}
                <span className="user-address font-mono">{accepted.url}</span>. This
                preview validates the target without fetching the site or starting
                a live audit.
              </p>
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Planned health areas">
            {healthAreas.map((area) => (
              <li
                className="rounded-full border border-accent/40 bg-surface px-3 py-1.5 text-xs font-bold text-accent-strong"
                key={area}
              >
                {area}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
