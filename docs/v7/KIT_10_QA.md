# Constellation UI kit · QA and handoff

Source of truth: [Owner 10/10 kit plan](./KIT_10_PLAN.md). Rebuild scope: all `/kit` specimens and reusable v7 primitives, not the unfinished application routes.

## Regenerate and validate

```bash
node scripts/v7/generate-tokens.mjs
node scripts/v7/check-kit.mjs
npm run typecheck
npx vitest run tests/unit/v7
npx playwright test tests/e2e/v7-kit.spec.ts tests/e2e/v7-step3.spec.ts
```

The PR gate runs the blocking token, contrast and CVD checks. The gallery-screens workflow builds with test-only URL flags and uploads Day and Night viewport and full-page screenshots as artifacts; it does **not** push screenshots or additional commits.

## Component contract

- Colour = roles, never arbitrary component literals. Indigo only means action, selection, focus or link. Subject solids identify subjects and fill mastery/series marks; status uses a shape and a word.
- Day/Night/Day-HC/Night-HC share DOM structure. Each comparison panel resolves its own mode; density changes only heights and spacing. Desktop uses two columns; narrow layouts stack.
- Subject tag (glyph/pill), status/proof badge (filled icon/rounded rectangle) and interactive filter (check/pill) have distinct meanings.
- Forms validate on blur or submit; read-only fields remain focusable/copyable with a lock, and disabled controls carry reasons. Checkboxes are square and radios round.
- Time range is one input pair plus preset filters and a custom duration slider. Primary actions retain their labels when loading, and Undo is an eight-second notification.
- Every chart contains a written summary, keyboard-reachable values and a table view. Hero mathematical emblems are limited to 400 paths; the same seed yields the same path.
- Section specimens are demonstrations, not live app data. Destructive actions require a confirmation sheet. Reduced motion and forced colours have CSS fallbacks.

## Before Owner approval

Review mobile (320/390), tablet and desktop in both themes and both high-contrast modes; audit 200% text zoom and assistive technologies (VoiceOver, TalkBack and NVDA). Verify the updated snapshot artifact and the 12-point scorecard against the attached plan. The kit's generator provides a Figma-variable interchange manifest, not an automatically published Figma library.

Do not activate v7 or merge PR #1348 solely on the basis of kit tests: its main application redesign, performance budget, six golden screens, hardware/device and Owner gates remain outstanding.
