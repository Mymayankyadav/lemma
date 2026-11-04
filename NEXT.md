# NEXT — ranked by the priority run (2026-11-04). Take the top open item whose Needs are all done.

Order used: S0/S1 work, confirmed bugs in Stable features, then the Owner's goals 1–5, then other Harden work. Goal 5 (Atlas and plan-proposal review) has no item yet: it starts after N2–N8 are done.
No item may list a protected path (`ci/protected.json`) in Scope. Archived PRs named below are references only: port the listed files into a new branch from main, never merge or rebase the archived branch (those branches also carry unrelated work).

## N1 Fix deployment
Stage: Harden · Status: open · Needs: — · Assigned: —
Done = (a) `supabase/migrations/20261102052000_notify_candidates_ranked_reuse.sql` is renamed, content unchanged byte for byte, to `supabase/migrations/20261102105000_notify_candidates_ranked_reuse.sql`, so that it sorts after the remote's newest migration (`20261102104500_notification_review_items`) and before `20261102113500_notify_candidates_sort_memory.sql`; (b) the hard-coded path in `tests/mcp/notif1b-candidates.mjs` points at the new name, with no other change to that file; (c) CURRENT.md "Known breakages" item 1 is updated; (d) the `Supabase` workflow run for the merge commit on main has `Apply migrations`, `Deploy MCP` and `Verify deployed MCP endpoint` all successful, and the `MCP smoke` run after it is successful. Link both run URLs in the PR body after merge (comment `Done: …` on the PR).
Why this fix: remote history (checked read-only on 2026-11-04) ends at `20261102104500`; both `...052000` and `...113500` are unapplied. Plain `supabase db push` refuses a local file that sorts before the remote's last migration. The `...104500` file only does `create or replace function public.notification_review_items` and does not touch `notify_candidates`, so the new order is safe. No `.github/**` edit is needed.
Owner-authorized 2026-11-04: merging N1 applies these two migrations to production; the reviewer must read both SQL files before merging.
Scope: supabase/migrations/20261102052000_notify_candidates_ranked_reuse.sql (rename only), tests/mcp/notif1b-candidates.mjs (path only), CURRENT.md.
Not: any change to SQL text, `.github/**`, `--include-all`, other migrations, test thresholds or budgets, app UI, supabase/functions/**. If the deploy then fails at a different step, comment `No progress:` with the failing step and leave the item open.

## N2.1 Today: goal cards for 14, 15 and 40 checkpoints
Stage: Harden · Status: open · Needs: — · Assigned: —
Done = a new unit or e2e test that runs in `fast-gate` (no timing assertions): with demo projects of 14, 15 and 40 checkpoints, Today shows for each the same goal-card elements (project title, next checkpoint, distance to goal), with the 15 and 40 cases not falling back to the old summary card (archived issue #614). If the test fails on main, fix it in the same PR; if it passes, add the test and record in CURRENT.md that #614 did not reproduce.
Scope: src/features/home/**, tests/unit/home/**, tests/e2e/home.spec.ts, CURRENT.md (Known breakages 2 only).
Not: Atlas, Review, budgets or timing assertions, src/data/**.

## N2.2 Today: Continue metadata fits mobile viewports
Stage: Harden · Status: open · Needs: — · Assigned: —
Done = a new unit or e2e test that runs in `fast-gate` (no timing assertions): at 360×640 and 390×844, the Continue card's metadata line is fully inside the viewport on the `stress` and `extreme` demo profiles, 5 consecutive runs, no retries (archived issue #760). If the test fails on main, fix it in the same PR; if it passes, add the test and record in CURRENT.md that #760 did not reproduce.
Scope: src/features/home/**, tests/unit/home/**, tests/e2e/home.spec.ts, CURRENT.md (Known breakages 2 only).
Not: Atlas, Review, budgets or timing assertions, src/data/**.

## N3 Review: filters apply before the daily quota
Stage: Harden · Status: open · Needs: — · Assigned: —
Done = a new unit test in `tests/unit/review/` for the demo adapter and the review-run store: with a daily limit of Q cards and a filter that matches M cards (M > Q and M < Q, both cases), the queue holds min(Q, M) cards, all matching the filter, and the count shown on the Review page equals the queue length. The test fails on main if archived issue #747 is real (then the fix is in the same PR); if it passes, the PR adds the test and records that #747 did not reproduce. If the live path needs SQL, do not change it: file a bug issue with the failing SQL case.
Scope: src/features/review/**, src/features/review-run/**, src/data/demo/adapter.ts, src/data/live/helpers.ts, tests/unit/review/**, CURRENT.md (Known breakages 2 only).
Not: supabase/**, FSRS code in src/lib/fsrs, budgets.

## N4 Cards and Checkpoint: blocking tests for every page state
Stage: Harden · Status: open · Needs: — · Assigned: —
Done = new `fast-gate` unit tests: `tests/unit/checkpoint/page-states.test.tsx` covering loading, not found, empty, active and deferred (at least 5 distinct assertions on visible text or roles), and `tests/unit/cards/page-states.test.tsx` covering loading, empty library, filtered-to-zero, and filters combined (project + state) in the demo adapter. Any bug a test exposes is fixed in the same PR with the test failing before the fix. CURRENT.md Main tests column updated for both features.
Scope: src/features/checkpoint/**, src/features/cards/**, src/features/card/**, tests/unit/checkpoint/**, tests/unit/cards/**, CURRENT.md.
Not: timing assertions, `tests/e2e/**` changes, budgets, Today and Review code.

## N5 Notifications: Web Push handling in the service worker, behind a flag
Stage: Build · Status: open · Needs: N1 · Assigned: —
Done = flag `notificationsPush` (default false) added to `src/flags.ts`; with the flag on, the service worker shows a notification from a push payload and, on notification click, focuses or opens the app at the deep link carried in the payload; with it off, behaviour is unchanged. Unit tests: payload parsing (valid, truncated, oversized, unknown fields), click routing (existing window, no window), and flag off = no handler registered. The payload shape must match `supabase/functions/notify/payload.ts`. Reference only: archived PR #713 (head `525a6f12a94f007701b11b8ffdc9e5c8c80ef9f1`, "NOTIF-5 Service worker push handling").
Scope: src/lib/**, src/data/notify.ts, vite.config.ts only if the service worker must be injected (no new dependency), src/flags.ts, tests/unit/notify/**, tests/unit/flags.test.ts, CURRENT.md.
Not: supabase/**, `.github/**`, UI settings screens, subscribing to push (the subscribe flow already in `src/data/notify.ts` stays as is), new dependencies.

## N6 Notifications: reminder tap opens the right Review screen
Stage: Build · Status: open · Needs: N5 · Assigned: —
Done = with `notificationsPush` on, tapping a due-card reminder opens the Review queue at the cards named in the notification (one bounded read through the existing `notification_review_items` RPC) and, when that queue is finished, Review done offers the next reminder time; with the flag off nothing changes. Unit tests for: deep-link parsing (valid, malformed, expired token), the bounded read (limit respected, owner filter present), and the done-screen offer. Reference only: archived PR #717 (head `ce6b8718237cb7078414a48b076952c369083952`, "NOTIF-7 Notification deep links and review-done offer") and #745 (head `e65590e23541275dbc992575ffb4692686164863`).
Scope: src/features/review/**, src/features/review-run/**, src/features/review-done/**, src/data/notify.ts, tests/unit/notify/**, tests/unit/review/**, CURRENT.md.
Not: supabase/** (the RPC already exists on main and on the remote), `.github/**`, new dependencies.

## N7 Android: Trusted Web Activity shell, checked by a unit test
Stage: Build · Status: open · Needs: N1 · Assigned: —
Done = flag `androidShell` (default false) in `src/flags.ts`; the `android/` project from archived PR #727 (head `a9dca20dfc99c153c5d5a41bfc268301907bf0ba`, "AND-3", Android Browser Helper 2.7.3, package `io.github.mymayankyadav.lemma`, launch `/lemma/`, shortcuts Review, Approve, Atlas) is ported into `android/**` on a new branch; `android/scripts/check-shell.mjs` is run by a new vitest file `tests/unit/android/twa-shell.test.ts` that fails on a mutated manifest (wrong package, missing asset-links entry, missing `/lemma/` launch URL); `docs/android/assetlinks.template.json` stays valid for `tests/unit/lib/platform.test.ts`. Any web-side behaviour is behind `androidShell`.
Scope: android/**, .gitignore (Android lines only), src/flags.ts, tests/unit/android/**, tests/unit/flags.test.ts, CURRENT.md.
Not: `.github/workflows/android.yml` (protected: the unsigned bundle build is an OWNER DECISION in the priority report), the non-Android files in #727 (cold-route performance work), signing keys or secrets, new npm dependencies, Gradle wrapper changes beyond what #727 has.

## N8 Android: store listing kit and privacy page
Stage: Build · Status: open · Needs: N7 · Assigned: —
Done = from archived PR #726 (head `88aff0eb36dc8f0627e5b06747ff89b21c53b751`, "AND-4") only these files are ported: `docs/android/listing.md`, `public/privacy.html`, `scripts/play-shots.mjs`, `scripts/play-png.mjs`, `docs/android/shots/*.png` (all eight), `tests/unit/android/play-png.test.ts`; `node scripts/play-shots.mjs --verify` exits 0 on main's files and a unit test shows it exits non-zero on a corrupted PNG, a listing over its length limits, or a privacy page with an external resource. Privacy page is served at `/lemma/privacy.html` in the production build.
Scope: docs/android/**, public/privacy.html, scripts/play-shots.mjs, scripts/play-png.mjs, tests/unit/android/**, CURRENT.md.
Not: any other file from #726 (it carries unrelated cold-route changes), `scripts/review-shots.mjs`, e2e specs, `.github/**`, claims about AI outcomes in the listing text.

(More items are added by the priority run. Next free ID: N9.)
