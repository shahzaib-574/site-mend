# SiteMend design system

## Purpose

SiteMend should feel calm, capable, and immediately understandable to someone who
does not know SEO terminology. The visual direction is **modern minimalist
neumorphism**: soft, tactile surfaces support the hierarchy, while explicit
borders, contrast, labels, and state indicators make every action unambiguous.

The governing principle is:

> Soft surfaces, hard affordances.

Neumorphic shadows are decoration. They never carry the sole responsibility for
showing a boundary, focus, selection, validation state, or whether something is
interactive. Product truth and accessibility take priority over visual style.

## Experience principles

1. Keep the primary journey linear: **Scan -> Understand -> Fix -> Verify ->
   Monitor**.
2. Present one primary action per section and the five most important fixes before
   secondary detail.
3. Use plain language first and place metrics, evidence, and technical terms in
   progressive disclosure.
4. Make location, system status, possible actions, and the result of each action
   visible.
5. Preserve user input and progress when validation, connectivity, navigation, or
   a scan fails.
6. Use familiar web and Android conventions. Novel visual styling must not create
   novel interaction behavior.
7. Meet WCAG 2.2 AA in every new user-facing flow.

## Design tokens

Tokens are named by purpose so a future dark theme or native Android client can
map them without changing component meaning.

### Color

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#eef2ec` | Page background |
| `surface` | `#f4f7f1` | Cards, inputs, navigation, and raised regions |
| `surface-strong` | `#fbfcfa` | Explicit control fills and high-contrast nested surfaces |
| `surface-inset` | `#e8ede7` | Evidence wells and inset form fields |
| `ink` | `#101a17` | Primary text and icons |
| `muted` | `#4f5f59` | Secondary text that remains readable |
| `accent` | `#0f766e` | Primary actions, links, and focus |
| `highlight` | `#b8f45c` | Small emphasis areas and selected accents |
| `success` | `#067647` | Successful validation and completed states |
| `danger` | `#b42318` | Errors and destructive states |
| `line` | `#c2ccc6` | Decorative card outlines and separators |
| `control-border` | `#667085` | Essential control outlines |

Use `ink` on `highlight`; do not use white text on the lime highlight. Primary
buttons may use white on `accent`. Default copy uses `ink` or `muted` on
`canvas`/`surface`. Before introducing another color pairing, verify its contrast
in automated checks and at all interactive states.

Color never acts alone. Pair success, warning, error, selected, and priority
states with text and, where useful, a shape or icon. The product priority labels
are written in full: `Fix now`, `Fix soon`, `Improvement`, and `Optional`.

### Typography

- Use the locally hosted Geist family already supplied by the application, with a
  system sans-serif fallback.
- Body copy starts at `1rem` with a line height of at least `1.5`.
- Use a compact type scale with clear differences between page title, section
  title, item title, body, and supporting copy. Do not rely on color alone for
  hierarchy.
- Keep reading lines near 45-75 characters and left-align explanatory copy.
- Reserve monospace text for URLs, selectors, response evidence, and code.
- Do not place essential copy inside images.

### Spacing and size

Use a four-pixel base grid:

| Token | Value |
| --- | ---: |
| `space-1` | `4px` |
| `space-2` | `8px` |
| `space-3` | `12px` |
| `space-4` | `16px` |
| `space-6` | `24px` |
| `space-8` | `32px` |
| `space-12` | `48px` |
| `space-16` | `64px` |

Use `14px` radii for controls, `20px` for cards, and reserve the `28px` panel
radius for the primary scan and report-preview surfaces. A large radius must not
make nested controls look ambiguous. Prefer whitespace and grouping over extra
dividers.

Interactive targets should be at least `48px` in both dimensions. WCAG 2.2's
`24px` minimum is a floor for exceptional inline controls, not SiteMend's default.
Leave enough space between adjacent targets to prevent accidental activation.

### Elevation and boundaries

Use no more than three elevation levels:

