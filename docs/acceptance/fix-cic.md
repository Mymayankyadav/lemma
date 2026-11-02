# FIX-CIc — Review-run, route bootstrap and automatic appearance

Main-based split from [FIX-CI #744](https://github.com/Mymayankyadav/lemma/pull/744) under [AUDIT #753](https://github.com/Mymayankyadav/lemma/issues/753).

## Acceptance
- [ ] Direct Review-run hashes request the Review module early; all other routes preload only their appropriate App/detail chunks without broad eager hydration.
- [ ] Dynamic App import failure yields a visible, accessible retry instead of a blank root; successful imports mount React normally.
- [ ] Cold Review-run loads real cards with confidence-before-reveal, grading, FSRS, scroll hint and optional notes; avoid fetching 60k sessions unnecessarily.
- [ ] Plain mathematical card fronts preserve rich KaTeX fallback, and complex notation remains fully typeset.
- [ ] Automatic Graph day/night reconciles a system dark-mode switch missed before the lazy appearance listener; manual override remains authoritative.
- [ ] Route-specific and first-paint 4× CPU S/X tests preserve all real-content, tap/DOM/layout requirements and owner-approved 4s cold budget once #754 merges; no functional or performance retries.
- [ ] All seven exact-head CI jobs, independent different-slot Auditor CLEAR, Steward gate; no main or force pushes.

No New-project/PDF (#755), notification SQL/CI policy (#754), Cards/Atlas/Project or service-worker changes in this split.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
