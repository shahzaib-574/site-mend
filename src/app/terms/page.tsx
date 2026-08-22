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
      "Read the acceptable-use, temporary-result, limitation, and open-source terms for SiteMend's public homepage health check.",
    path: "/terms",
    title: "SiteMend Terms",
  });
}

export default function TermsPage() {
  const release = readSiteConfig();

  return (
    <InformationPage
      eyebrow="Terms"
      introduction="These plain-language terms describe the current anonymous, read-only SiteMend homepage check and its open-source project boundary."
      title="Use SiteMend responsibly and verify every result."
    >
      <InformationSection title="Authorized public-site use">
        <p>
          Submit only a public website that you own, manage, or have permission to
          assess. SiteMend is not permission to test somebody else&apos;s systems, and
          a publicly reachable address does not by itself prove authorization.
        </p>
        <p>
          The current scanner makes a bounded, read-only homepage request, follows
          only safely admitted redirects, and respects robots.txt for SiteMendBot.
          It does not log in, crawl private content, or make automatic changes to
          the submitted website.
        </p>
      </InformationSection>

      <InformationSection title="Acceptable use">
        <p>Do not use SiteMend to:</p>
        <ul className="information-list">
          <li>target private, local, internal, or cloud-metadata addresses;</li>
          <li>bypass robots rules, rate limits, access controls, or safety checks;</li>
          <li>
            run excessive automated requests, disrupt service, probe networks, or
            attempt to access data that does not belong to you;
          </li>
          <li>submit credentials, secrets, personal data, or sensitive bearer links;</li>
          <li>support unlawful, deceptive, abusive, or harmful activity.</li>
        </ul>
        <p>
          Access can be limited or disabled to protect people, websites, and the
          service from suspected abuse or operational risk.
        </p>
      </InformationSection>

      <InformationSection title="Temporary results and no automatic action">
        <p>
          Anonymous results are temporary bearer-access records, not a durable
          project archive. They can disappear because of age- or count-based queue
          cleanup, service changes, failure recovery, or shutdown. Keep your own
          notes if a finding matters, but never publish the bearer link.
        </p>
        <p>
          SiteMend suggests fixes; it does not edit, deploy, or otherwise change a
          website. You remain responsible for reviewing, testing, approving, and
          safely releasing every change.
        </p>
      </InformationSection>

      <InformationSection title="No guarantee of outcomes">
        <p>
          Results are evidence from a bounded point-in-time check and can be
          incomplete, unavailable, or wrong. SiteMend does not guarantee traffic,
          rankings, indexing, Core Web Vitals, conversions, accessibility, security,
          AI mentions, answers, or citations. It is not a substitute for professional
          technical, security, legal, accessibility, or marketing advice.
        </p>
        <InformationCallout label="Verification reminder">
          Verify important findings independently and test every proposed fix in an
          appropriate environment before publishing it.
        </InformationCallout>
      </InformationSection>

      <InformationSection title="Open-source code and hosted service">
        <p>
          The SiteMend source code is available under the repository&apos;s MIT License.
          That software license governs copying, modifying, and distributing the
          code; these terms govern use of a hosted SiteMend service. An open-source
          license does not promise that a particular hosted deployment will remain
          available or keep results.
        </p>
        {release.ready ? (
          <p>
            This deployment is operated by <strong>{release.operatorName}</strong>.
            Contact <a href={`mailto:${release.contactEmail}`}>{release.contactEmail}</a>{" "}
            about the hosted service. The operator has declared{" "}
            <strong>{release.legalJurisdiction}</strong> as this deployment&apos;s legal
            jurisdiction; this statement does not remove rights that applicable
            law gives a user.
          </p>
        ) : (
          <p>
            The project has not published a commercial service operator or governing
            jurisdiction, so this page does not invent either. Accurate operator,
            contact, consumer-rights, and jurisdiction details must be added before a
            commercial launch where they are required.
          </p>
        )}
      </InformationSection>

      <p className="information-updated">
        Last updated: <time dateTime="2026-08-22">22 August 2026</time>
      </p>
    </InformationPage>
  );
}
