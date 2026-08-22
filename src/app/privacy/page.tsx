import type { Metadata } from "next";

import {
  InformationCallout,
  InformationPage,
  InformationSection,
} from "@/components/information-page";
import { createPublicPageMetadata } from "@/lib/public-page-metadata";
import { readSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return createPublicPageMetadata({
    description:
      "Understand the minimal website, edge, queue, browser, and temporary-result data used by SiteMend's anonymous homepage check.",
    path: "/privacy",
    title: "SiteMend Privacy",
  });
}

export default function PrivacyPage() {
  const release = readSiteConfig();

  return (
    <InformationPage
      eyebrow="Privacy"
      introduction="SiteMend minimizes submitted data, keeps public scan results temporary, and does not currently use accounts, advertising, or analytics."
      title="A small data footprint for a small, focused scan."
    >
      <InformationSection title="Operator and privacy questions">
        {release.ready ? (
          <p>
            This deployment is operated by <strong>{release.operatorName}</strong>.
            Send privacy questions to{" "}
            <a href={`mailto:${release.contactEmail}`}>{release.contactEmail}</a>.
            The operator has declared <strong>{release.legalJurisdiction}</strong>{" "}
            as this deployment&apos;s legal jurisdiction.
          </p>
        ) : (
          <p>
            No production operator, privacy email, or legal jurisdiction has been
            confirmed for this open-source preview. Until the complete release
            identity is configured, the deployment fails closed for indexing and
            must not be represented as a commercial production service.
          </p>
        )}
      </InformationSection>

      <InformationSection title="What is submitted">
        <p>
          Before a scan request leaves the browser, SiteMend normalizes the website
          address to its public HTTP or HTTPS origin. Only that origin is submitted.
          A path, query, fragment, username, password, cookie, browser credential,
          and custom port are not retained as part of the submitted target.
        </p>
        <p>
          The scan queue receives a generated scan ID, request time, normalized
          public origin, and hostname. It does not receive the client IP, an IP
          digest, or the removed path, query, and fragment.
        </p>
      </InformationSection>

      <InformationSection title="Edge processing and abuse controls">
        <p>
          A trusted edge supplies the application with one canonical client IP so
          requests can be rate-limited and abusive traffic can be rejected. The
          application converts client and destination identities into keyed HMAC
          digests before using them as Redis rate-limit keys. Raw IP addresses and
          hostnames are not Redis key material, and the client identity is not
          placed in the scan job.
        </p>
        <p>
          Hosting infrastructure can produce operational and security logs. Scan
          authorization headers must be redacted from those logs and from tracing,
          error reporting, and support captures because a bearer grants result
          access.
        </p>
      </InformationSection>

      <InformationSection title="Crawl evidence and public results">
        <p>
          The worker performs a bounded, read-only homepage crawl and retains only
          capped internal transport and structured evidence needed for the nine
          checks. It does not publish raw HTML, response bodies, cookies, response
          header blocks, body hashes, stack traces, or worker failure details.
          Allowlisted normalized signals such as indexing directives can appear as
          finding evidence without exposing the raw transport headers.
        </p>
        <p>
          Queued, running, and failed status responses contain metadata only. A
          completed response can add the allowlisted nine-check report, including
          bounded evidence for failed checks. SiteMend publishes no health score.
        </p>
      </InformationSection>

      <InformationSection title="Browser storage and bearer-link access">
        <p>
          After a successful submission, the browser can keep only the normalized
          origin in sessionStorage so the Back button can restore the address. The
          original path, query, and fragment are not stored there. Browser controls
          can clear this per-tab session data.
        </p>
        <p>
          The result page keeps the scan ID in the URL fragment and sends it to a
          fixed status endpoint as a bearer authorization header. It is a capability,
          not an account login: anyone with the complete bearer link can read the
          temporary scan metadata and completed report until the queue removes it.
          Do not share it.
        </p>
      </InformationSection>

      <InformationSection title="Retention targets, not exact expiry times">
        <p>
          Completed records target removal after one day or when the completed-job
          count limit is reached. Failed records target removal after seven days or
          when their count limit is reached. BullMQ performs this cleanup lazily when
          later jobs finish, so these are not hard maximum time-to-live guarantees:
          an active queue can remove a record earlier by count, while an idle queue
          can retain it beyond the target age.
        </p>
      </InformationSection>

      <InformationSection title="Accounts, ads, analytics, and policy changes">
        <p>
          The current public check has no account sign-in or durable project-history
          store, and SiteMend currently loads no ads, analytics, tracking pixels, or
          remote report images. Operational security controls are not advertising or
          product analytics.
        </p>
        <InformationCallout label="Future policy changes">
          Before advertising or analytics is introduced, SiteMend will update this
          policy, add any legally required consent controls, and explain the providers,
          purposes, data, choices, and retention before those tools are enabled.
        </InformationCallout>
      </InformationSection>

      <p className="information-updated">
        Last updated: <time dateTime="2026-08-22">22 August 2026</time>
      </p>
    </InformationPage>
  );
}
