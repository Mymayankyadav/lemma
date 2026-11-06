# NEXT — ranked by the priority run (2026-11-06, rules v2.0 parallel plan). Take the top open item whose Needs are all done.

Order used: work already in a PR, then the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N11.1, N11.2, N13, N14.1 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

## N15 MCP: read study records through get and search
Stage: Build · Status: open · Needs: — · Assigned: —
Done = the connector's existing `get` and `search` tools accept the resources `study_entries` (with intervals) and `calendar_blocks`, reading the N10 tables as the authenticated owner: bounded pages with a cursor, a range filter, totals reported separately from the page. No new tool and no write path (writes are N12). Existing resources, tools and the `resume` packet are unchanged; `tools/list` stays under 15,000 characters (`tests/mcp/sweep-budget.test.mjs`).
Tests: unit tests in `tests/unit/mcp/` (argument validation, owner never taken from arguments, page bounds) and `tests/mcp/sql/study-mcp-read.mjs` (rows written through `study_command` are read back by `get` and `search` with the same version; a second owner's rows are invisible).
Owner-authorized 2026-11-05 (D1): merging deploys the MCP function to production, so this PR needs a review; the reviewer confirms no existing tool's input or output changed.
Scope: supabase/functions/mcp/**, tests/unit/mcp/**, tests/mcp/sql/study-mcp-read.mjs, CURRENT.md (MCP tools list).
Not: the `study` write tool (N12), migrations, the `notify` function.

## N19 v6 visual tokens and fonts behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, the app root carries `data-v6` and one stylesheet `src/ui/v6/tokens.css` defines the v6 colour, type, spacing, radius and elevation tokens for day and night (`prefers-color-scheme` plus the existing theme setting) from `docs/v6/DESIGN_HANDOFF.md` "Shared design contracts" and the `docs/v6/screens/*-day.png` / `*-night.png` pairs, as CSS custom properties scoped under `[data-v6]`. The v6 shell parts from N13 (tab bar, header, accessory slot) use the tokens. Fonts: the families the handoff names, self-hosted as woff2 under `public/fonts/v6/` only if their licence allows it (record the licence in CURRENT.md), otherwise the stated fallback stack; no external font requests. With the flag off nothing changes.
Tests: `tests/unit/app/v6-tokens.test.ts`: the attribute appears only with the flag on, every token the shell parts use is defined for both schemes, body text contrast is at least 4.5:1 for both schemes (computed from the token values).
Scope: src/ui/v6/tokens.css (new), src/ui/v6/** (token use in shell parts), src/app/** (setting the attribute and importing the stylesheet only), public/fonts/v6/** (new), tests/unit/app/**, CURRENT.md.
Not: changing any colour or font with the flag off, existing visual tests, screens other than the shell parts, new dependencies.

(Next priority run: the live first slice (N16 + N11.3 wired into Today/Calendar/Progress), Calendar Week/Month, tasks UI on N21, Harden pass for the v6 slice. Next free ID: N22.)
