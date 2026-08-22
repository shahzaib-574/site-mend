import type { Metadata } from "next";

import {
  InformationCallout,
  InformationPage,
  InformationSection,
} from "@/components/information-page";
import { createPublicPageMetadata } from "@/lib/public-page-metadata";
import { readSiteConfig } from "@/lib/site-config";

const issuesUrl = "https://github.com/shahzaib-574/site-mend/issues";
const securityPolicyUrl =
  "https://github.com/shahzaib-574/site-mend/blob/main/SECURITY.md";
const privateAdvisoryUrl =
  "https://github.com/shahzaib-574/site-mend/security/advisories/new";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return createPublicPageMetadata({
    description:
      "Find the correct SiteMend support route for product questions, bug reports, and private security disclosures.",
    path: "/contact",
    title: "Contact SiteMend",
  });
}

export default function ContactPage() {
  const release = readSiteConfig();

  return (
    <InformationPage
      eyebrow="Contact"
      introduction="SiteMend uses public GitHub Issues for ordinary support and GitHub's private security flow for suspected vulnerabilities."
      title="Send the right detail to the right place."
    >
      <InformationSection title="Operator and privacy contact">
        {release.ready ? (
          <p>
            This deployment is operated by <strong>{release.operatorName}</strong>.
            Privacy and service questions can be sent to{" "}
            <a href={`mailto:${release.contactEmail}`}>{release.contactEmail}</a>.
            The operator has declared <strong>{release.legalJurisdiction}</strong>{" "}
            as this deployment&apos;s legal jurisdiction.
          </p>
        ) : (
          <p>
            This open-source preview does not yet publish a confirmed production
            operator, privacy email, or legal jurisdiction. Its release metadata
            therefore stays fail-closed. Use the public project channel below only
            for information that is safe to publish.
          </p>
        )}
      </InformationSection>

      <div className="contact-grid">
        <InformationSection title="Product help and bug reports">
          <p>
            Use GitHub Issues for reproducible bugs, feature requests, documentation
            gaps, and questions that are safe to discuss in public.
          </p>
          <a
            className="secondary-action information-action"
            href={issuesUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open GitHub Issues
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </InformationSection>

        <InformationSection title="Private security reports">
          <p>
            Do not open a public issue for a suspected vulnerability. Read the
            repository security policy, then use the private GitHub Security
            Advisory flow with reproduction steps and impact.
          </p>
          <div className="information-actions">
            <a
              className="secondary-action information-action"
              href={securityPolicyUrl}
              rel="noreferrer"
              target="_blank"
            >
              Read SECURITY.md
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a
              className="secondary-action information-action"
              href={privateAdvisoryUrl}
              rel="noreferrer"
              target="_blank"
            >
              Start a private advisory
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </InformationSection>
      </div>

      <InformationCallout label="Bearer-link safety">
        <strong>Never share a scan bearer link or its scan ID in an issue, screenshot,
        recording, analytics tool, or support message.</strong> Anyone who has that
        bearer can view the temporary public scan result while it remains available.
      </InformationCallout>
    </InformationPage>
  );
}