- **Flat:** page regions, table rows, and content that does not need separation.
- **Raised:** cards, primary form regions, and temporary navigation surfaces.
- **Inset:** selected wells or read-only evidence areas, never normal text inputs
  without a visible outline.

A raised surface can use paired soft light and dark shadows. Every actionable
surface also has a visible outline, filled background, underlined text, or other
non-shadow boundary. Pressed states may reduce elevation and shift by no more
than `1px`. Long stacks of raised cards are avoided because they weaken hierarchy
and create visual noise.

## Responsive layout

Design mobile-first and test the following adaptive ranges:

| Class | Width | Expected behavior |
| --- | --- | --- |
| Compact | below `600px` | One column, wrapping visible navigation, full-width primary action |
| Medium | `600-839px` | Wider single column or supporting two-column groups |
| Expanded | `840-1199px` | Persistent navigation where useful, results/detail split |
| Large | `1200-1599px` | Constrained content with denser dashboard composition |
| Extra large | `1600px` and above | More surrounding space, not stretched reading lines |

- Reflow without horizontal scrolling at `320px` CSS width, except for genuinely
  two-dimensional content such as a data table or code sample.
- Constrain the public page to a readable maximum width. Expansion adds useful
  relationships, not empty stretched columns.
- Never hide information solely because the viewport is compact. Reorder it,
  collapse secondary evidence, or allow an intentional contained scroll.
- Design for portrait, landscape, split-screen, browser zoom, text enlargement,
  safe areas, and on-screen keyboards.
- Keep important actions visible when content or system text grows to 200%.

## Navigation rules

- Start every page with a keyboard-visible skip link to the main content.
- Use semantic landmarks and one descriptive `h1`; section headings follow a
  meaningful hierarchy.
- Public navigation contains only working destinations. Do not publish empty
  `Pricing`, `Sign in`, or product links before those destinations exist.
- Keep the top-level navigation short, with clear nouns for destinations and a
  single verb-led primary action such as `Check a site`.
- Keep the current three-link public navigation exposed and allow it to wrap on
  compact screens. Introduce a menu only if the destination count grows; that
  control must have an explicit label and expanded/collapsed state, predictable
  focus on open, and focus restoration on close.
- Show the current destination with text or structure as well as color. A logo
  links to the product home page.
- Links navigate; buttons perform an action. Browser and Android Back behavior
  must return users to the expected prior state without losing scan work.
- Avoid sticky elements that obscure focused controls or error messages.
- In the future Android companion, use bottom navigation only for three to five
  peer destinations; do not use it for actions or a deep hierarchy.

## Page and section rules

Public pages follow this hierarchy:

1. Header and orientation.
2. Clear value statement and website address field.
3. Primary action and an honest explanation of what happens next.
4. Product evidence: representative checks or an actual result.
5. How the five-step loop works.
6. Trust, safety, and data-use context.
7. A focused closing action and footer.

Results pages follow this hierarchy:

1. Scan state, website URL, timestamp, and data sources.
2. Overall summary with the most important next action.
3. The five priority findings.
4. Category summaries and checks that passed.
5. Expandable evidence, affected URLs, and advanced diagnostics.

Use cards only where grouping helps comprehension. Sections receive descriptive
headings, sufficient whitespace, and one clear purpose. Avoid carousels,
auto-advancing content, decorative dashboards, and repeated cards with no
meaningful hierarchy.

## Buttons and links

- Labels begin with a concrete verb and name the result: `Check this address`,
  `View evidence`, `Copy fix`, or `Verify fix`.
- A primary button uses a solid `accent` fill, readable text, a visible boundary,
  and a target of at least `48px` high. Lime `highlight` is reserved for selective
  emphasis, not every call to action.
- Secondary buttons use a visible `control-border` outline. Tertiary actions look
  like links and remain underlined outside navigation.
- Icon-only buttons are limited to universally understood actions and still
  receive an accessible name and target. Prefer visible text for product actions.
- Hover, focus, pressed, loading, disabled, success, and error states each need
  distinguishable feedback. Use at least two indicators for active interaction
  state, such as border plus fill or icon plus text.
