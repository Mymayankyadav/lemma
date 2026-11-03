# FIX-CIb — New-project and PDF cold-route safety

Parent [FIX-CI #744](https://github.com/Mymayankyadav/lemma/pull/744); provenance issue [AUDIT #753](https://github.com/Mymayankyadav/lemma/issues/753). Main-based split of the original FIX-659a source and regression tests, excluding unrelated bootstrap, Cards, Atlas, notification and SQL changes.

## Acceptance
- [ ] New-project sheet is usable before the heavy Paths library hydrates, but retains the real inert Paths rows after deferral and on dismissal.
- [ ] Exactly one Paths backdrop heading throughout the Suspense transition, including intermediate DOM commits; no functional retries.
- [ ] Source validation for PDF, .tex and .md remains safe and lazy, with unchanged 50 MB limit, retries, SHA-256 duplicate handling and no upload data loss.
- [ ] Mathematical name preview appears when typed; normal empty-name cold route does not load KaTeX prematurely.
- [ ] Eight 4× CPU S/X Graph day/night 360/390 cases, screenshots and DOM/overflow checks meet the **owner-approved 4s cold budget** once policy split #754 lands; old 1.5s budget remains on main until then.
- [ ] All seven exact-head CI jobs, independent different-slot Auditor CLEAR and Steward merge gate.

No feature changes outside these seven task paths. Do not merge until the independent policy/SQL split is integrated or equivalent exact-head CI succeeds.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
