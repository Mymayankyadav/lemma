# FIX-CIe — strict visible-paint and screenshot capture acceptance

Main-based final QA split of [FIX-CI #744](https://github.com/Mymayankyadav/lemma/pull/744), tracked by [AUDIT #753](https://github.com/Mymayankyadav/lemma/issues/753).

## Acceptance
- [ ] Checkpoint CP4 and plan-proposal strict first paint is measured after real visible geometry and a double requestAnimationFrame barrier, not merely DOM insertion.
- [ ] All eight S/X Graph day/night 360/390px first-attempt 4× CPU cells remain present; no retries, hidden data, fabricated paint or relaxed layout assertions.
- [ ] Screenshot capture waits for real Today forecast/Atlas state and produces distinct Graph/All stress images, not byte-identical placeholders.
- [ ] QA-4 structural 184 viewport/64 full-page captures, 144 canonical screenshots, DOM/overflow/tap/text/math limits and no console errors.
- [ ] Owner-approved 4s cold timing policy from #754 is merged before declaring these test-only cases complete; no tests deleted or weakened.
- [ ] All seven exact-head CI jobs, independent different-slot Auditor CLEAR and fresh Steward gate.

The obsolete parent `docs/acceptance/fix-659.md` 1.5s note is superseded by #754 owner policy and #755 New-project acceptance; it is intentionally not duplicated in this split.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
