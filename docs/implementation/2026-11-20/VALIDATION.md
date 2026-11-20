# Planning-only verification and publication notes

The plan has **nine outcome packets**: seven core, two conditional. Dependencies are a DAG; N191 is the single first complete unblocked task. Conditional N199/N200 have `Status: blocked` and do not block N198. Existing PRs are explicitly mapped to N191/N192/N193/N195/N196.

**This document publishing change does not execute app/SQL/device tests.** It changes no `supabase/**`, `src/**`, flags or protected CI files. All source-file and CI status observations are at the 2026-11-20 audit snapshot and need fresh confirmation before implementation.

**Mandatory shipping proof** (N198): New is default for users without Settings override, Settings > Planning allows persistent Legacy/New, Today/MCP agree, native fallback is safe and observable, historical rounds are unchanged; Lemma Pad is a routable full page with on-screen math keyboard enabled, accessible and offline-capable. No feature launch without signed-in/upgrade/device/rollout evidence and Owner authorization.
