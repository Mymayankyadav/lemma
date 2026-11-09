# v6 UI audit, 9 Nov 2026 (N121 inputs)

The Owner's audit of `main` at `f46de0a` (v6 on by default), and the plan that fixes it in one PR (item N121).

| Path | What it is |
|---|---|
| `PLAN.md` | **The execution plan.** Traceability from every finding to a work package, phased changes with file references, tests, and the PR mechanics. Start here. |
| `AUDIT.md` | The audit as delivered: verdict, scorecard, top 15, cross-cutting problems X1–X15, Calendar deep dive, findings per screen, and the fix list F1–F14. |
| `annotated/` | The key defects marked up (A01–A08) and the evidence for the three contradictions (C01–C03). |
| `reproduce/` | The auditor's Playwright scripts. `seed.json` is a realistic month of demo data anchored on 2026-11-09 IST (sessionStorage keys of the v6 demo adapters). `covered.cjs` is the tap-reachability check: it hit-tests each control's centre. Run them from the repo root against `npx vite preview --port 4173`, e.g. `node docs/v6/ui-audit-2026-11-09/reproduce/covered.cjs`. |

`AUDIT.md` also cites `screenshots/…` and `measurements/…` paths. Those 600 images and the per-state JSON were not copied into the repo; they are in the Owner's archive `lemma-ui-audit-2026-11-09.zip`.

These files are evidence and instructions for N121, not a design reference. The design target stays `docs/v6/screens/`, and the audit's own rule is "the mockup is not the reference here". `PLAN.md` §0.4 (D1) says how conflicts between the two are settled.
