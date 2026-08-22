"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  decodePublicScanError,
  decodePublicScanStatusEnvelope,
  isPublicScanId,
  PUBLIC_SCAN_CLIENT_LIMITS,
  PublicScanClientContractError,
  readBoundedJsonResponse,
  readSafeRetryAfterMilliseconds,
  samePublicScanIdentity,
} from "@/lib/public-scan-client";
import type { PublicScanStatusRecord } from "@/lib/public-scan-contract";

import { PublicScanResults } from "./public-scan-results";

const MAX_POLL_WINDOW_MILLISECONDS = 15 * 60_000;
const MAX_CONSECUTIVE_TRANSIENT_FAILURES = 5;

type RecoverableKind =
  | "invalid-response"
  | "network"
  | "offline"
  | "rate-limited"
  | "timed-out"
  | "unavailable";

type ViewState =
  | Readonly<{ kind: "locating" }>
  | Readonly<{ kind: "invalid-link" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "not-found" }>
  | Readonly<{ kind: "record"; record: PublicScanStatusRecord }>
  | Readonly<{
      automaticChecksStopped: boolean;
      kind: "recoverable";
      lastRecord: PublicScanStatusRecord | null;
      reason: RecoverableKind;
    }>;

class PollDeadlineError extends Error {
  constructor() {
    super("The public scan polling deadline elapsed.");
    this.name = "PollDeadlineError";
  }
}