- Focus uses a solid `3px` ring in `accent` with at least a `2px` offset. Shadows
  do not replace it, and sticky content must not obscure it.
- Loading actions keep their label or state intent, prevent duplicate submission,
  and announce progress. A disabled action must not be the only explanation of
  missing information.
- Destructive actions use `danger`, say what will happen, and require confirmation
  when recovery is difficult.

## Forms and validation

- Every field has a persistent visible label; placeholders only show an example.
- Instructions and format requirements appear before submission and are connected
  with `aria-describedby` where appropriate.
- Accept a plain domain when safe normalization can infer HTTPS, then show the
  normalized address for confirmation.
- Validate at a helpful time without interrupting typing. On failure, preserve the
  value, put a specific inline message next to the field, and move or summarize
  focus only when needed.
- Error messages identify the problem and the next step. Pair `danger` with text
  and an icon; set the appropriate invalid and description relationships.
- Submission and scan progress use polite live-region announcements. Urgent
  failures may use assertive announcements sparingly.
- Never imply a live audit ran when only client-side address validation occurred.
- Password managers, browser autofill, paste, keyboard submission, and screen
  readers must continue to work; do not replace native controls with visual
  imitations.

## Scan and finding states

The system always distinguishes:

- Not started
- Validating address
- Queued
- Fetching evidence
- Evaluating checks
- Complete
- Partially complete
- Failed or blocked

Progress copy explains the current activity in plain language and does not show a
false percentage. If timing is unknown, use a determinate step list with an
indeterminate current step. A failed scan preserves completed evidence, explains
whether retrying is useful, and never reports unavailable data as a passing zero.

Do not invent milestones the backend does not expose. The current public contract
supports only `queued`, `running`, `completed`, and `failed`, so its progress view
maps directly to those states and uses an indeterminate native progress element.
Announce real state transitions rather than every poll. Pause background polling
while the document is hidden or offline and keep the last trusted state visible.

Every finding includes evidence, impact, effort, a practical fix, affected URLs,
confidence, and a verification method. Raw scoring inputs belong in advanced
details. Lab measurements and real-user field data are visibly separated.

## Motion

Motion communicates state or continuity; it is not ambient decoration.

- Micro-interactions should complete in roughly `120-180ms`; panels and grouped
  transitions in `180-250ms`.
- Prefer opacity and small transform changes that do not trigger layout movement.
- Never animate a page in a way that changes content position after the user has
  started reading or causes cumulative layout shift.
- Avoid parallax, looping pulses, auto-advancing regions, and motion that is not
  controlled by the user.
- Respect `prefers-reduced-motion: reduce`: remove transforms and smooth scrolling,
  shorten nonessential transitions, and show final states immediately.
- Pausable animated content is required if any future status visualization lasts
  longer than five seconds. Essential progress remains understandable when
  animation is removed.

## Accessibility constraints

WCAG 2.2 AA is a release requirement, not a final polish pass.

- Normal text has at least `4.5:1` contrast; large text has at least `3:1`.
- Essential control boundaries, icons, selection, and focus indicators have at
  least `3:1` contrast against adjacent colors.
- All functionality works with keyboard alone in a logical order, with no trap.
- Focus is visible, not obscured, and restored sensibly after menus, dialogs, and
  asynchronous operations.
- Landmarks, names, roles, values, descriptions, headings, tables, and live status
  are exposed correctly to assistive technology.
- Touch and pointer targets use the size and spacing rules above. Dragging always
  has a single-pointer alternative.
- Content survives 200% zoom and `320px` reflow without loss of information or
  function.
- Errors, priority, progress, and selection do not depend on color, location,
  sound, motion, or shadow alone.
- Test with keyboard, screen reader/TalkBack, high-contrast settings, reduced
  motion, text enlargement, and automated accessibility tooling.

## Honest product language

- Say what SiteMend measured, when it measured it, and which data source produced
  the result.
