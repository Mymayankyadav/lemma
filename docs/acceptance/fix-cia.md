# FIX-CIa — independently auditable owner-approved strict CI timing policy

Parent [FIX-CI #744](https://github.com/Mymayankyadav/lemma/pull/744); provenance issue [AUDIT #753](https://github.com/Mymayankyadav/lemma/issues/753). **This PR contains no notification SQL/migrations.** The six strict NOTIF X SQL/test paths are preserved byte-identically in [FIX-CIf #759](https://github.com/Mymayankyadav/lemma/pull/759), which owns their unresolved <150ms first-attempt performance root cause.

## Acceptance
- [ ] Apply the owner's documented CI policy: one browser worker, 4× CPU unchanged, strict first-attempt transitions <2s and cold renders <4s; zero performance retries.
- [ ] Retain DOM <1500, 8px mark spacing, 44px taps, 12px text, 16px maths, no overflow, resource limits, real content and functional assertions.
- [ ] Preserve strict CP4/Atlas/Cards loaded-fixture timing and all S/X Graph day/night 360/390 cells; no hidden tests or reduced fixture.
- [ ] npm check, all four browser shards, SQL on unchanged main (including its strict 150ms X test), 144 screenshots and independent different-slot Auditor CLEAR.
- [ ] After merge, all downstream split PRs may non-force integrate current main. #759 remains separately blocked until robust SQL <150ms first-attempt evidence.

No SQL fixture, grant, migration, RPC, service-worker, UI feature code or Supabase deployment is modified in this policy-only split.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
