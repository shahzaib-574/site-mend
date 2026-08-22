import type { Metadata } from "next";

import {
  InformationCallout,
  InformationPage,
  InformationSection,
} from "@/components/information-page";
import { createPublicPageMetadata } from "@/lib/public-page-metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return createPublicPageMetadata({
    description:
      "Learn how SiteMend turns nine deterministic public-homepage checks into clear evidence and practical next steps, with future coverage labelled as planned.",
    path: "/about",
    title: "About SiteMend",
  });
}

export default function AboutPage() {
  return (
    <InformationPage
      eyebrow="About SiteMend"
      introduction="SiteMend is an open-source website health-check project built to make a small, trustworthy result easier to use than a giant audit report."
      title="Website health without the wall of jargon."
    >
      <InformationSection title="What SiteMend checks today">
        <p>
          The current release makes one bounded, read-only visit to a public
          homepage. It reports exactly nine checks: final status, HTTPS, robots
          access, redirects, title, description, canonical URL, heading structure,
          and indexing directives.
        </p>
        <p>
          Each finding is produced by deterministic rules and keeps the observed
          evidence beside its impact, effort, suggested fix, affected URL, and a
          way to verify the change. SiteMend does not change a website for you.
        </p>
      </InformationSection>

      <InformationSection title="How the product makes decisions">
        <ul className="information-list">
          <li>
            <strong>Evidence before scores.</strong> The report shows what the
            crawler observed instead of hiding the result behind a mystery grade.
          </li>
          <li>
            <strong>Plain language first.</strong> Technical details stay available,
            but the next useful action comes first.
          </li>
          <li>
            <strong>Safe boundaries.</strong> Targets and redirects are checked as
            hostile input, robots rules are respected, and crawling is bounded.
          </li>
          <li>
            <strong>Honest scope.</strong> A check that did not run is not presented
            as a pass, and planned work is not presented as live evidence.
          </li>
        </ul>
      </InformationSection>

      <InformationSection title="What is planned">
        <p>
          Core Web Vitals and speed evidence, multi-page crawling, AEO and GEO
          readiness, and scheduled monitoring are roadmap areas. They are not part
          of the current nine-check report, and there is no promised release date.
        </p>
        <InformationCallout label="AI search scope">
          AI-search readiness will be described as evidence and readiness signals,
          never as a guarantee of rankings, mentions, or citations.
        </InformationCallout>
      </InformationSection>
    </InformationPage>
  );
}
