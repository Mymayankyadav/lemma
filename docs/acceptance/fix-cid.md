# FIX-CId — Atlas, Cards and Project cold-route UI split

Parent [FIX-CI #744](https://github.com/Mymayankyadav/lemma/pull/744); provenance [AUDIT #753](https://github.com/Mymayankyadav/lemma/issues/753). Main-based extraction of owner-approved UI performance and layout corrections, not a theme change.

## Acceptance
- [ ] Atlas StrictMode cold row/geometry cache preserves immutable fold-state invalidation, prerequisite arcs, real content and 360/390px toolbar.
- [ ] Cards cold project filter and lazy New card Sheet preserve mathematical titles, 44px controls, pagination, due cards and review parity.
- [ ] Project Route/Sessions/Sources remains navigable, with bounded session summaries, no extra network reads and preserved Metro.
- [ ] Demo stress fixtures preserve real long mathematical card content and deterministic S/X data.
- [ ] EmptyState illustrations defer only optional visual work without leaving a blank state.
- [ ] Full S/X Graph day/night 360/390px 4× CPU, DOM<1500, >=16px maths, >=12px text, >=44px taps, no overflow and screenshots.
- [ ] All seven exact-head CI jobs, independent different-slot Auditor CLEAR and Steward gate. Owner-approved 2s transition/4s cold CI policy lands in #754.

No SQL/CI policy, PDF/New-project, Review-run/bootstrap or QA screenshot workflow changes in this split.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
