# Contributing to SiteMend

## Workflow

1. Sync `main` and create a focused branch.
2. Write acceptance criteria before implementation.
3. Add or update tests with the behavior.
4. Run `npm run verify`.
5. Open a pull request using the repository template.
6. Resolve every audit, review, test, and CI finding.
7. Squash merge only after all required checks pass.

Branch prefixes are `feat/`, `fix/`, `docs/`, and `chore/`.

## Pull-request gates

Every PR must include:

- User-visible outcome and non-goals
- Acceptance criteria
- Screenshots for visual changes
- Test commands and results
- Security, privacy, accessibility, and performance audit notes
- Documented review outcome
- Rollback plan

Features must not be merged while required checks are pending, failing, skipped,
or neutral. Review conversations must be resolved.

## Coding expectations

- Prefer small, typed modules with explicit boundaries.
- Keep objective audit detection deterministic.
- Include evidence and verification logic with each new audit rule.
- Avoid logging submitted URLs with query secrets or fetched private content.
- Use plain language for default user-facing copy.
- Preserve an advanced evidence view for professional users.