- Label signals as **measured**, **derived**, or **experimental** when the
  distinction affects confidence.
- Describe AEO/GEO checks as AI-search readiness signals, never guaranteed
  rankings, inclusion, or citations.
- Do not imply that a sample report, browser-only validation, unavailable field
  data, or feature-gated backend is a completed live scan.
- Use `Unavailable`, `Not checked`, or `Partially complete` instead of replacing
  missing evidence with a score of zero or a passing state.
- Marketing examples are labeled as examples and use no fabricated customer
  results, testimonials, scan counts, or performance claims.
- Ads and commercial prompts are visually identified and never resemble findings,
  system messages, or primary product actions.

## Play-responsive considerations

The web experience is the source of interaction and content rules, but Google
Play readiness requires deliberate Android behavior rather than an unmodified
web page in a shell.

- Support compact through expanded window classes, rotation, split-screen,
  foldables, edge-to-edge layouts, safe areas, and large screens.
- Preserve the current website, scan, filter, scroll, and partially completed task
  through configuration changes and process recreation.
- Honor system Back and predictive Back, standard text scaling, TalkBack,
  high-contrast settings, reduced motion, and platform permission patterns.
- Keep core status and saved findings useful on slow or interrupted networks.
  Explain stale data and make retry behavior explicit.
- Use platform-consistent navigation, system bars, notifications, share sheets,
  and deep links while retaining SiteMend's tokens and content hierarchy.
- Ads must never cover content, shift a control during interaction, interrupt the
  scan-to-fix flow, or be confused with a result. Reserve ad space and label it.
- Before store submission, test all adaptive sizes, portrait and landscape,
  Android Back, state restoration, TalkBack, 200% text, slow network, offline
  recovery, install/update, privacy disclosures, and ad consent behavior.

This document does not select the Android implementation stack or claim that a
web wrapper alone satisfies Play quality. That decision belongs in a focused,
tested architecture PR.

## Design review checklist

### Understandability

- [ ] A new visitor can identify the product, supported input, and primary action
  without instruction.
- [ ] Each section has one purpose and one clear primary action.
- [ ] Copy uses plain language before technical detail.
- [ ] Examples, unavailable data, and experimental signals are labeled honestly.

### Navigation and interaction

- [ ] Every visible destination exists; links navigate and buttons act.
- [ ] Location, focus, loading, completion, and failure are apparent without
  relying on a shadow or color alone.
- [ ] Targets are at least `48px` where practical and remain separated.
- [ ] Keyboard order, skip link, menu focus, Back behavior, and state restoration
  work as expected.

### Visual and responsive quality

- [ ] Palette pairings and all interaction states pass contrast checks.
- [ ] Neumorphic elevation is restrained and every control has a hard affordance.
- [ ] Content works at `320px`, all defined adaptive ranges, 200% zoom, portrait,
  landscape, and split-screen.
- [ ] Motion explains state, causes no layout shift, and reduces correctly.

### Scan integrity

- [ ] Scan state and data provenance are visible.
- [ ] Lab, field, derived, and experimental results are distinguished.
- [ ] Findings include evidence, impact, effort, fix, affected URLs, confidence,
  and verification.
- [ ] Failure preserves useful work and never becomes a false pass.

### Release evidence

- [ ] Component tests cover states and keyboard behavior.
- [ ] Automated accessibility checks and manual keyboard/screen-reader checks pass.
- [ ] Representative viewport screenshots were reviewed for hierarchy, clipping,
  overflow, focus, and ad placement.
- [ ] Android adaptive, Back, restoration, network, TalkBack, and ad-consent cases
  are recorded before Play submission.

## References

- [Nielsen Norman Group: 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WCAG: Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [WAI forms tutorial](https://www.w3.org/WAI/tutorials/forms/)
- [Android accessibility guidance](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)
- [Android window size classes](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes)
- [Android core app quality](https://developer.android.com/develop/adaptive-apps/quality-guidelines/core-app-quality)
- [Android adaptive app quality](https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality)