function createAbortError(): Error {
  const error = new Error("The public scan status request was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isBrowserOffline(): boolean {
  return navigator.onLine === false;
}

function nextPollDelay(requestCount: number): number {
  if (requestCount <= 6) {
    return PUBLIC_SCAN_CLIENT_LIMITS.pollDelayMilliseconds;
  }

  if (requestCount <= 18) return 10_000;
  return 15_000;
}

function canTransition(
  previous: PublicScanStatusRecord | null,
  next: PublicScanStatusRecord,
): boolean {
  if (previous === null) return true;

  if (!samePublicScanIdentity(previous, next)) return false;
  if (previous.status === "completed" || previous.status === "failed") {
    return false;
  }

  return !(previous.status === "running" && next.status === "queued");
}

const RECOVERY_COPY = {
  "invalid-response": {
    body: "SiteMend received a response it could not verify. No untrusted or partial result was shown.",
    title: "This result could not be verified.",
  },
  network: {
    body: "The connection to SiteMend was interrupted. Your website was not changed, and the last trusted scan state is kept below.",
    title: "The status check lost its connection.",
  },
  offline: {
    body: "A new status check needs an internet connection. Your website was not changed, and the last trusted state is still available below.",
    title: "You are offline.",
  },
  "rate-limited": {
    body: "Status checks are being slowed temporarily. Your scan may still be running, and no result has been replaced with a guess.",
    title: "Checking is paused for a moment.",
  },
  "timed-out": {
    body: "SiteMend stopped automatic status checks after a bounded wait. The scan may still finish; you can check again manually.",
    title: "This check is taking longer than expected.",
  },
  unavailable: {
    body: "The scanning service is temporarily unavailable. Your website was not changed, and the last trusted state remains below.",
    title: "Status is temporarily unavailable.",
  },
} as const satisfies Record<RecoverableKind, Readonly<{ body: string; title: string }>>;

function liveMessageForState(state: ViewState): string {
  if (state.kind === "locating") return "Locating the scan link.";
  if (state.kind === "loading") return "Loading scan status.";
  if (state.kind === "invalid-link") {
    return "This scan link is incomplete or invalid. No status request was made.";
  }
  if (state.kind === "not-found") {
    return "This scan was not found or is no longer available.";
  }
  if (state.kind === "recoverable") {
    const message = RECOVERY_COPY[state.reason];
    const stoppedMessage = state.automaticChecksStopped
      ? " Automatic status checks stopped after five consecutive temporary failures."
      : "";
    return `${message.title} ${message.body}${stoppedMessage}`;
  }
  if (state.record.status === "completed") {
    return "The homepage health check is complete.";
  }
  if (state.record.status === "failed") {
    return "This website check could not finish. No partial result is shown.";
  }
  return state.record.status === "queued"
    ? "Your check is waiting for the isolated scanner."
    : "The isolated scanner is checking the homepage.";
}

function ProgressSteps({ status }: Readonly<{ status: "queued" | "running" }>) {
  const steps = [
    { label: "Submitted", state: "complete" },
    {
      label: "Waiting for a safe check",
      state: status === "queued" ? "current" : "complete",
    },
    {
      label: "Checking the homepage",
      state: status === "running" ? "current" : "upcoming",
    },
    { label: "Results ready", state: "upcoming" },
  ] as const;

  return (
    <ol aria-label="Health check progress" className="report-steps">
      {steps.map((step) => (
        <li
          aria-current={step.state === "current" ? "step" : undefined}
          className="report-step"
          data-state={step.state}
          key={step.label}
        >
          <span aria-hidden="true" className="report-step-marker">
            {step.state === "complete" ? "✓" : step.state === "current" ? "•" : "–"}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function RecoveryPanel({
  automaticChecksStopped,
  isRequesting,
  lastRecord,
  onRetry,
  reason,
}: Readonly<{
  automaticChecksStopped: boolean;
  lastRecord: PublicScanStatusRecord | null;
  isRequesting: boolean;
  onRetry: () => void;
  reason: RecoverableKind;
}>) {
  const message = RECOVERY_COPY[reason];

  return (
    <section aria-labelledby="scan-recovery-title" className="soft-panel report-empty">
      <p className="section-kicker">Check paused safely</p>
      <h1 className="report-state-title" id="scan-recovery-title">
        {message.title}
      </h1>
      <p className="report-state-copy">{message.body}</p>
      {automaticChecksStopped ? (
        <p className="report-state-copy mt-4">
          Automatic status checks stopped after five consecutive temporary failures. Check the status manually when you are ready.
        </p>
      ) : null}
      {lastRecord ? (
        <p className="soft-inset mt-5 p-4 text-sm leading-6 text-muted">
          Last trusted state for <strong className="text-ink">{lastRecord.target.hostname}</strong>: {lastRecord.status === "queued" ? "waiting" : "running"}.
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button className="primary-action" disabled={isRequesting} onClick={onRetry} type="button">
          {isRequesting ? "Checking status…" : "Check status again"}
        </button>
        <Link className="secondary-action" href="/#website-check" prefetch={false}>
          Start a new check
        </Link>
      </div>
      <p className="mt-5 text-sm leading-6 text-muted">
        This is a temporary link-access report. Anyone with the link can view it.
      </p>
    </section>
  );
}

export function PublicScanView() {
  const [scanId, setScanId] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>({ kind: "locating" });
  const [isRequesting, setIsRequesting] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const currentScanIdRef = useRef<string | null>(null);
  const fragmentInitializedRef = useRef(false);
  const generationRef = useRef(0);
  const trustedRecordRef = useRef<PublicScanStatusRecord | null>(null);

  useEffect(() => {
    function readFragment() {
      const candidate = window.location.hash.slice(1);
      const nextScanId = isPublicScanId(candidate) ? candidate : null;

      if (
        fragmentInitializedRef.current &&
        nextScanId === currentScanIdRef.current
      ) {
        return;
      }

      fragmentInitializedRef.current = true;
      generationRef.current += 1;
      currentScanIdRef.current = nextScanId;
      const supersededController = activeControllerRef.current;
      activeControllerRef.current = null;
      supersededController?.abort();
      trustedRecordRef.current = null;
      setIsRequesting(false);

      if (nextScanId === null) {
        setScanId(null);
        setState({ kind: "invalid-link" });
        return;
      }

      setScanId(nextScanId);
      setState({ kind: "loading" });
    }

    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, []);

  useEffect(() => {
    if (scanId === null) return;

    const effectGeneration = generationRef.current;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestCount = 0;
    let transientFailures = 0;
    let deadlineReached = false;
    const deadlineAt = performance.now() + MAX_POLL_WINDOW_MILLISECONDS;

    function isCurrentGeneration() {
      return (
        !disposed &&
        generationRef.current === effectGeneration &&
        currentScanIdRef.current === scanId
      );
    }

    function isCurrentRequest(activeController: AbortController) {
      return (
        isCurrentGeneration() &&
        activeControllerRef.current === activeController
      );
    }

    function remainingDeadlineMilliseconds() {
      return Math.max(0, deadlineAt - performance.now());
    }

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function schedule(delay: number) {
      if (!isCurrentGeneration()) return;
      clearTimer();
      const remaining = remainingDeadlineMilliseconds();

      if (remaining <= 0) {
        showRecoverable("timed-out");
        return;
      }

      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, Math.min(delay, remaining));
    }

    function showRecoverable(
      reason: RecoverableKind,
      automaticChecksStopped = false,
    ) {
      if (!isCurrentGeneration()) return;
      clearTimer();
      setState({
        automaticChecksStopped,
        kind: "recoverable",
        lastRecord: trustedRecordRef.current,
        reason,
      });
    }

    function scheduleTransient(reason: RecoverableKind, delay: number) {
      transientFailures += 1;
      const automaticChecksStopped =
        transientFailures >= MAX_CONSECUTIVE_TRANSIENT_FAILURES;
      showRecoverable(reason, automaticChecksStopped);

      if (!automaticChecksStopped) {
        schedule(delay);
      }
    }

    async function awaitBeforeDeadline<T>(
      operation: Promise<T>,
      activeController: AbortController,
    ): Promise<T> {
      const remaining = remainingDeadlineMilliseconds();

      if (remaining <= 0) {
        deadlineReached = true;
        activeController.abort();
        throw new PollDeadlineError();
      }

      let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
      let handleAbort: (() => void) | null = null;
      const interruption = new Promise<never>((_resolve, reject) => {
        handleAbort = () => reject(createAbortError());

        if (activeController.signal.aborted) {
          handleAbort();
          return;
        }

        activeController.signal.addEventListener("abort", handleAbort, {
          once: true,
        });
        deadlineTimer = setTimeout(() => {
          deadlineReached = true;
          activeController.abort();
          reject(new PollDeadlineError());
        }, remaining);
      });

      try {
        return await Promise.race([operation, interruption]);
      } finally {
        if (deadlineTimer !== null) clearTimeout(deadlineTimer);
        if (handleAbort !== null) {
          activeController.signal.removeEventListener("abort", handleAbort);
        }
      }
    }

    async function poll() {
      if (!isCurrentGeneration() || activeControllerRef.current !== null) return;

      if (remainingDeadlineMilliseconds() <= 0) {
        showRecoverable("timed-out");
        return;
      }

      if (isBrowserOffline()) {
        setIsRequesting(false);
        showRecoverable("offline");
        return;
      }

      if (document.visibilityState === "hidden") {
        setIsRequesting(false);
        return;
      }

      const activeController = new AbortController();
      activeControllerRef.current = activeController;
      setIsRequesting(true);
      requestCount += 1;

      try {
        const response = await awaitBeforeDeadline(
          fetch("/api/scans/status", {
            cache: "no-store",
            credentials: "omit",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${scanId}`,
            },
            method: "GET",
            redirect: "error",
            referrerPolicy: "no-referrer",
            signal: activeController.signal,
          }),
          activeController,
        );

        if (!isCurrentRequest(activeController)) return;

        if (response.status === 200) {
          const responseBody = await awaitBeforeDeadline(
            readBoundedJsonResponse(response),
            activeController,
          );
          if (!isCurrentRequest(activeController)) return;
          const envelope = decodePublicScanStatusEnvelope(responseBody);
          const nextRecord = envelope.data;

          if (
            nextRecord.scanId !== scanId ||
            !canTransition(trustedRecordRef.current, nextRecord)
          ) {
            throw new PublicScanClientContractError();
          }

          transientFailures = 0;
          trustedRecordRef.current = nextRecord;
          setState({ kind: "record", record: nextRecord });

          if (nextRecord.status === "queued" || nextRecord.status === "running") {
            schedule(nextPollDelay(requestCount));
          }
          return;
        }

        if (response.status === 404) {
          const responseBody = await awaitBeforeDeadline(
            readBoundedJsonResponse(response, 16_384),
            activeController,
          );
          if (!isCurrentRequest(activeController)) return;
          const error = decodePublicScanError(responseBody);
          if (error.code !== "SCAN_NOT_FOUND") {
            throw new PublicScanClientContractError();
          }
          trustedRecordRef.current = null;
          setState({ kind: "not-found" });
          return;
        }

        if (response.status === 429 || response.status === 503) {
          const retryAfter = readSafeRetryAfterMilliseconds(
            response.headers.get("retry-after"),
            nextPollDelay(requestCount),
          );
          const responseBody = await awaitBeforeDeadline(
            readBoundedJsonResponse(response, 16_384),
            activeController,
          );
          if (!isCurrentRequest(activeController)) return;
          const error = decodePublicScanError(responseBody);
          const expectedCode =
            response.status === 429 ? "RATE_LIMITED" : "SCANNING_UNAVAILABLE";

          if (error.code !== expectedCode) {
            throw new PublicScanClientContractError();
          }

          scheduleTransient(
            response.status === 429 ? "rate-limited" : "unavailable",
            retryAfter,
          );
          return;
        }

        void response.body?.cancel().catch(() => undefined);
        throw new PublicScanClientContractError();
      } catch (error) {
        if (!isCurrentGeneration()) return;

        if (
          deadlineReached ||
          error instanceof PollDeadlineError ||
          remainingDeadlineMilliseconds() <= 0
        ) {
          showRecoverable("timed-out");
          return;
        }

        if (isAbortError(error)) return;

        if (error instanceof PublicScanClientContractError) {
          showRecoverable("invalid-response");
          return;
        }

        scheduleTransient(
          isBrowserOffline() ? "offline" : "network",
          nextPollDelay(requestCount + transientFailures),
        );
      } finally {
        if (activeControllerRef.current === activeController) {
          activeControllerRef.current = null;
        }
        if (isCurrentGeneration()) setIsRequesting(false);
      }
    }

    function pauseForEnvironment() {
      clearTimer();
      activeAbort();

      if (isBrowserOffline()) showRecoverable("offline");
    }

    function resumeForEnvironment() {
      if (document.visibilityState !== "hidden" && !isBrowserOffline()) {
        schedule(0);
      }
    }

    function activeAbort() {
      const activeController = activeControllerRef.current;
      activeControllerRef.current = null;
      activeController?.abort();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        pauseForEnvironment();
      } else {
        resumeForEnvironment();
      }
    }

    window.addEventListener("offline", pauseForEnvironment);
    window.addEventListener("online", resumeForEnvironment);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // A zero-delay timer prevents React Strict Mode's development-only probe
    // mount from consuming a duplicate status request.
    schedule(0);

    return () => {
      disposed = true;
      clearTimer();
      activeAbort();
      window.removeEventListener("offline", pauseForEnvironment);
      window.removeEventListener("online", resumeForEnvironment);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [retryVersion, scanId]);

  function retry() {
    if (isRequesting) return;
    setIsRequesting(true);
    setRetryVersion((value) => value + 1);
  }

  const content = (() => {
    if (state.kind === "locating" || state.kind === "loading") {
      return (
      <section aria-busy="true" aria-labelledby="scan-loading-title" className="soft-panel report-empty">
        <p className="section-kicker">Finding your check</p>
        <h1 className="report-state-title" id="scan-loading-title">
          Loading the latest trusted status.
        </h1>
        <progress aria-label="Loading scan status" className="report-progress mt-6" />
        <noscript>
          <p className="report-state-copy mt-5">
            JavaScript is required to read this temporary report link. No status request was made from this page, and the scan may still be running.
          </p>
          <Link className="secondary-action mt-4" href="/#website-check" prefetch={false}>
            Return home to start a new check
          </Link>
        </noscript>
      </section>
      );
    }

    if (state.kind === "invalid-link") {
      return (
      <section aria-labelledby="scan-invalid-title" className="soft-panel report-empty">
        <p className="section-kicker">Temporary link-access report</p>
        <h1 className="report-state-title" id="scan-invalid-title">
          This scan link is incomplete or invalid.
        </h1>
        <p className="report-state-copy">
          No status request was made. Start a new check to create a fresh temporary link-access report.
        </p>
        <Link className="primary-action mt-6" href="/#website-check" prefetch={false}>
          Start a new check
        </Link>
      </section>
      );
    }

    if (state.kind === "not-found") {
      return (
      <section aria-labelledby="scan-missing-title" className="soft-panel report-empty">
        <p className="section-kicker">Report unavailable</p>
        <h1 className="report-state-title" id="scan-missing-title">
          This scan was not found or is no longer available.
        </h1>
        <p className="report-state-copy">
          This temporary link-access report is unavailable. Start a new check to collect current evidence.
        </p>
        <p className="mt-5 text-sm leading-6 text-muted">
          Anyone with a working report link can view it.
        </p>
        <Link className="primary-action mt-6" href="/#website-check" prefetch={false}>
          Start a new check
        </Link>
      </section>
      );
    }

    if (state.kind === "recoverable") {
      return (
      <RecoveryPanel
        automaticChecksStopped={state.automaticChecksStopped}
        isRequesting={isRequesting}
        lastRecord={state.lastRecord}
        onRetry={retry}
        reason={state.reason}
      />
      );
    }

    const { record } = state;

    if (record.status === "completed") {
      return (
      <>
        <p className="soft-inset mb-6 p-4 text-sm leading-6 text-muted">
          This is a temporary link-access report. Anyone with the link can view it.
        </p>
        <PublicScanResults record={record} />
      </>
      );
    }

    if (record.status === "failed") {
      return (
      <section aria-labelledby="scan-failed-title" className="soft-panel report-empty">
        <p className="section-kicker">Check ended safely</p>
        <h1 className="report-state-title" id="scan-failed-title">
          This website check could not finish.
        </h1>
        <p className="report-state-copy">
          SiteMend does not expose internal failure details or show partial evidence as a result. Your website was not changed.
        </p>
        <p className="mt-5 text-sm leading-6 text-muted">
          This is a temporary link-access report. Anyone with the link can view it.
        </p>
        <Link className="primary-action mt-6" href="/#website-check" prefetch={false}>
          Start a new check
        </Link>
      </section>
      );
    }

    const runningMessage =
      record.status === "queued"
        ? "Your check is waiting for the isolated scanner."
        : "The isolated scanner is checking the homepage.";

    return (
    <section
      aria-busy={isRequesting || undefined}
      aria-labelledby="scan-progress-title"
      className="soft-panel report-progress-panel"
    >
      <p className="section-kicker">Homepage health check</p>
      <h1 className="report-state-title" id="scan-progress-title">
        Checking {record.target.hostname}
      </h1>
      <p className="report-state-copy">{runningMessage}</p>
      <progress aria-label="Website health check in progress" className="report-progress mt-6" />
      <ProgressSteps status={record.status} />
      <p className="mt-6 text-sm leading-6 text-muted">
        You can leave this tab and return with this temporary report link. Anyone with the link can view it. SiteMend shows a result only after it can verify the complete response.
      </p>
    </section>
    );
  })();

  return (
    <>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {liveMessageForState(state)}
      </p>
      {content}
    </>
  );
}
