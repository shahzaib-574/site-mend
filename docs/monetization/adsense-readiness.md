# AdSense readiness and exclusion policy

## Current state

SiteMend does not load AdSense, analytics, a consent-management platform, an ad
slot, or an `ads.txt` declaration. This is intentional. A real Google setup needs
owner-controlled account and domain facts that must not be invented in source
code.

AdSense is for advertising rendered by the website, including web content shown
inside a Trusted Web Activity. AdMob is for native Android inventory. A future
Android PR must not inject a native AdMob unit into SiteMend's web DOM or assume
that a web consent flow automatically governs native SDK processing.

## Permanent ad-free surfaces

Google code, other ad networks, analytics, pixels, and ad-related remote resources
are prohibited on:

- `/scan` in every fragment, state, and failure mode;
- `/api/**`, 404/500, loading, queued, empty, disabled, retry, and error surfaces;
- scan entry, progress, results, findings, evidence, fix, and verification views;
- `/privacy`, `/terms`, `/contact`, consent and privacy-choice interfaces;
- current or future forms, sign-in, account, billing, project dashboard, private
  report, client portal, and authenticated pages; and
- unreviewed user-authored, submitted, fetched, or third-party-derived content.

These exclusions are a product boundary, not merely an Auto Ads setting. No ad or
CMP script belongs in the root layout. If a future substantive editorial route is
approved for monetization, its route-specific layout may load reviewed code only
after the consent gate. Navigating from that document to a capability-bearing
report is a two-document boundary: a native link first loads the isolated `/`
scan-entry document, then a successful submission loads `/scan` as another new
document. Next client routing is prohibited at either boundary so the prior
third-party runtime is destroyed before the bearer exists.

## Eligibility gate

Do not add an ad tag or request Google review until all conditions are true:

1. a custom apex HTTPS domain is live, publicly crawlable, owner-controlled, and
   redirects HTTP to a recognized-certificate HTTPS endpoint;
2. the site contains complete, useful, original publisher-authored content and
   clear navigation; it no longer presents as under construction;
3. the owner confirms the operator identity, contact, privacy policy, target
   markets, processors, and actual data/retention behavior;
4. an adult account holder completes AdSense legal, payment, phone, and identity
   steps as Google requests;
5. the owner supplies the real `ca-pub-…` script identifier and matching
   `pub-…` seller identifier from the authenticated account;
6. a Google-certified CMP integrated with the IAB TCF is selected and tested for
   EEA, UK, and Switzerland traffic; users can refuse where required and reopen
   privacy choices;
7. the privacy notice describes Google/third-party cookies, local storage, IP
   addresses, identifiers, sharing, personalization, opt-outs, and links to
   Google's partner-site data explanation;
8. the domain is added and verified in AdSense, Google completes its policy review,
   and the site status is `Ready`; and
9. any root `ads.txt` is generated only from the confirmed `pub-…` value and its
   AdSense status is authorized.

Google publishes no safe minimum page, word, traffic, or domain-age shortcut.
SiteMend must earn review with useful original content, not filler.

## Consent architecture

Do not build a cosmetic home-grown cookie banner and call it a certified CMP.
For covered traffic, use Google's Privacy & Messaging CMP or another CMP on
Google's current certified list. The CMP must run and produce the required signal
before an eligible page requests an ad. Unknown, blocked, malformed, expired, or
unavailable consent fails closed to no ad request.

The live verification includes EEA, UK, and Switzerland geography, first-layer
choices, consent withdrawal/reopening, keyboard and screen-reader use, cookies
blocked, storage unavailable, slow/offline recovery, and Google's documented
forced-message test mode. Consent must never block access to the scan or legal
content.

## Placement policy

The first eligible inventory, if the product has enough original content, is a
manually placed responsive unit on a substantive editorial methodology or fix
guide. It must:

- be labelled only `Advertisement` or `Sponsored links`;
- reserve its final responsive size before loading;
- remain visually distinct from SiteMend cards, navigation, findings, buttons,
  downloads, status messages, and evidence;
- never overlay, float over, interrupt, or outnumber publisher content; and
- never refresh automatically or be moved near a control to encourage a click.

Auto Ads stay off for the first release. If the owner later enables them in
AdSense, every permanent exclusion above is also configured as an account-side
page/area exclusion and verified on real mobile and desktop pages. Account-side
exclusions cannot replace code-level isolation.

## Account-side setup sequence

After the eligibility gate passes, the owner and Codex can use the requested
browser workflow:

1. the owner signs in to the intended Google account and confirms the account and
   payment identity;
2. add the live domain under **AdSense → Sites**;
3. choose a verification method and add only the exact owner-confirmed value;
4. configure and publish the certified CMP message with the live privacy URL;
5. verify ownership, then explicitly confirm before requesting Google review;
6. wait for Google's `Ready` result rather than treating submission as approval;
7. create a manual unit or reviewed Auto Ads exclusions only after approval; and
8. publish and validate `ads.txt` with the real seller value.

Identity, payment, contract acceptance, review submission, and consent-partner
choices are owner actions. Automation must not guess them, bypass Google review,
or silently click acceptance controls.

## Testing and invalid traffic

Automated tests and browser QA must block or stub Google advertising endpoints.
Never click a live ad, generate automated live impressions, use incentivized
traffic, test automatic refresh, or ask users to support SiteMend by clicking an
ad. Production monitoring separates product clicks from ad systems and treats an
unexpected ad request on an excluded surface as a release incident.

## Official Google references

- [Manage and review sites](https://support.google.com/adsense/answer/12131223)
- [Connect a site and request review](https://support.google.com/adsense/answer/7584263)
- [Site readiness guidance](https://support.google.com/adsense/answer/7299563)
- [Publisher privacy disclosures](https://support.google.com/publisherpolicies/answer/10437794)
- [Required AdSense privacy content](https://support.google.com/adsense/answer/1348695)
- [Google-certified CMP requirement](https://support.google.com/adsense/answer/13554116)
- [EU User Consent Policy](https://www.google.com/about/company/user-consent-policy/)
- [Program policies](https://support.google.com/adsense/answer/48182)
- [Placement guidance](https://support.google.com/adsense/answer/1346295)
- [Auto Ads exclusions](https://support.google.com/adsense/answer/9262311)
- [`ads.txt` guidance](https://support.google.com/adsense/answer/12171612)
- [AdSense versus AdMob](https://support.google.com/admob/answer/9234653)
