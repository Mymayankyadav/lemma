# N121 execution plan: fix the 9 Nov 2026 v6 UI audit in one PR

- **Owner task (exact words):** "We will address the audit report by first making a plan then executing this plan and uploading just one pr with all the redressals."
- **Item:** N121 (block added to `NEXT.md` in the same commit as this plan). **Agent name for this conversation:** `chat-110926#m3vq`. Keep this name for every PR line, verdict, Ready and run-log comment.
- **Branch:** `ccr-035732f3-rhtvo4` (this session's branch; `scope` does not check branch names). Base: `main` at `f46de0a`, the build the audit tested.
- **Inputs in this folder:** `AUDIT.md` (the audit), `annotated/` (marked-up evidence A01–A08 and C01–C03), and `reproduce/` (the auditor's Playwright scripts plus `seed.json`, a realistic month of demo data anchored on 2026-11-09 IST). The full 600-image screenshot set is in the Owner's zip `lemma-ui-audit-2026-11-09.zip` and is not in the repo.
- **Planner's verification:** every cause the audit names was checked against the code at `f46de0a`. The causes and line numbers below are confirmed unless a work package says otherwise.

---

## 0. Read this first

### 0.1 What to read, in order
1. `AGENTS.md` (rules v2.0). You must comply with it; the key points for this PR are in §0.3.
2. This plan, then `AUDIT.md` (§3 Top 15, §4 X1–X15, §5 Calendar, §6 per screen, §9 fix list).
3. `docs/current/N110.md`, `N119.md` and `N120.md`: how the v6 mockup port is wired (`src/ui/v6/mockup.css` is generated, and repo glue lives in `src/ui/v6/mockup-bindings.css`).
4. `docs/v6/prototype/source/MAP.md`. The mockup runtime `docs/v6/prototype/source/owners/lemma-native-calendar-runtime.js` and `styles/calendar.css` already contain the designs for the Calendar time grid, block dialog, overlap resolution and modal structure that this plan ports.

### 0.2 What "done" means
Every finding in `AUDIT.md` is either fixed or **explicitly waived with a reason** in `docs/current/N121.md`. That includes the Top 15, X1–X15, every §5 Calendar point, every numbered §6 item, §7 and F1–F14. Each Blocker and Major has a regression test that fails on `f46de0a` and passes with the fix. Everything ships in **one PR**, titled `N121 Fix the 9 Nov v6 UI audit in one PR`.

### 0.3 Hard constraints (breaking any of these fails CI or the rules)
1. **Tests:** never delete, skip (`.skip/.only/fixme/todo`) or loosen a test. If a fix deliberately changes UI that a test pins, rewrite the test steps to drive the new UI. Keep or increase the number of `expect(` calls in that file (`scope` warns on a drop), keep the test's name, and list the file in the PR body. §3.3 lists the tests known to need this.
2. **Flag-off screens unchanged:** `src/ui/Sheet.tsx`, `src/ui/Toast.tsx`, `src/features/proposals/Page.tsx`, `src/features/card/Page.tsx`, `src/features/insights/Page.tsx` and `src/features/atlas/Page.tsx` also render the legacy app. Branch on `isFlagOn('v6Shell')` in components and scope CSS under `:root[data-v6]`. Do **not** change `src/lib/text.ts` formatters, because legacy screens and tests use them; add new v6 helpers instead.
3. **Protected paths:** never edit `AGENTS.md`, `.github/**`, `ci/**`, `scripts/ci/**`, `playwright.config.ts`, `vitest.config.ts` or the stress/qa3 budget scripts (`ci/protected.json`).
4. **No `supabase/**` changes** (no migration, no Edge Function). Everything below is achievable with the existing contracts. Calendar blocks already carry `subjectId/projectId/checkpointId/sessionId/taskId` (`src/data/study/contract.ts:73-100`), and deadlines have `completeDeadline` (`src/data/deadlines/contract.ts:37`). If you think you need SQL, stop and record a waiver instead.
5. **Do not touch `src/flags.ts`** (a `name: true` line there forces a review). Do not touch `docs/v6/screens/**`, which is guarded by `tests/unit/docs/mockup-screens.test.ts`.
6. **No new dependencies.** Drag and resize use native pointer events.
7. **Release-audit invariants** (`tests/e2e/v6-release-audit.spec.ts`, 23 routes × 320/360/390 px × Day/Night × 200 % text). On every route except `/sign-in`:
   - the header renders;
   - `navigation "Main navigation"` has **5 links in the accessibility tree** (so the nav must stay displayed on `/projects/new` and `/review/run`);
   - `navigation "Page actions"` is visible;
   - there is no horizontal overflow and no uncaught exception;
   - no text in `#main-content` starts with "Loading";
   - there is no region named "… loading" or "… unavailable" and no error copy.
8. **Today DOM budget:** fewer than 1,500 elements on `/` under `?demo=stress` (`tests/e2e/v6-shell.spec.ts`). Cap new Today lists at 3 rows plus an "N more" link.
9. **NEXT.md:** the N121 block is already added. Do not edit any other block, the preamble or the trailer. The stale N119/N120 blocks and the "Next free ID" line belong to the priority run.
10. **Safety:** never force-push and never push to `main`. Keep secrets out of code and comments.

### 0.4 Decisions taken (Owner: override any of these before execution starts)
| # | Decision | Why |
|---|---|---|
| D1 | Where the audit and the mockup PNGs disagree, the **audit wins** if the mockup version is unusable or wrong; otherwise keep the mockup look. List every visible deviation from `docs/v6/screens/` in the PR body for the design reviewer. | The audit says "the mockup is not the reference here", but the design-review gate still compares captures to the mockup. |
| D2 | Calendar Day and Week become a **real time grid**, ported from the mockup runtime (`cr-time-grid`). On phones the Week grid **fits the viewport** (7 narrow columns) instead of the mockup's 800 px sideways scroller. | Fixes §3.3, §5 and F11; the sideways scroller is what the audit criticises. |
| D3 | Transient sheets and dialogs hide the nav and dock, as the mockup does (`mockup.css:221`). The **route-level New path sheet keeps the nav and sits above it.** | Unblocks every sheet button, and keeps the release audit's "5 nav links on `/projects/new`" check. |
| D4 | `/review/run` keeps the nav (release audit). The grade buttons move into a sticky bar in the thumb zone above the nav. | The audit wants the grades in reach, and the release audit forbids hiding the nav there. |
| D5 | `/kit` is registered only in builds that honour flag overrides (dev, test, e2e). It is **not** registered in production. | Kit 1. e2e builds set `VITE_ALLOW_FLAG_OVERRIDES=1`, so `kit.spec.ts` and the release audit keep passing. |
| D6 | The plan-proposal JSON draft editor stays for live (UUID) proposals but sits in a collapsed "Edit before approving (advanced)" disclosure. It is hidden, with no error, where drafts are unavailable (demo ids). | Removes "Expected a UUID" and the JSON-first UI while keeping `tests/unit/plan-proposal-v6/editor.test.tsx` meaningful. |
| D7 | Single Inbox Approve/Reject gets the same 6-second Undo window as batches, and pending decisions are flushed on unmount and `pagehide`. | X9. `approveProposal` returns no action number, so a real undo afterwards is not possible. |
| D8 | Progress has one range control: Today · 7 days · 30 days · 90 days. The URL `range` still accepts `day|week|month|7|30|90`. "Total logged time" (saved focus) is the headline everywhere, and tutor-session time is labelled as such. | §3.5 and F10. `?range=day` and `?range=7` are used by e2e tests. |
| D9 | The PR is opened **once, at the end**, when every phase is complete and verified locally. WIP is pushed to the session branch at phase ends; with no PR open this runs no CI. | The Owner asked for one PR with everything. AGENTS.md's "PR is the claim" is safe to defer because N121 exists only on this branch. |
| D10 | Audit evidence lives in `docs/v6/ui-audit-2026-11-09/` and stays in the PR as the record of what was fixed (about 0.7 MB, ignored by the test map). | The reviewer and later agents can trace each fix to its finding. |

### 0.5 Workflow
- `npm ci` once. Do **not** run `playwright install`: the global Playwright 1.63.0 matches the pinned version, and `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is already set.
- Work phase by phase, A → I, then §3–§5 (tests, captures, docs, PR). At the end of each phase:
  - run the gate in §3.4;
  - commit locally with message `N121 phase <X>: <summary>`, ending with the attribution lines your session's system reminder specifies;
  - push to `origin ccr-035732f3-rhtvo4` (retry on network errors with 2/4/8/16 s backoff).
- Use the TodoList to track work packages.
- Run log: at the start of the execution run, post the Plan comment on the closed issue `run-log: chat-110926` (format in §5.5); at the end, edit it to add the Result.
- If the run must stop before everything is done, push, leave the PR unopened, and write the remaining work packages into the run-log Result. A later run continues from the branch.

---

## 1. Traceability: audit finding → work package

| Audit reference | Severity | Work package |
|---|---|---|
| §3.1, X1, F1 (sheet actions under nav; sheets do not scroll) | Blocker | A1 |
| §3.2, X2, F2 (modals glued top-left) | Major | A2 |
| §3.3, §5.1, §5.3, F11 (no direct manipulation) | Major | B3, B4 |
| §3.4 (developer tools as screens: planner, Time log, plan proposal, due details) | Major | B8, D5, E2, B1 |
| §3.5 (contradictory numbers: Progress totals, break vs paused, concept counts, 4.5 s/card, overdue) | Major | D1, A5, E5, C4, B1 |
| §3.6, X6, F7 (Today ignores today) | Major | C1, C2 |
| §3.7, X4, F4, F5 (raw machine formats) | Major | A3, A4 |
| §3.8, X3, F3 (zero padding; sheet under header) | Major | A1 |
| §3.9, X5, F8 (unreachable features) | Major | A6, C2, C7 |
| §3.10, X8, F6 (overdue pile; overdue maths) | Major | B1 |
| §3.11 (mixed control language, colours, clipped "16") | Minor | A8, D4 |
| §3.12 (redundant navigation and duplicated content) | Minor | A6, D1, F3–F7, E1, E4, C3 |
| §3.13 (three routes titled "Lemma") | Minor | A6 |
| §3.14 (desktop is a stretched phone) | Minor | H1 |
| §3.15, F13 (demo first impression) | Minor | G1, G2, E2 |
| X7 (contradictory metrics) | Major | D1, A5, E5, C4 |
| X9 (no Undo; toast covers actions) | Minor | A7 |
| X10 (manual Refresh buttons) | Minor | B7, B8, F10, F11, E2 |
| X11 (buttons with no gap) | Minor | A8 |
| X12 (destructive styling and placement) | Minor | A8, B2, E4 |
| X13 (field errors not attached) | Minor | A2 |
| X14 (accessibility: KaTeX names, label mismatch, 18 px link, 11 px text) | Minor | I1, I2, D5, B5 |
| X15 (engineer copy) | Minor | I3 (copy table) plus the owning WPs |
| §5.2 Agenda / Day / Week / Month / Navigation / Planning tools / Planner / Block dialog | Major/Minor | B6 / B3 / B4 / B5 / B7 / B7 / B8 / B2 |
| §6 Today 1–10 | Major/Minor | C1 (1, 3), C3 (2, 4, 5, 8), C4 (6), C5 (7), I3 (9 glyph), A8 (10) |
| §6 Focus 1–7 | Major/Minor | A5 (1, 2), C6 (3–6) |
| §6 Paths 1–6 | Minor | F1 |
| §6 New path 1–5 | Major/Minor | A1 (1, 2, 5), F2 (3, 4, 5) |
| §6 Path detail 1–6 | Minor | F3 |
| §6 Checkpoint 1–4 | Minor | F4 |
| §6 Tutor session 1–4 | Minor | F5 |
| §6 Review 1–6 | Major/Minor | F6, C4 |
| §6 Review round 1–4 | Minor | F7 |
| §6 Review complete 1 | Minor | F8 |
| §6 Inbox 1–7 | Blocker/Major/Minor | A1 (1), E1 (2, 3, 5, 6), A7 (4) |
| §6 Plan proposal 1–3 | Major/Minor | E2 |
| §6 Cards 1–5 | Blocker/Major/Minor | A1 (1, 5), E3 (2–5), A2 (4) |
| §6 Card detail 1–5 | Blocker/Major/Minor | A1 (1, 2), E4 (3–5) |
| §6 Concept map 1–5 | Major/Minor | E5 |
| §6 Progress 1–10 | Major/Minor | D1 (1, 3, 7, 10), A4 (2), D2 (4), D3 (5, 6), D4 (8, 9) |
| §6 Settings 1–4 | Minor | F9 |
| §6 Tasks 1–6 | Major/Minor | A6 (1), F10 (2–5), A2 (6) |
| §6 Time log 1–4 | Major/Minor | D5, A6 |
| §6 Practice 1–4 | Major/Minor | A6, F11, I2 |
| §6 Close the day 1–2 | Major/Minor | C7, A6 |
| §6 Sign-in 1–3 | Minor | F12 |
| §6 Kit 1 | Minor | A6 (D5) |
| §7 320 px (select truncation, sheet under header, 0 px modal margin) | Minor | A8, A1, A2 |
| §7 1280 px (no desktop layout) | Minor | H1, A2 |
| §7 stress (Inbox 1 of 149, single-project subjects, 1500 vs 1498, link gutter, identical cards) | Major/Minor | E1, F1, E5, E3 |
| F12 (review estimate) | Minor | C4 |
| F14 (Kit; redundant back buttons and headings) | Minor | A6, F3–F7 |

---

## 2. Work packages

Each work package (WP) lists **Findings → Now (confirmed cause) → Change → Tests → Accept**. File references are to `f46de0a`.

### Phase A: shared foundations (do first; they unblock most screens)

#### A1. Sheets: structure, padding, scrolling, stacking, reachability
- **Findings:** §3.1 (Blocker), §3.8, X1, X3, F1, F3; New path 1, 2 and 5; Cards 1 and 5; Card detail 1 and 2; Inbox 1; §7 (New card under the header at 320 px).
- **Now:**
  - `src/ui/Sheet.tsx:34-38` renders the grip, title row and `children` directly inside `.ui-sheet`.
  - `src/ui/v6/mockup.css:309` sets `.ui-sheet{padding:0;overflow:hidden}` and expects `.ui-sheet-header` and `.ui-sheet-body` children (`mockup.css:310-321, 354, 649`). The result is zero padding and no scrolling.
  - The overlay is `z-40` (`Sheet.tsx:30`), below the page header (`[data-ui=page-header]{position:relative;z-index:65}`), so the header draws over the sheet.
  - `src/ui/v6/mockup-bindings.css:47-48` forces the nav visible over **every** modal sheet, overriding the mockup rule at `mockup.css:221`.
- **Change:**
  1. In `Sheet.tsx`, under the v6 branch only (keep the legacy JSX byte-for-byte), render the mockup structure: `.ui-sheet` > `.ui-sheet-header` (`h2.ui-sheet-title` + 44 px Close) > `.ui-sheet-body` (children, scrolls) > optional `.ui-sheet-footer` (new prop `footer?: ReactNode`). In v6, drop the grip and the `drag="y"` swipe-to-close, which fights the scrolling body; close with ✕, Escape or backdrop tap.
  2. Add `.ui-sheet-footer` CSS in `mockup-bindings.css`:
     - flex none, top border `--hair`, padding `12px 20px calc(12px + env(safe-area-inset-bottom))`;
     - 8 px gap; buttons `min-height:48px; flex:1`; the primary action on the right;
     - destructive actions on the left with the `lemma-destructive` style (A8).
  3. Move each sheet's primary actions into `footer`:
     - New card (`cards/v6/V6Cards.tsx:156`): Create card, Cancel.
     - Edit card (`card/Page.tsx:521-531`): Save changes, Cancel.
     - Delete card confirm (`card/Page.tsx:532-551`): Cancel, Delete card.
     - Inbox card editor (`proposals/Page.tsx` ~`:620-660`): Cancel, Approve.
     - New path (`new-project/Page.tsx:117-162`): Create path. "Copy prompt for your tutor" stays in the body.
     - Settings v6 sheets (`settings/v6/StudyDefaults.tsx:184-193`, `settings/v6/Page.tsx`).
     - Check every other `<Sheet>` in v6 code paths: `atlas/*`, `checkpoint/Page.tsx`, `session/Page.tsx`, `project/ProjectSwitcher.tsx`, `review-run/Page.tsx`, `plan-proposal/Page.tsx`.
  4. Stacking: give the v6 sheet overlay `z-index:100` (above header 65, menus 90, nav 50 and dock 49). Raise the toast layer to 110 (A7). Document this scale in a comment in `mockup-bindings.css`.
  5. Delete the override at `mockup-bindings.css:47-48`. Add `Sheet` prop `route` (renders `data-sheet-route`), used only by New path.
     - CSS: `body:has(...)` keeps `nav[data-ui=main-navigation]` displayed (dock still hidden), and the route sheet's overlay ends at `bottom: var(--lemma-nav-height)`.
     - Specificity: `mockup.css:221` is `:root[data-v6] body:has([role=dialog][aria-modal=true]) nav[data-ui=main-navigation]` (0,5,2). The override must match or exceed it, e.g. `:root[data-v6] body:has(.ui-sheet[data-sheet-route][aria-modal=true]) nav[data-ui=main-navigation]{display:flex}` (0,6,2), and it relies on `mockup-bindings.css` loading after `mockup.css` (`AppShell.tsx:10-11`). Do not use `!important`.
     - Every other sheet hides the nav and dock (the existing `mockup.css:221` rule).
  6. Sheet height: `max-height: calc(100dvh - max(16px, env(safe-area-inset-top)))`, minus `--lemma-nav-height` for the route sheet. The body has `overscroll-behavior: contain`, so the page behind never scrolls (Cards 5).
- **Tests:**
  - New e2e "N121 A1 sheet actions receive taps" (§3.1, matrix 320×640, 375×667, 390×844, 412×915, Night). Run it for: New path (`/projects/new`: Create path); New card (`/cards?new=1`: Create card, Close); Edit card (`/cards/7` → Edit card: Save changes); Delete card (Cancel, Delete card); Inbox Edit (`/proposals` → Edit: Approve).
    - Assert with `await btn.scrollIntoViewIfNeeded(); await btn.click({trial:true, timeout:3000})`, which runs Playwright's hit-target check.
    - Assert that the sheet title is the top element at its centre (`elementFromPoint`).
    - Assert that the computed padding-left of `.ui-sheet-body` is ≥ 16 px.
  - Unit `tests/unit/ui/sheet-v6.test.tsx`: the v6 structure has a body and footer, Escape closes it, and with the flag off the old DOM is unchanged (snapshot of class names).
- **Accept:** the auditor's `reproduce/covered.cjs` reports "all controls reachable" and "sheet scrolls: true" for every case at 390×844 and 375×667.

#### A2. Native dialogs: one primitive, centred on desktop, bottom sheet on phones
- **Findings:** §3.2, X2, F2, X13; block dialog layout (§5.2); Cards 4; Tasks 6; §7 (0 px left margin at 320; pinned top-left at 1280).
- **Now:** `src/features/tasks/TaskSheet.tsx:104-106`, `src/features/calendar/block-sheet/BlockSheet.tsx:156`, `src/features/cards/v6/CardFiltersSheet.tsx:63` and `src/features/planner/Sheet.tsx:183-185` call `showModal()` on Tailwind-sized `<dialog>`s. Tailwind preflight sets `margin:0`, which removes the UA `margin:auto` centring.
- **Change:**
  1. Add `src/ui/v6/Dialog.tsx`, a native-`<dialog>` wrapper with the mockup modal structure (`styles/calendar.css:1456-1506`; runtime `modal()` l.315-348). It uses the existing `dialog.lemma-native-sheet` CSS (`mockup.css:859-866, 938-939`): a bottom sheet below 700 px and centred at 700 px and above.
     - Structure: `.ui-sheet-header` (optional uppercase eyebrow, `h2`, Close), `.ui-sheet-body` (scrolls), `.ui-sheet-footer`.
     - Props: `title`, `eyebrow?`, `footer`, `onClose`, `busy` (blocks Escape and Close while saving), `labelledBy`.
     - It adds `html.lemma-native-sheet-open` while open, so `mockup.css:221` hides the nav and dock. It returns focus to the opener.
  2. Migrate TaskSheet, BlockSheet (B2), CardFiltersSheet, the planner (B8) and the Time log editors (D5) to it.
  3. Add a safety net in `mockup-bindings.css`: `:root[data-v6] dialog:modal:not(.lemma-native-sheet):not(.project-action-dialog){margin:auto}`.
  4. Field errors (X13): each invalid field gets `aria-invalid="true"` plus `aria-describedby` pointing at an inline error directly under it, as in the mockup runtime's `lemma-field-error`. The form-level alert stays only for server errors. Apply this to TaskSheet ("Enter a task title." under Title), BlockSheet, the Time log forms and the goal forms.
- **Tests:**
  - New e2e "N121 A2 dialogs are centred or full-width": New task, Edit task (`/tasks`), New block, Edit block, Filters (`/cards`) and Plan study tasks.
    - At 390×844: |left − right| ≤ 1 px and top ≥ 0.
    - At 1280×800: |left − right| ≤ 1 and |top − bottom| ≤ 1 unless the height is capped.
    - The primary action passes the trial click.
  - Unit (TaskSheet): an empty title sets `aria-invalid` on Title, and the error text is that field's description.
- **Accept:** `measurements/desktop-night.json`-style geometry shows equal margins. `annotated/A01`/`A02` can no longer be reproduced.

#### A3. One formatting module for v6 (dates, times, durations, zones)
- **Findings:** §3.7, X4, F4.
  - Calendar Day "GMT+5:30" rows; Tasks 4; Session 1; Time log 1 and 4; Practice 2; Close the day 2; Path detail 3; Progress 5 and 7; Focus 5.
  - Review round 2 ("1.6mo"); Card detail 4; mixed 12 h/24 h.
  - The zone spelled `Asia/Calcutta` and `Asia/Kolkata`.
- **Change:** add `src/lib/format.ts`, used by v6 code only (leave `src/lib/text.ts` alone):
  - `ownerZone(settings?)`: `settings.timeZone`, else the device zone, passed through `canonicalZone()` (alias map: `Asia/Calcutta`→`Asia/Kolkata`, `Asia/Saigon`→`Asia/Ho_Chi_Minh`, `Asia/Katmandu`→`Asia/Kathmandu`, `America/Buenos_Aires`→`America/Argentina/Buenos_Aires`, `Europe/Kiev`→`Europe/Kyiv`). Use one hook, `useOwnerZone()`, in Calendar, Today, planner, Time log, Practice, Close the day and Progress, so computations and labels agree.
  - `formatDay(dayOrInstant, {zone, now})`: "Today", "Tomorrow", "Yesterday"; a weekday name within ±6 days ("Wed"); otherwise "Mon, Nov 16" (the mockup order, as #1331), plus the year only when it differs.
  - `formatTime(instant, {zone, clock24h})`: "19:30" or "7:30 pm"; never seconds; follows Settings `clock24h` everywhere (calendar, conflicts, focus, planner).
  - `formatTimeRange` gives "19:30–21:00". `formatDateTime` gives "Thu, Nov 12 · 10:00", with relative words when near.
  - `formatDuration(minutes)`: whole minutes, in the forms "45 min", "1 h 30 min" and "49 h". It never uses decimals or "m".
  - `formatInterval(days)` for review intervals, stability and cadence: "10 min", "3 days", "4 weeks", "2 months", "1.5 years". It never uses "mo" or "d".
  - `formatZone(zone)`: the short name ("IST"), shown only where a record's zone differs from the owner zone (and in Settings).
- **Apply to:**
  - Calendar (all views, conflicts, due details, block dialog), planner, Tasks, Practice, Time log, Close the day, Path detail (target date), Session (timeline times), Checkpoint;
  - Progress goals (ISO ranges and "Asia/Kolkata" on every card), Card detail (stability, next review), Review round grade labels ("Again 10 min · Hard 30 days · Good 1 month · Easy 2 months");
  - Focus (finish time), Today.
- **Tests:**
  - Unit `tests/unit/format/format.test.ts`: aliases; 12/24 h; relative days across midnight in `Asia/Kolkata` and `America/New_York`; a DST day; interval words; no seconds.
  - New e2e "N121 A3/A4 no raw machine formats": visit every v6 route of the release audit **plus** the opened sheets and dialogs. Apply the regexes from `reproduce/measure2.cjs` to visible text (ISO instants, ISO dates, slash dates with seconds, UUIDs, `subject-|project-|checkpoint-` ids, `Asia/…`, `GMT±`) and expect none. Allowed exceptions are Settings › time zone and the export file names; list them in the test.

#### A4. Human labels, never ids, slugs or enum codes
- **Findings:** F5 and X4.
  - Progress 2 ("subject-analysis").
  - Due details print project and checkpoint ids (`calendar/deadlines/DueDayItems.tsx:53-55, 68`).
  - Plan proposal 2 (slug "real-analysis"); Checkpoint 3 ("yes", "paused", "explanation · partial", "hint · Hint 2").
  - Planner reasons `too_long|after_due|no_estimate|no_capacity` (`planner/model.ts:46`; printed at `planner/Sheet.tsx:231-234`).
  - Time log "Rating: Unknown"; Cards "Type: basic", "Kind: other"; Card detail "Addressed by claude".
  - Inbox legend `group.project.replaceAll('-',' ')` (`proposals/v6/Selection.tsx:60`); "∫ CP4·S7" codes; Paths "Now CP4 Compactness".
- **Change:** add `src/lib/labels.ts` (pure maps plus small hooks over the existing `useSubjects()`/`useProjects()` in `src/data/hooks.ts`):
  - `subjectName`, `projectTitle(idOrSlug)`, `checkpointTitle` (title first, code second and quiet, e.g. "Compactness · CP4");
  - `unplacedReasonText` (sentences such as "Needs an estimate", "Longer than your longest sitting; split it or raise the limit in Settings", "Due before the first free slot", "No free time left in these days");
  - `sessionStatusText`, `evidenceText`, `noteKindText`, `cardTypeText`, `ratingText` ("Not rated" or "1 · Scattered" … per existing semantics), `clientName` ("Claude", "ChatGPT").
  - An unknown code renders a generic sentence, never the code.
- **Tests:** unit `tests/unit/labels/labels.test.ts`. The A3 e2e scan covers ids.

#### A5. One focus status everywhere
- **Findings:** §3.5 ("On a break" vs "Paused"); Focus 1 and 2.
- **Now:** three different derivations:
  - `src/features/focus/TodayFocus.tsx:272` checks break first;
  - `src/app/FocusAccessory.tsx:48` checks the server entry's `phase`, then paused;
  - `src/features/focus/V6FocusDialog.tsx:72-73` checks finishing, then paused, then break.
- **Change:** add `src/lib/focus/status.ts` with `focusStatus(stateOrEntry, now)` → `{label, tone, remainingMs, phaseMs, phase}`.
  - Single precedence: finishing → paused → break/long break → focus. A paused break reads "Paused · break".
  - Use it in all three places.
  - During a break, the big clock and the dock show the **break** countdown with the caption "Break · 5 min", not the frozen focus clock.
- **Tests:**
  - Unit `tests/unit/focus/status.test.ts` (precedence table).
  - e2e: start a Pomodoro, take a break, then assert that the Today card and the dock show the same label and that the clock decreases across 2 s (use `page.clock`).

#### A6. Titles, menus and reachable routes
- **Findings:** §3.9, §3.13, X5, F8, F14, Kit 1; Tasks 1 and 5 (double heading); Practice 1 and 2; Time log 3; Close the day 1 and 2; "+ → Time block" only opening `/calendar`.
- **Now:** `src/app/V6Header.tsx:11-16` lacks `/log`, `/practice` and `/today/close`; the ⋯ menu (`:44`) lists only Concept map, Card library and Settings; Add → Time block is a plain link (`:40`). Routes: `src/app/App.tsx:28-34`, `src/app/routes.tsx` (`/kit` always registered).
- **Change:**
  - **Titles.** Add `'/log':'Time log'`, `'/practice':'Practice'` and `'/today/close':'Close the day'`.
  - **In-page duplicates.** Make the duplicate in-page `h1`s `sr-only`: `tasks/Page.tsx:114`, `practice/Page.tsx:159`, `time-log/Page.tsx:198-199` (also remove its "Today" link) and `ritual/Page.tsx:108-109` (also remove "Back to Today").
  - **⋯ menu.** It lists, in this order: Tasks, Practice, Time log, Close the day, Concept map, Card library, Settings. Keep `lemma-landscape-destination` links and the compact-header Inbox/Add block.
  - **Add → Time block.** It goes to `/calendar?new=block`, which opens the block dialog prefilled with the next half hour (B2), mirroring `/cards?new=1`.
  - **Kit.** Register `/kit` only when `import.meta.env.DEV || import.meta.env.MODE==='test' || import.meta.env.VITE_ALLOW_FLAG_OVERRIDES==='1'`. Do this by **filtering in `src/app/App.tsx:25`** (`...screenRoutes.filter(r => r.path !== '/kit' || devToolsAllowed)`). **Do not edit the `/kit` entry in `src/app/routes.tsx`**: `tests/unit/app/routes-lazy.test.ts` reads that file as text and requires exactly 18 `path: '` entries, `const Page17=lazy(()=>import('../features/kit/Page'))` and `{path: '/kit', element:`. Do not edit `src/flags.ts`.
- **Tests:**
  - Unit `tests/unit/app/v6-header.test.ts`: add assertions for the three titles.
  - e2e: the ⋯ menu shows the four new links, and each opens a page whose header `h1` is not "Lemma".

#### A7. Toasts and Undo
- **Findings:** X9; Inbox 4.
- **Now:**
  - `src/ui/Toast.tsx:77` pins toasts at `bottom: calc(108px + safe-area)`, on top of the Inbox action bar.
  - `src/features/proposals/Page.tsx:339-356` approves immediately and toasts "Approved" with no Undo.
  - The batch path (`:299-336`) stages for 6 s but drops the decision if the page unmounts.
- **Change:**
  - In v6, place the toast layer at `bottom: calc(var(--lemma-bottom-chrome) + var(--lemma-toast-lift, 0px) + 12px)`, with `--lemma-toast-lift` set to the action-bar height when `body:has([data-ui=proposal-actions])`. Use z-index 110.
  - Single Approve/Reject: advance to the next card at once, toast "Approved · Undo" for 6 s, then commit.
  - Flush staged single and batch decisions on unmount and `pagehide`, so a decision is never lost.
- **Tests:**
  - Unit (proposals v6):
    - Approve shows a toast whose action is Undo.
    - Undo within 6 s makes no API call.
    - Unmount flushes exactly one call.
    - The batch flushes on unmount.
  - e2e: the toast's bounding box does not intersect `[data-ui=proposal-actions]`.

#### A8. One control language (CSS, `:root[data-v6]` only)
- **Findings:** §3.11, X11, X12; Today 8 and 10; Review 5; Settings 4; Progress 5; Path 1; Practice 4; Concept map 4; §7 (select truncation at 320).
- **Change** (in `mockup-bindings.css` unless a component must change):
  - **Disclosures.** For every disclosure-style `details>summary` inside `#main-content` and sheets (Today's plan, Queue details, Timer details, Decks & options, Key, Time conflicts): `list-style:none`, hide `::-webkit-details-marker`, and add the app chevron (CSS mask) that rotates when open. Exclude menu triggers, which keep their own icon: the header cluster (`[data-v6-header] details`), Planning tools and row ⋯ menus. Mark disclosures with a class such as `lemma-disclosure` rather than styling every `summary`.
  - **Native `<select>`.** Style it like the other fields (control edge, 8 px radius, chevron), with `text-overflow:ellipsis` and a full-width option list. Labels never wrap off-screen at 320.
  - **Segmented controls.** Use one filled-pill style. Appearance's underline variant becomes the pill; the Progress 7/30/90 buttons become the one segmented control (D8).
  - **Action rows.** Gap ≥ 8 px in action rows and chip rows: Path "Switch path · Concept map" (`project/v6/V6Project.tsx:123`), Practice "Show archived · Refresh", Atlas row actions (`064`), with 12 px inline padding inside buttons.
  - **Destructive actions.** One `lemma-destructive` style (danger text and border, tint fill) for Delete block, Delete card, Delete goal and Void entry. Never place it first in a row; it is always confirmed.
  - **Form labels.** One label style everywhere (500 weight, `--ink-2`).
  - **Colours.** Goal bars and Progress charts use tokens (`--accent`, plus distinct `--good`/`--easy`; add tokens to `src/ui/v6/tokens.css` if missing, and check the N19 contrast test still passes). Drop the raw green.
- **Tests:** e2e computed-style checks (summary `list-style-type: none`; Path chip gap ≥ 8 px; destructive buttons carry the class).

### Phase B: Calendar

#### B1. Overdue against today; one overdue banner; due items you can act on
- **Findings:** §3.5 (overdue relative to the viewed day), §3.10, X8, F6; §5.1 "Act on an overdue deadline"; Agenda Majors; ids in due details (C03).
- **Now:**
  - `src/features/calendar/deadlines/DueDayItems.tsx:21-38` moves anything due before `firstVisible` onto the first visible day and sets `overdue: due < firstVisible`.
  - `detail()` prints `projectId` and `checkpointId` (`:53-55, :68`).
- **Change:**
  - `dueForDay(date, today, zone, dues)`: an item appears only on its own due day. Set `overdue = due < today`, using today in the owner zone (A3) and never the viewed range.
  - Add `OverdueBanner` (all views, under the date navigator, when anything is overdue against today). Collapsed, it reads "4 overdue · Monoids and groups, Sets, maps…". Expanded, it lists items with actions:
    - owner deadline: **Done** (`getDeadlineApi().completeDeadline(id, version)`, Undo toast via `reopenDeadline` if the contract has it), and **Open path** (link to `/p/<slug>` or `/p/<slug>/cp/<code>` when linked);
    - projected deadline: Open path only;
    - practice topic: **Practice now** (`/practice#topic-<id>`).
    - **Hide until tomorrow** (localStorage key `lemma.v6.overdue-hidden.<ownerDay>`, wrapped in try/catch).
  - Due details use names (A4) and formatted dates (A3), e.g. "Real Analysis · Compactness · CP4", "Due Sun, Nov 15", "About 1 h 30 min of work left".
- **Tests:**
  - Update `tests/unit/calendar/deadlines-practice.test.tsx`: an item due 15 Nov seen from the week of 16 Nov when today is 9 Nov is **not** overdue; overdue items appear once, in the banner; no ids in details.
  - New e2e (frozen clock 2026-11-09 13:43 IST, `reproduce/seed.json` loaded as a fixture): next week shows no "Overdue"; the banner lists exactly the four overdue milestones; Done removes one.

#### B2. Block dialog
- **Findings:** §5.2 Block dialog (off-centre; 09:00 default already past; no path, task or checkpoint field; zone subtitle; no title placeholder; Delete styled like Save); §5.1 "Create a block" and "Link a block".
- **Change** (`calendar/block-sheet/BlockSheet.tsx` on the A2 Dialog):
  - Title "New time block" / "Edit time block"; eyebrow "CALENDAR · NOV 9" (mockup runtime l.329-341).
  - New props `initialStart?`, `initialMinutes?`. The default start is the tapped slot, else the **next half hour** when the date is today, else 09:00 on that date. Duration presets 25 / 50 / 90 min (`cx-block-duration`) plus an End time field.
  - Fields:
    - Title, with placeholder "e.g. Compactness problems";
    - Type (Study / Busy) as a segmented control;
    - Date, Start and End as separate `type=date` and `type=time` inputs, converted with the existing `instantInZone()` in the owner zone;
    - **Path** (active projects), **Checkpoint** (optional, filtered by path; needs the path's checkpoints from the existing project hook) and **Task** (optional, open tasks via `getTaskApi()`). Save `projectId`, `subjectId` (from the project), `checkpointId` and `taskId`.
  - Show the zone note only when the block's `timeZone` differs from the owner zone.
  - Delete sits in the footer on the left with the destructive style, plus an inline confirm (Delete / Keep).
  - `/calendar?new=block[&start=ISO]` opens the dialog (used by Add → Time block and tap-to-create).
- **Tests:** update `tests/unit/calendar/block-sheet.test.tsx`:
  - default start not in the past at 13:43;
  - links saved through `createCalendarBlock`;
  - delete needs a confirm.

#### B3. Day view: a real time grid with direct manipulation
- **Findings:** §3.3, §5.1, §5.2 Day (a 24-row table, "GMT+5:30" on every row, blocks only in their start hour, ~100 px columns that split words, stacked Move/Done/Delete, no now line, overlap unmarked, always-open Add form, Free counted over 24 h), §5.3, F11.
- **Now:** `src/features/calendar/Page.tsx:276-335`; `model.ts` `daySlots`/`dayCapacity`.
- **Change:** add `src/features/calendar/grid/`, porting the mockup's spatial grid (runtime l.186-221 and 775-840; `styles/calendar.css` l.1406+ and 1663+):
  - `layout.ts` (pure): visible hours run from min(planning window start, first item) to 24:00. It computes each item's top and height, assigns overlap **lanes** by interval partitioning (`--lane/--lanes`), and clips blocks that cross midnight with a "continues" marker. It is DST-safe, using owner-zone minutes and 23/25-hour days.
  - `TimeGrid.tsx`:
    - **Axis and sizing.** An hour axis in the owner clock, with no zone label on rows (at most one "IST" corner). `--hour` is 64 px on phones and 84 px at 700 px and wider. Planned, busy and logged items sit in **one** column with distinct styles (dashed accent, double rule, solid ✓). A subject colour stripe comes from a deterministic token palette, with a "Key" disclosure.
    - **Now line.** It updates every minute. On open, scroll to now − 1 h (today) or to the first item.
    - **Tap.** Tapping an empty slot opens B2 prefilled (30-min snap). Tapping a block opens its details sheet (time, links, **Start focus**, Edit, Move, Done, Delete).
    - **Drag.** Drag to move with pointer events (touch only from the grip `cr-event-grip`, with `touch-action:none`; mouse anywhere). Drag the bottom edge (`cr-resize-handle`) to resize. Snap to 15 min, auto-scroll near the edges, show a ghost preview, commit through `updateCalendarBlock(id, version, {startsAt, endsAt})` with an Undo toast, and reload with a message on a version conflict.
    - **Keyboard.** Alt+↑/↓ moves 15 min; Alt+Shift+↑/↓ resizes; Enter opens details (mockup `aria-description`).
  - Under the grid: the accessible list "Events for selected day · N" (`cr-event-details`), with per-block buttons named **"Move <title>"**, **"Mark <title> done"** and **"Delete <title>"** (`tests/unit/calendar/page.test.tsx` uses these names). Move opens B2 with the time fields.
  - Remove the always-open "Add a block" form and the hour table. Add "New block" in Planning tools (B7) and the + menu (A6).
  - Day summary: one line, "Logged 40 min · Planned 2 h 45 min · Free 4 h 10 min". Free is computed **within the planning window** (Settings › Planning `window_start/window_end`, `src/data/types.ts:72`): add an optional `window` argument to `dayCapacity` and keep its 24 h default so `tests/unit/calendar/model.test.ts` stays valid.
- **Tests:**
  - New unit tests:
    - `tests/unit/calendar/grid-layout.test.ts`: positions; lanes for 3 overlapping blocks; a 23 h DST day; a midnight-spanning block.
    - `tests/unit/calendar/grid.test.tsx`: tapping 17:00 opens the dialog with 17:00; a drag calls `updateCalendarBlock` once with snapped times; Alt+↓ moves 15 min; Undo restores.
  - Update `tests/unit/calendar/page.test.tsx`:
    - creation goes through "New block" and the dialog (the `maxlength=200` title field now sits in the dialog);
    - "Save move" becomes the dialog's Save;
    - keep every assertion.
  - e2e at 390×844:
    - a 15:00–16:30 block's height is 1.5 × `--hour` (±2 px);
    - no "GMT" text;
    - a now line exists today;
    - a drag of 60 px moves the block by about 1 h and persists after reload.

#### B4. Week view
- **Findings:** §5.2 Week (700 px sideways table, words split mid-syllable, overlap cards overflowing columns, 12 h times inside a 24 h view, header wraps, desktop about 95 px per day); §3.14.
- **Change:** Week uses `TimeGrid` with 7 columns.
  - **Below 700 px:** a 36 px axis plus 7 × `minmax(0,1fr)` columns (about 50 px each at 390), with **no horizontal scroll** (a deliberate deviation from the mockup's `min-width:800px`; list it in the PR body).
  - **Block text.** Blocks show the time when ≥ 30 min tall. The title is one line with `overflow-wrap:normal; word-break:normal; hyphens:none; text-overflow:ellipsis`, so words are never split.
  - **Interaction.** Tap a block for details; tap a day header for the Day view (keep).
  - **Headers.** Sticky day headers read "Mon 9", with the logged total as a small caption ("40m" style replaced by `formatDuration`, kept on one line).
  - **Overlaps** use lanes; the overflowing "Keep both / Attribute to" cards are removed from the columns (the conflict list moves to B5).
  - Times follow `clock24h` everywhere.
- **Tests:**
  - Update `tests/unit/calendar/week-month.test.tsx`.
  - e2e at 390: `scrollWidth ≤ clientWidth` for the page and the grid; every block title element has computed `text-overflow: ellipsis` and `word-break: normal`.

#### B5. Month view and conflicts
- **Findings:** §5.2 Month (every cell "0m · 0 blocks" in 11 px text; rows change height; the conflict list flags logging inside a planned block); X14 (11 px text).
- **Change:**
  - **Month cells** (`views/MonthView.tsx`): the day number, up to 3 dots (planned, logged, due or overdue) and a 4-step logged-minutes tint from tokens. Accessible name per cell, e.g. "Mon, Nov 9: 40 min logged, 4 blocks, 1 due". Fixed row height (`grid-auto-rows:minmax(56px,1fr)`); text ≥ 12 px.
  - **"Time conflicts"** is collapsed by default, with names and formatted times.
  - **Overlap model** (`overlaps/model.ts:14-48`): saved focus that overlaps a planned **study** block is not a conflict, because it fulfils the block, and neither is an entry linked to the block (`calendarBlockId`). Conflicts are block↔block and saved focus↔busy block only. Keep acknowledgements for real conflicts.
- **Tests:**
  - Update `tests/unit/calendar/overlaps.test.tsx`: logging inside a study block gives no conflict; logging inside a busy block gives a conflict.
  - Update `week-month.test.tsx`: no "0m" or "0 blocks" text; cell accessible names.

#### B6. Agenda
- **Findings:** §5.2 Agenda (today's heading hidden; no sticky day header; cards inset 16 px; kinds only distinguishable by border style; no subject colour or legend; the overlap chip is unnamed, untappable and only on the first day; overdue pile).
- **Change** (`Page.tsx:250-262`):
  - **Day headings.** Every day has a visible heading ("Today · Mon, Nov 9"), sticky inside the list with a paper background.
  - **Cards.** Align them with the page grid (remove the extra inset). Add the subject stripe and a kind icon (▱ planned, ◷ busy, ✓ logged, as the mockup meta does).
  - **Overlap chip.** Show one per day, naming the blocks ("Seminar ↔ Problem set"). Tapping it opens **Resolve overlapping blocks** (mockup runtime l.567: Move / Shorten / Keep both), and "Keep both" uses the overlap-acknowledgements API.
  - **Taps.** Tapping a card opens block details.
  - **Due today.** A chip at the top reads "Due today: <title>", as in the mockup capture. Overdue items appear only in the B1 banner.
- **Tests:** unit `page.test.tsx`: today's heading is visible; an overlap chip appears on a non-first day; e2e: tapping an agenda card opens details.

#### B7. Navigation and Planning tools
- **Findings:** §5.2 Navigation (single-day label in Week/Month plus a repeated "November 2026"; Agenda jumps 7 days; 24 px text glyph arrows), Planning tools (stretched summary; a wall of "Edit <title>" buttons in a 224 px scroll box; misaligned actions); X10.
- **Change:**
  - **Date label per view:** Agenda "Nov 9 – 15", Day "Mon, Nov 9", Week "Nov 9 – 15", Month "November 2026" (remove the duplicate month label). Arrows are lucide chevrons in 44 px targets, with accessible names "Previous week/day/month".
  - **Planning tools.** Keep the button (mockup; `tests/e2e/v6-g7-fixes.spec.ts` #1321 checks it) but render it as a right-anchored popover menu, like the header menus, with exactly **New time block** and **Plan study tasks**.
  - **Edit wall.** Remove the "Edit <title>" wall (`block-sheet/BlockSheetActions.tsx:27-34`); editing happens by tapping blocks or through the events list. Keep `BlockSheetActions` as the dialog orchestrator and update `block-sheet.test.tsx` deliberately.
  - **Reload.** Remove manual Reload/Refresh where data refetches on focus; keep Retry only in error states.
- **Tests:** e2e: the Week label is a range; the Planning tools menu has those two items only.

#### B8. Planner ("Plan study tasks")
- **Findings:** §3.4, §5.2 Plan study tasks (slots in the past; UTC ISO text fields; raw reason codes; "Commit selected placements"; "Refresh preview"), A07, X10, X15.
- **Change:**
  - **Model** (`planner/model.ts`): add an optional `now` to the planner input (an additive type change). For today, the window start is `max(window_start, ceil(now, 5 min))`; past days get no placements. `Sheet.tsx` passes `new Date().toISOString()`.
  - **UI** (`planner/Sheet.tsx`, on the A2 Dialog with eyebrow "PLAN YOUR DAY" and title "Plan your tasks"):
    - remove "Owner time zone … ISO instants" (`:191`);
    - each placement row reads "☑ Prove Heine–Borel · Today 15:30–16:20 · 50 min";
    - "Change time" reveals Date, Start and End pickers in the owner zone, replacing the ISO text fields (`:221-227`);
    - reasons come from A4;
    - the preview loads automatically on open and when Days changes (remove "Refresh preview", `:201-202`);
    - the primary button reads "**Add 4 blocks to calendar**".
  - Keep `commitPlannerSelection` and its tests unchanged.
- **Tests:**
  - Update `tests/unit/planner/sheet.test.tsx`: button text; formatted times; time-picker edits produce the same commit payload.
  - New `planner/model.test.ts` case: no placement starts before `now`.

### Phase C: Today and Focus

#### C1. Today reads the calendar directly
- **Findings:** §3.6, X6, F7; Today 1 and 3 (C02).
- **Now:**
  - `src/features/home/V6TodayPlan.tsx:16-23` (`nextPlannedBlock`) only returns blocks placed by a **committed** day plan.
  - `startVerifiedPlannedBlock` (`:66-85`) requires that plan.
  - The copy "No upcoming committed study block today." is at `:187`.
- **Change:**
  - Add `nextStudyBlock(blocks, now)`: the earliest planned (not cancelled or done) study block today, in the owner zone, ending after now, with no plan required. Keep `nextPlannedBlock` exported for its tests.
  - Add `startVerifiedBlock(date, zone, shown, now)`: re-read today's blocks with `listCalendarBlocks(dayBounds)`, check id, version and status, then `startStudyEntry({calendarBlockId, links…})`. Check the plan only if a committed plan exists.
  - Add a **"Today's schedule"** group in "Also in your notebook": up to 3 upcoming or ongoing blocks ("Now" or "15:00–16:30"), then "N more in Calendar". The next study block keeps its **Start** button (mockup capture).
  - Replace the copy with "Nothing else planned today · Plan a block" (link to `/calendar?new=block`).
- **Tests:** update `tests/unit/home-v6/today-plan.test.tsx`, adding cases where blocks without a plan appear and Start works without a plan, linked to the block. Add an e2e with the frozen clock and seed: four blocks after 13:43 appear and the Start button starts a focus linked to the block.

#### C2. Due today and overdue on Today
- **Findings:** §3.6; Today 1; §3.9 (Tasks reachable only via a toast).
- **Change:** add two rows to "Also in your notebook", each shown only when its count is > 0:
  - "**3 due today**": tasks due today (`getTaskApi()`), deadlines due today and practice topics due today (`loadCalendarDues()` from `calendar/deadlines/load.ts`). It opens a small sheet listing them, with links to Tasks, Practice and the path.
  - "**4 overdue**": the same sources, overdue against today. It links to `/calendar` (the B1 banner) and `/tasks?show=overdue`.
  - Load these after first paint and stay under the DOM budget.
- **Tests:** unit with fakes (counts and links); e2e with the seed: "1 due today" and "4 overdue" rows are visible and their links work.

#### C3. Idle study card
- **Findings:** Today 2, 4, 5 and 8; §7 ("No preset — use my intentior" truncated).
- **Change** (`features/focus/TodayFocus.tsx` idle state, `PresetPicker.tsx`):
  - keep **one** intention field (label "Focus intention"; many tests use it) and the Activity select;
  - show the **Timer mode** select only when Activity is "No preset", because presets already carry the mode;
  - remove the third repetition caption;
  - make label weights consistent;
  - rename the day plan's "Today's intention" to "**Aim for the day**" (inside Today's plan), so the screen no longer has two "intention" fields;
  - shorten option labels so they do not truncate at 320 px.
- **Tests:** update `tests/unit/focus/modes.test.tsx` and `tests/e2e/v6-focus-modes.spec.ts` to select "No preset" before Timer mode; update `home-v6/today-plan.test.tsx` for the label.

#### C4. Review time estimate
- **Findings:** §3.5, Today 6, Review 4, F12.
- **Now:** `batch*4.5/60` at `features/home/V6TodayPlan.tsx:140` and `features/review/v6/ReviewV6.tsx:83`. The legacy Review page already does this properly (`features/review/Page.tsx:107-109`): it calls the existing `estimatedReviewMinutes(count, reviews)` from `src/lib/insights.ts:87-97`, which averages real `durationMs` and falls back to 25 s per card, over `useInsightData(30).data?.reviews`.
- **Change:** use that same function in both v6 places: `estimatedReviewMinutes(batch, insights.data?.reviews ?? [])`, with a minimum of 1 min.
  - Do **not** change `src/lib/insights.ts` or the legacy Today (`features/home/Page.tsx:131-135`): `tests/unit/home/quietToday.test.tsx` pins its legacy "about 2 min".
  - On Today, enable the `useInsightData(30)` query only after first paint (e.g. `enabled` once the study card has rendered), to protect the cold-Today budget. Until then, show the count without a time.
- **Tests:** unit for the v6 Review hub and Today rows: with fake reviews of 30 s each, 23 cards read "About 12 min"; with no history, 23 × 25 s reads "About 10 min".

#### C5. "Logged today" bar
- **Findings:** Today 7.
- **Change:** give the bar a goal: today's goal from study goals, if a day goal exists, else Settings › Planning `daily_minimum_minutes`. Label it "40 of 60 min today". With no goal, show no bar, just the text. Keep `output[aria-label="Logged today"]`; e2e tests read it.

#### C6. Focus page polish
- **Findings:** Focus 2–6; Today 9.
- **Change** (`features/focus/V6FocusDialog.tsx`, `FocusNotices.tsx`, `src/ui/v6/focus/FocusDialog.tsx`):
  - Pause is secondary (outlined) and **Finish & log** is primary. Remove the odd offset shadow on Pause/Resume.
  - "Timer details" becomes a real disclosure with a chevron (A8). Its contents read "Phase ends at 14:30", "Take control of the timer" and "Skip to next phase". Keep the accessible name "Take control of timer"; `v6-harden-slice` uses it, so rename only the visible text if needed.
  - "Minutes to save" is a whole-minute number: `step=1`, prefilled `Math.round(...)`.
  - Park and Noticed dialogs get consistent alignment (left-aligned titles and labels). The copy "Exclude these minutes from logged focus (requires timer control)" becomes "Don't count these minutes" plus a hint when the lease is elsewhere.
  - Remove the decorative "∂" collision. The watermark glyph comes from the linked path's subject, else none.
- **Tests:** existing focus tests stay green; e2e: the minutes field accepts only integers.

#### C7. Close the day
- **Findings:** Close the day 1 and 2; §3.9.
- **Change:**
  - Link it from the ⋯ menu (A6) and from Today after 17:00 (owner zone) as a row "Close the day".
  - When no day plan exists, the page still works from the calendar: it shows saved time today, tasks, parked thoughts and tomorrow's first block, and offers "Start a plan for tomorrow". Do not dead-end on "No day plan exists".
  - Header title per A6, the date via A3, and no IANA zone.
- **Tests:** update `tests/unit/ritual/page.test.tsx` and `model.test.ts` for the no-plan path; e2e: `/today/close` with no plan shows today's saved time and no dead-end copy.

### Phase D: Progress and Time log

#### D1. One study-time source and one range control
- **Findings:** §3.5 (18 h 40 m vs 2940 min), X7, F10; Progress 1, 3, 7 and 10; the duplicated Study effort block (§3.12).
- **Now:**
  - `features/insights/Page.tsx:111` shows "Logged study time" from the `insights` data, which is **tutor sessions**.
  - `progress-v6/Page.tsx:100-104` shows saved focus.
  - Three controls write one `range` param: the select (`insights/Page.tsx:95-98`), Day/Week/Month (`progress-v6/Page.tsx:89`) and 7/30/90 (`:72-81`).
- **Change:**
  - One segmented "Time range" control under the header: **Today · 7 days · 30 days · 90 days**. `range` accepts the legacy `day|week|month` (mapped to today, 7 and 30).
  - Overview: the first tile is the **"Total logged time"** region (saved focus; keep this accessible name and a `strong` with the value). Tests read it at `?range=7` and `?range=day`.
  - The other tiles are Reviews, Recall and Checkpoints demonstrated **within the same range**, captioned with that range instead of "in the last 4 weeks" (sum the `checkpointWeeks` buckets that fall in the range). Tutor session time moves to the Learning tab, labelled "Tutor sessions".
  - The full Study effort block (by day, by subject, goals) appears **only on the Time tab**; Overview shows a 7-bar or 30-bar compact chart.
  - "Saved focus time · 30 —" copy becomes "Focus time · last 30 days", via `formatDuration`.
- **Tests:** update `tests/unit/progress-v6/page.test.tsx`, `goals.test.tsx` and `tests/e2e/v6-harden-slice.spec.ts` (the "Recent study ranges" group becomes the "Time range" control; keep the 7-day/90-day clicks). New e2e: with the seed at 30 days, the Overview total equals the Time-tab total equals `formatDuration(2940)` = "49 h".

#### D2. Logged by day, by subject
- **Findings:** Progress 2 and 4 (30 rows of bars; "0 min" rows; future days shown).
- **Change:**
  - "Logged by day" becomes a compact column chart (≤ 140 px tall) in `--accent`, with a weekly bucket for 90 days.
  - Future days are not drawn. An empty range shows "No focus time saved in this range" plus "Start a focus session".
  - Keep the `region "Daily logged minutes"` name; tests use it.
  - "By subject" shows `subjectName()` (A4), with "No subject" for unassigned.
- **Tests:** unit for the chart model (no future days; buckets); the e2e scan finds no `subject-*`.

#### D3. Goals
- **Findings:** Progress 5 and 6.
- **Change** (`progress-v6/goals.tsx`):
  - Ranges read "This week · Nov 9 – 15", via A3; drop the zone unless it differs.
  - Remove the repeated "Linear Algebra · Linear Algebra" when the project title equals the subject.
  - Bars use tokens.
  - Goals whose period has ended move to "Past goals", with "Reached" or "200 min short" and no "remaining".
  - Merge the two buttons per goal into an Edit button plus a ⋯ (Archive or Delete, destructive).
- **Tests:** update `goals.test.tsx` (ended goal, label text).

#### D4. Learning tab charts and metric tiles
- **Findings:** Progress 8 and 9; §3.11 (clipped "16"; Good and Easy almost the same green).
- **Change:**
  - In v6 `src/ui/charts` usage (or v6-only props), give Good and Easy distinct token colours and pad the right edge so labels never clip.
  - Draw values on the Checkpoints bars and use tabular sans (not mono) in stat tiles.
  - Metric cards align their values on a shared baseline (grid with `align-items:end` on the value row).
  - Keep legacy chart output unchanged; branch on the flag.
- **Tests:** e2e: the last axis label's right edge is ≤ the chart's right edge.

#### D5. Time log: local, human forms
- **Findings:** §3.4, Time log 1–4; X14 (18 px "Today" link); X15 ("1 saved entries", "Showing 1 of 1 pages (50 per page)").
- **Now:** `features/time-log/Page.tsx`:
  - ISO fields `:216-219`;
  - ID inputs `:116-117`;
  - JSON intervals `:122` and `:54-60`;
  - Split at ISO `:128`;
  - "Week starting" native date `:204-205`;
  - counts copy `:227`;
  - "Rating:" `:235`.
- **Change:**
  - **Entries.** Each reads "Fri, Nov 6 · 22:00–22:50 · 50 min · Real Analysis · Rated 3 · Focused". Intervals are summarised ("2 focus intervals · 1 break"). Day headings come from A3.
  - **Add time / Edit entry** (A2 Dialog):
    - Intent;
    - Date, Start and End pickers (owner zone);
    - **Subject**, **Path** and **Checkpoint** as selects, with no ids;
    - Rating as named options;
    - Reflection.
  - **Intervals editor.** Rows (kind, start time, end time) with "Add interval" and "Remove" replace the JSON textarea. Validation errors attach to the row.
  - **Split.** "Split at" is a time picker.
  - **Week navigation.** A "‹ Week of Nov 2 ›" navigator replaces the native date input.
  - **Copy.** "12 entries" only; "Page 1 of 2" only when there is more than one page.
  - **Actions.** A compact action row; Void is destructive and confirmed.
  - Header per A6.
- **Tests:**
  - Update `tests/unit/time-log/page.test.tsx` (fill date and time fields instead of ISO) and `tests/e2e/v6-harden-slice.spec.ts`. That test fills `Manual start`/`Manual end` with ISO and checks the `Subject ID` field; it now fills date and time pickers and checks the `Subject` combobox, and its `withinScreen` and `touchTarget` checks stay.
  - New unit: the intervals editor round-trips to `ClosedStudyIntervalInput[]`.

### Phase E: Inbox, Plan proposal, Cards, Card detail, Concept map

#### E1. Inbox
- **Findings:** Inbox 2, 3, 5 and 6; §7 stress ("1 of 149"); A08.
- **Now:**
  - `proposals/v6/Selection.tsx:34-39` renders `p.card.front` raw (LaTeX and cloze) as text and labels.
  - "Browse queue" shows `SelectionPanel` **and** the "Proposal groups" list (`proposals/Page.tsx:440-455`), the same proposals twice.
- **Change:**
  - **One list.** Browse queue is a single grouped list: each row has a checkbox (select) plus a tappable label (open), and the front is rendered with inline `MathText`.
  - **Accessible names.** Checkbox `aria-label`s use a new `plainCardText()` (`plainMath()` plus a cloze strip: `{{c1::compact}}` → `compact`).
  - **Group legends.** Use `projectTitle()` and readable group labels (no "∫ CP4·S7": "Compactness · Session 7").
  - **Pager.** Replace it with compact "‹ 3 of 23 ›" icon buttons (both styled alike, disabled state at 40 % opacity) plus "Browse all".
  - **Why this card.** A single "Why this card?" button (drop the lowercase "why" label). The opened explanation scrolls clear of the action bar (padding-bottom = action bar + bottom chrome).
  - **Header.** On `/proposals` the header shows no Inbox icon (you are there), so the page header omits it.
- **Tests:** update `tests/unit/proposals-v6/selection.test.tsx` (one list; rendered math; plain aria names). e2e with the seed: no `$` or `{{c` in Browse queue visible text.

#### E2. Plan proposal
- **Findings:** Plan proposal 1–3; §3.4; §3.15 ("Expected a UUID" in the demo).
- **Now:**
  - The demo id `proposal-6` fails the `uuid()` check in `src/data/proposal-drafts/model.ts:16-18`. The error is shown raw, with "Retry drafts" (`plan-proposal/v6/PlanProposalV6.tsx:194-197`).
  - A JSON payload editor follows (`:203-221`).
  - The slug is shown at `:160`.
- **Change:**
  - Show "**What changes**" first: "Adds 3 checkpoints · changes 2 · removes 1", with the changed tiles highlighted. The full Before/After grids sit in a "Compare whole plan" disclosure.
  - The meta row shows the project title (`projectTitle()`).
  - Put the draft section inside a collapsed `<details>` "Edit before approving (advanced)", rendered only when the proposal id is a UUID **and** the draft API is available (live). Otherwise render nothing: no error, no Retry.
  - Map draft errors to sentences, never validator text.
- **Tests:** `tests/unit/plan-proposal-v6/editor.test.tsx` uses UUID fixtures, and closed `<details>` content stays in the DOM, so it should pass unchanged. If clicks need the disclosure open, open it first (a deliberate update). New unit: a demo id renders no draft section and no "UUID" text.

#### E3. Cards list
- **Findings:** Cards 2–5; §7 stress (identical "Recall the definition in card 5000?" rows).
- **Change** (`cards/v6/V6Cards.tsx`, `CardFiltersSheet.tsx`):
  - **Rows** show a quiet meta line: "N7 · Real Analysis · Compactness · Due today" (card number, path, checkpoint, due). Duplicate fronts become distinguishable.
  - **Order.** A visible sort control ("Due first", "Newest", "Path"), defaulting to Due first. "In 7d" rows no longer precede "Due" rows.
  - **Filters.** On the A2 Dialog, "Checkpoint code" free text becomes a Checkpoint select (from projects).
  - **New card sheet** (A1): "Type: basic" becomes "Card type: Basic", and "Kind: other" becomes "Note type: Other", with explanatory option labels (A4).
- **Tests:** update `tests/unit/cards-v6/page.test.tsx`; e2e under stress: two rows with equal fronts have different meta text.

#### E4. Card detail
- **Findings:** Card detail 3–5; X12.
- **Change** (`features/card/Page.tsx`, v6 branch, `:252-310`):
  - The top row keeps **Edit card** and **Pause card**. **Delete card** moves to the end of the page inside a "More" section, with destructive style and confirm via the A1 sheet with a footer.
  - Use one name for suspension: "Pause card" / "Resume card" everywhere (rename "Suspend card", `:298`).
  - The Memory sparkline gets axis captions (today and +30 days) and an accessible summary. "Next 7 days" and "Stability 17 days" use sans tabular figures (A3 `formatInterval`).
  - "Addressed by Claude" uses `clientName()`.
  - The editor shows one live preview.
- **Tests:** update `tests/e2e/look-7c-card-actions.spec.ts` only if it runs with v6 (check; legacy must stay unchanged). Add a v6 unit or e2e: Delete is not in the first action row.

#### E5. Concept map
- **Findings:** Concept map 1–5; §3.5 (26 vs 24; 1500 vs 1498); §7 stress (unreadable link gutter).
- **Now:**
  - The header subtitle uses `query.data.links.length` (`atlas/v6/AtlasV6.tsx:36`).
  - The map view embeds the legacy Atlas page with its own "← Atlas" header and counts (`atlas/Page.tsx:280-291`, counting at `:188`).
- **Change:**
  - One `conceptCounts(tree, links)` helper, used by the header and anywhere else counts appear (count unique concept↔concept links between real concepts).
  - In v6 the map view hides the legacy header (pass `embedded` from AtlasV6; legacy unchanged). Its search moves into the v6 page.
  - Use one noun: "concept" and "connection" (no "idea", "link" or "Atlas" in v6 copy). Rename "Browse 82 concepts and 0 groups" to "82 concepts" (omit "0 groups").
  - List rows get a quiet status line (status and due count, from the data the row already has; hide what is unavailable).
  - Row actions get padding and gaps (A8).
  - The tab strip scrolls with fade edges; "Re-check 1" stays on one line.
  - Map gutter under stress: cap visible link arcs at 12 per side, with "+N more" collapsed into one labelled badge; the full list is in the details panel.
- **Tests:** unit for `conceptCounts`; e2e: the header count equals the map summary under `?demo=stress`.

### Phase F: the remaining screens

#### F1. Paths
- **Findings:** Paths 1–6; §7 stress (one card per subject with a single project).
- **Change** (`projects/v6/V6Paths.tsx`):
  - A subject with exactly one path renders the path row directly, with the subject as a caption (no collapsible card).
  - Search placeholder: "Find a path or subject"; counts say "1 path".
  - "3 of 12 checkpoints" (visible noun). "Now: Compactness" (title, not code; the code moves to the accessible name).
  - **Bottom row:** "New path" becomes a full-width primary row; "Archived paths" becomes its own quiet row below. They are no longer unrelated actions on one row.
  - **Row ⋯:** a proper popover menu (Pin, Archive). Remove "Close" (`:129`); Escape or an outside tap closes it.
  - Move the "Concept map" link below the status filter.

#### F2. New path
- **Findings:** New path 3–5 (A1 covers 1 and 2).
- **Change** (`new-project/Page.tsx`): sheet title "New path" (`:117`; also the sr-only h1 at `:116`); button "Create path" (`:158`); toast "Path created…"; placeholder "e.g. Real Analysis" in placeholder colour; one label style (A8).
- **Tests:** `tests/e2e/v6-rollback.spec.ts` lists `/projects/new` under **legacy** routes ("New project"), so the legacy copy stays; change the copy only in the v6 branch.

#### F3. Path detail
- **Findings:** Path detail 1–6; §3.12 (sources listed twice).
- **Change** (`project/v6/V6Project.tsx`):
  - Gap between chips (A8). Keep the mockup's "Switch path" chip but make it useful: it opens the existing path switcher sheet (`project/ProjectSwitcher.tsx`, A1 structure) to jump straight to another path instead of returning to the list.
  - The next-step card names the step: "Next: Use a finite subcover · Step 3 of 4"; remove the second "Step 3 of 4 · Analysis" line.
  - "Target: Feb 1, 2027", with the forecast omitted when unavailable.
  - Stage chips scroll with fade edges and are never cut to "M"; the Night selected chip uses `--raised-2` instead of solid white.
  - Tiles "Tutor sessions 8 / Sources 4" **are** the toggles (drop the separate Show buttons, keeping their accessible names `Show sessions (8)`/`Show sources (4)`, which `tests/unit/paths-v6/project.test.tsx` and `v6-harden-learning` use).
  - List sources once.
  - Pluralise "1 page needs checking". Show source keys as titles ("Rudin, p. 40").

#### F4. Checkpoint
- **Findings:** Checkpoint 1–4.
- **Change** (`checkpoint/v6/V6Checkpoint.tsx`):
  - Remove "Back to path" (`:56`, `:78`); the header back control suffices. Check `v6-harden-learning.spec.ts`, which uses "Back to path": change it to the header Back (deliberate).
  - Prerequisites read "Compact sets (CP3) · Demonstrated".
  - Session status and evidence labels come from A4.
  - Replace the paragraph about what Study, Demonstrate and Defer don't do with one-line descriptions under each button.

#### F5. Tutor session
- **Findings:** Session 1–4.
- **Change** (`session/v6/V6Session.tsx`):
  - Times via A3 ("Sun, Nov 8 · 15:18").
  - Show the checkpoint link once, in the meta row, not under every timeline item.
  - Hide "Pick up where you left off" when there is no resume question.
  - Remove "Back to path sessions" (`:48`, `:70`).
  - "Goal met" becomes a status pill, not button-styled.

#### F6. Review hub
- **Findings:** Review 1–6 (estimate in C4).
- **Change** (`review/v6/ReviewV6.tsx`):
  - "Change" (`:117`) links to `/settings?section=study`; F9 adds deep links.
  - The lone 🔍 row becomes a labelled field "Search decks" placed **inside** Decks & options, which opens in place. Remove the forward chevron on "Decks & options" and give it the disclosure chevron (A8).
  - Queue details: "23 due · 23 in today's batch".
  - "More/Less" becomes "Show sub-decks"/"Hide sub-decks".
  - Keep the eyebrow "A SMALL SESSION, LASTING IDEAS": the mockup has it (`12__Page`, `docs/v6/screens/review-*.png`), so under D1 it stays. Record Review 4's eyebrow remark as a waiver in N121.md.
- **Tests:** update the e2e for #1317 (search row) in `v6-g7-fixes.spec.ts` deliberately; it checks that the search opens Decks & options and focuses the deck search, which stays true.

#### F7. Review round
- **Findings:** Review round 1–4 (D4).
- **Change** (`review-run/v6/ReviewRunV6.tsx`):
  - Keep one exit: remove "✕ Leave" (`:136`); the header Back asks for confirmation if mid-round.
  - The grade bar is sticky at the bottom above the nav (thumb zone): `position:sticky; bottom:calc(var(--lemma-bottom-chrome) + 8px)`, with four equal buttons and no ✓ glyphs. Labels: "Again · 10 min", "Hard · 30 days", "Good · 1 month", "Easy · 2 months" (A3).
  - Drop the duplicated "DEFINITION" eyebrow when the note type line says the same.
  - The direct `/review/run` with no saved run shows "No review in progress" plus **Start review** (not a dead end).
- **Tests:** e2e at 375×667: all four grade buttons pass the trial click without scrolling.

#### F8. Review complete
- **Findings:** Review complete 1; §3.15.
- **Change** (`review-done/v6/ReviewDoneV6.tsx`): with no round to summarise, show "Nothing reviewed yet today" plus Start review / Back to Review, with no "Q.E.D." and no dash tiles. Keep the legacy page unchanged (`look-7a-stress`, `review.spec.ts` and `review-new-session.spec.ts` check legacy "Q.E.D.").

#### F9. Settings
- **Findings:** Settings 1–4; Review 1 (deep link).
- **Change** (`settings/v6/Page.tsx`):
  - A group page shows **only its sections**: Appearance → Appearance; Tutor → Connector + Teaching style + Tutor rules (titled "Tutor"); Study & review → Study defaults, Activities, Focus, Planning, Reminders; Data & account → Account, Subjects, Export.
  - Exactly one selected chip.
  - Support `?section=<id>` deep links (opens the right group and section).
  - Opening Settings from navigation shows the **index**; "‹ All settings" is replaced by the header Back.
  - Teaching style is a radio list (one row each, with the selected state shown by the control).
  - The Appearance segmented control uses the pill style (A8).
  - The connector section names the last client used (`connectorLastClient`).
- **Tests:** update `tests/unit/settings-v6/core.test.tsx` and `study.test.tsx`, and `tests/e2e/v6-harden-learning.spec.ts` ("Settings sections" tablist now scoped to the group; keep its checks within one group).

#### F10. Tasks
- **Findings:** Tasks 2–6 (reachability in A6 and C2).
- **Change** (`features/tasks/Page.tsx`):
  - Overdue tasks get a danger-tinted "Overdue · Nov 7" chip and sort first, and `?show=overdue` filters to them.
  - Due text comes from A3, with no mixed formats.
  - Each row has a checkbox (complete/reopen) plus a ⋯ (Edit, Move up, Move down, Cancel). Completed and cancelled tasks get no Up/Down. Cancelled tasks offer Reopen.
  - Headings: one sr-only h1; group headings "Backlog · 6".
  - Remove "Refresh" (refetch on focus). Show the count line only while more pages exist ("20 of 45 tasks shown · Load more"); when everything is loaded, hide it (no "13 shown of 13 tasks").
  - The edit dialog uses a textarea for long titles (A2).
- **Tests:** update `tests/unit/tasks-ui/backlog.test.tsx` (`:105`, `:113` and `:166` assert "N shown of 45 tasks"; the partial-page cases keep a count, and the all-loaded case asserts that 45 rows render and no count line shows) and `tests/unit/tasks-ui/sheet.test.tsx` (A2). Row actions move into a menu; keep the accessible names "Complete <title>", "Edit <title>"….

#### F11. Practice
- **Findings:** Practice 1–4; X14 (button names).
- **Change** (`features/practice/Page.tsx`):
  - Due text "Due yesterday" / "Due today" / "Due Thu, Nov 12" (A3). `dateOf(new Date().toISOString())` (`:154`) uses the **UTC** date; use the owner-zone today.
  - Use one card layout (button below the title).
  - Rating gets named options ("1 · Couldn't recall" … "4 · Easy").
  - Remove "Refresh topics" and the "Card review is separate" link (fold it into the page description).
  - Visible text equals the accessible name for Practice buttons ("Practice ε–δ proofs").
- **Tests:** update `tests/unit/practice-ui/practice.test.tsx` ("Due or overdue" → the new labels).

#### F12. Sign-in
- **Findings:** Sign-in 1–3.
- **Change** (`features/sign-in/Page.tsx`):
  - Live: below Google, add a quiet "Try the example workspace" link (`?demo=1#/`).
  - Demo mode `/sign-in`: "You're in the example workspace" plus **Back to Today** and "Sign in with Google" (switches to live, `?demo=0`).
  - Keep the e2e expectations in `routes.spec.ts`/`settings.spec.ts` (legacy) intact.

### Phase G: example workspace

#### G1. Demo study seed in the past
- **Findings:** §3.15, F13 (`src/data/study/demo.ts:44-68` seeds Mon, Wed and Fri of the current week).
- **Change:**
  - **Saved entries** are seeded relative to now (yesterday 09:00, 3 days ago 11:00, 5 days ago 14:00) and never in the future.
  - **Blocks:** one later today (next full hour + 1, 50 min) and one tomorrow (busy).
  - No test references the seed texts (checked with grep), but run the study and demo tests.
- **Tests:** unit: no seeded saved interval ends after `now`; Progress shows no overlap warning on a fresh demo.

#### G2. Demo fixture copy
- **Findings:** §3.15 (repeated prompts; the first Inbox card's answer doesn't answer its question).
- **Change:** in the demo fixture source (`src/data/demo/**` and `scripts/make-demo-data.ts` if generated), correct the answer of the first card proposal ("Why must U_y and V_y be disjoint?"). De-duplicate card prompts per checkpoint **only if** no test asserts those strings (grep `tests/` for each string first). If tests depend on them, waive it in N121.md with the reason.

### Phase H: wider screens

#### H1. Desktop (≥ 1024 px)
- **Findings:** §3.14, §7 (1280).
- **Change** (v6 CSS plus `AppShell.tsx` classes only under v6):
  - The five-tab bar is constrained to the content column width and centred; it is not 1280 px wide.
  - Calendar Week and Month use a wider container (`max-width: 1100px`) while other pages keep the reading column (`main#main-content` gets `data-wide` on `/calendar`).
  - Dialogs are centred (A2).
  - No side-rail redesign in this PR; record that as a waiver.
- **Tests:** e2e at 1280×800: the nav width is ≤ the content width + 32; the Week column width is ≥ 120 px.

### Phase I: accessibility and copy

#### I1. KaTeX in accessible names (X14)
Links or buttons whose text contains math get `aria-label={plainMath(source)}`, e.g. "What is the indiscrete topology on X?". Find them by grepping `<MathText` inside `<Link`/`<button>` in v6 files (`cards/v6`, `proposals`, `atlas/v6`, `project/v6`, `checkpoint/v6`). Unit test: the accessible name contains the plain math.

#### I2. Visible label = accessible name (X14)
In Practice, every button's accessible name starts with its visible text (voice control). The month-view text minimum is in B5. The 18 px "Today" link is removed (A6).

#### I3. Copy table (X15 and scattered copy)
| Now | New |
|---|---|
| Plan block in sheet | New time block |
| Commit selected placements | Add N blocks to calendar |
| Selected eligible | In today's batch |
| Disposition: Keep both | Kept both |
| Attribute to … | Count this time toward … |
| Server phase deadline | Phase ends at |
| Retake control / requires timer control | Take control of the timer / (hint) |
| No verified transcription pages | No pages transcribed yet |
| 1 page need checking | 1 page needs checking |
| 1 saved entries | 1 entry |
| Showing 1 of 1 pages (50 per page) | (hidden unless > 1 page: "Page 1 of 3") |
| Browse 82 concepts and 0 groups | 82 concepts |
| Owner time zone … ISO instants | (removed) |
| Due or overdue | Due today / Due yesterday / Overdue · Nov 7 |
| Times are in Asia/Calcutta. Saved study entries cannot be edited here. | (only when the zone differs) Planned in New York time |
| Read-only projection from an existing linked record | From your path's target date |
| Today's intention | Aim for the day |
| New project / Create project (v6) | New path / Create path |

---

## 3. Tests

### 3.1 New e2e spec: `tests/e2e/v6-n121-audit.spec.ts`
- **Setup:** `?demo=1&flags=v6Shell`; `test.use({locale:'en-IN', timezoneId:'Asia/Kolkata'})`; for data-dependent checks, `page.clock.install({time: new Date('2026-11-09T08:13:00Z')})` (13:43 IST). Copy `docs/v6/ui-audit-2026-11-09/reproduce/seed.json` to `tests/fixtures/ui-audit-2026-11-09-seed.json` and load it with `addInitScript` into `sessionStorage` (the same keys the demo adapters read). Guard it with a marker key so a reload does not re-seed over the test's own writes, as `reproduce/lib.cjs` does with `audit.seeded`. Block Google Fonts as the other specs do.
- **One `test()` per finding group,** named `N121 <WP> <what>` (each must fail on `f46de0a`; run it there once and note the result in the PR body):
  1. A1 sheet actions receive taps (4 viewports × 5 sheets).
  2. A2 dialogs centred or full-width (390 and 1280).
  3. A3/A4 no raw machine formats on routes plus open sheets.
  4. A5 break label matches in the card and the dock.
  5. A6 menu reaches Tasks, Practice, Time log and Close the day, with titles.
  6. A7 toast never covers the Inbox actions; Undo present.
  7. B1 future deadlines are never overdue; one banner.
  8. B3 Day grid geometry, now line, tap-to-create prefilled, drag persists.
  9. B4 Week fits 390 px; titles not split.
  10. B5 Month has no "0m · 0 blocks".
  11. B8 planner offers no slot before now; no ISO text.
  12. C1/C2 Today shows today's blocks, due and overdue (seed).
  13. D1 one total across Overview and Time.
  14. D5 Time log forms have no ID or JSON fields.
  15. E1 Browse queue renders math (no `$`, no `{{c`).
  16. E2 plan proposal shows no "UUID".
  17. F7 grade buttons reachable at 375×667.
  18. H1 desktop nav width and calendar width.

### 3.2 New unit tests
`tests/unit/format/format.test.ts`, `tests/unit/labels/labels.test.ts`, `tests/unit/focus/status.test.ts`, `tests/unit/ui/sheet-v6.test.tsx`, `tests/unit/ui/dialog-v6.test.tsx`, `tests/unit/calendar/grid-layout.test.ts`, `tests/unit/calendar/grid.test.tsx`, `tests/unit/calendar/overdue.test.ts`, `tests/unit/review-v6/estimate.test.tsx`, `tests/unit/time-log/intervals-editor.test.tsx`, `tests/unit/proposals-v6/undo-window.test.tsx`, plus new cases in `planner/model.test.ts`, `home-v6/today-plan.test.tsx` and `calendar/overlaps.test.tsx`. Put unit tests where `ci/test-map.json` will pick them up (`tests/unit/**`; shared `src/ui|lib|app|data` changes run everything anyway).

### 3.3 Existing tests that will need deliberate updates (keep every assertion's intent; never fewer `expect(`)
| File | Why | How |
|---|---|---|
| `tests/unit/calendar/page.test.tsx` | Add form and inline Move form removed (B3) | create via New block and dialog; move via events list → dialog; keep the Move/Done/Delete names |
| `tests/unit/calendar/block-sheet.test.tsx` | "Plan block in sheet" and "Edit block …" wall removed (B7) | open via New time block and events list |
| `tests/unit/calendar/deadlines-practice.test.tsx` | overdue semantics (B1) | new expectations as in B1 |
| `tests/unit/calendar/week-month.test.tsx` | grid and month cells (B4, B5) | geometry and cell names |
| `tests/unit/calendar/overlaps.test.tsx` | logged-in-study-block not a conflict (B5) | add both cases |
| `tests/e2e/v6-harden-planning.spec.ts` | "Day schedule" and "Day hourly timetable" (B3) | target the grid region "Day calendar" and the events list |
| `tests/e2e/v6-rollback.spec.ts` (`createBlock`) | "Plan a calendar block" form gone (B3) | open New time block → fill → Add to calendar; keep the snapshot assertions |
| `tests/e2e/v6-slice.spec.ts` | "Day schedule" text; Progress range | same as above; `?range=day` still valid |
| `tests/unit/planner/sheet.test.tsx` | button text, ISO fields (B8) | new labels and time pickers |
| `tests/unit/time-log/page.test.tsx`, `tests/e2e/v6-harden-slice.spec.ts` | ISO and ID fields; Progress range buttons (D5, D1) | pickers and selects; Time range control |
| `tests/unit/progress-v6/page.test.tsx`, `goals.test.tsx` | ranges, totals, goals (D1–D3) | as described |
| `tests/unit/focus/modes.test.tsx`, `tests/e2e/v6-focus-modes.spec.ts` | Timer mode only for No preset (C3) | choose No preset first |
| `tests/unit/home-v6/today-plan.test.tsx` | Today reads blocks; "Aim for the day" (C1, C3) | add cases |
| `tests/unit/proposals-v6/selection.test.tsx`, `page-states.test.tsx` | one list, plain names (E1) | as described |
| `tests/unit/settings-v6/*.test.tsx`, `tests/e2e/v6-harden-learning.spec.ts` | group-scoped sections; Back to path removed (F9, F4) | as described |
| `tests/unit/practice-ui/practice.test.tsx` | due labels (F11) | new labels |
| `tests/e2e/v6-g7-fixes.spec.ts` | #1321 Planning tools, #1317 search row (B7, F6) | keep the issue intent: one Planning tools button; search opens Decks & options |
| `tests/unit/app/v6-header.test.ts` | new titles (A6) | add expectations |
| `tests/unit/cards-v6/page.test.tsx` | rows, sort, filters (E3) | as described |
| `tests/unit/tasks-ui/backlog.test.tsx`, `sheet.test.tsx` | count line, row actions, dialog (F10, A2) | keep accessible names; all-loaded case asserts rows instead of the count |
| `tests/unit/ritual/page.test.tsx` | no-plan path no longer dead-ends (C7) | assert the new content |

Also re-run every legacy spec that touches shared components (`cards.spec.ts`, `proposals.spec.ts`, `settings.spec.ts`, `atlas.spec.ts`, `kit.spec.ts`, `review*.spec.ts`, `look-*.spec.ts`); they must pass **unchanged**.

### 3.4 Local gates
- **After every phase:** `npx tsc -b` → `node scripts/ci/lint.mjs` → `npx vitest run tests/unit/<areas touched>` → `npm run e2e -- tests/e2e/v6-n121-audit.spec.ts tests/e2e/v6-<area>*.spec.ts --trace off`.
- **Before opening the PR (all must pass):**
  - `npm run check` (typecheck, all unit tests, build and PWA check);
  - `npm run e2e -- --trace off` (the full suite; the e2e web server builds with the v6 flag off and the v6 specs opt in);
  - `npm run e2e -- tests/e2e/v6-release-audit.spec.ts --trace off` (all 138+ route cases);
  - run `docs/v6/ui-audit-2026-11-09/reproduce/covered.cjs` against `npm run build && npx vite preview --port 4173`, from the repo root with `node docs/v6/ui-audit-2026-11-09/reproduce/covered.cjs`. It must report "all controls reachable" for every sheet. Update the case selectors in the script if labels changed.
- **Prove the new tests fail without the fixes:** check out `f46de0a` in a worktree, copy the new spec there, run it and record the failing count in the PR body (as #1338 did).

---

## 4. Release captures and design review
1. After all phases, regenerate the 19 captures with `LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture' --trace off`.
2. Open each changed PNG next to `docs/v6/screens/<same name>` yourself first. Fix unintended differences in layout, components, colour and type.
3. In the PR body, list each **intended** deviation and its audit reason (D1). Expected ones:
   - Today rows "Today's schedule", "N due today" and "N overdue";
   - the Calendar overdue banner and per-view date labels;
   - the Week grid fitting the phone;
   - the Progress single range control and tile changes;
   - Inbox Browse queue (not in the captures, but say so);
   - Paths single-project rows.
4. Changing `docs/v6/release-captures/**` makes CI add `needs-review` after Ready. An independent agent (a different `Agent:` name) must post `Approve · Agent: <name>`. Ask the Owner to start that review session; never approve your own PR.

---

## 5. Docs, NEXT.md, PR, Ready and run log

### 5.1 `docs/current/N121.md` (new; starts with `## `)
A summary per phase of what changed for the user. It lists:
- the new modules (`src/lib/format.ts`, `src/lib/labels.ts`, `src/lib/focus/status.ts`, `src/ui/v6/Dialog.tsx`, `src/features/calendar/grid/**`);
- every **waiver**, with its reason;
- every deliberately updated test.

Do not add a section to `CURRENT.md`.

### 5.2 NEXT.md
The N121 block is already on the branch. Leave it as is (an Owner-task PR adds exactly one item; `scope` checks this). Change nothing else.

### 5.3 PR
- **Title:** `N121 Fix the 9 Nov v6 UI audit in one PR`. **Base:** `main`. **Head:** `ccr-035732f3-rhtvo4`. Non-draft. Check for a PR template first; the repo has none at `f46de0a`.
- **Body:**
  - Line 1: `Agent: chat-110926#m3vq · Item: N121`
  - Line 2: `Owner task: "We will address the audit report by first making a plan then executing this plan and uploading just one pr with all the redressals."`
  - Then: a summary; the traceability table from §1 with ✅ or "waived: reason"; the tests added (and that they fail on `f46de0a`); the tests deliberately updated (§3.3); the mockup deviations (§4.3); "No database, Edge Function or flag-default changes"; a review-needed note for the captures; the session link line.
- **Ready:** right after the final push, comment exactly `Ready · Agent: chat-110926#m3vq`. If CI fails, the failing rule or check is in CI's comment on the PR: fix it, push one commit, then post Ready again.
- **Watch:** after creating the PR, ask the Owner whether to subscribe to PR activity (`subscribe_pr_activity`) to handle CI and review events.

### 5.4 Comments
Only the formats AGENTS.md allows: Ready, a review verdict, `No progress: …`, or one `Done: … / Pending: … / Next: …` comment after a push (5 lines max, last line `Agent: chat-110926#m3vq`). Every GitHub comment ends with the Claude Code footer the session requires.

### 5.5 Run log
Use the closed issue `run-log: chat-110926` (created by the planning run). Each run posts **one** Plan comment and edits it to add the Result before ending:
`Plan · Agent: chat-110926#m3vq (run 2, <date>, Owner: "<task>"): 1) S0 incidents: … 2) Own failing PRs: … 3) Review: … 4) Own unfinished PR: … 5) S1: … 6) bug+confirmed: … 7) N121 Owner task: execute PLAN.md phases A–I and §3–§5, one PR. 8) Unconfirmed bugs: …`
Check steps 1–6 for real at that time (an open S0 freezes merges; a needs-review PR by another agent should be reviewed first).

---

## 6. Waivers and risks
- **Allowed waivers** (record each in N121.md with its reason):
  - H1 side-rail desktop navigation;
  - G2 if fixture strings are pinned by tests;
  - the Review eyebrow (mockup has it);
  - anything that would need SQL;
  - a §6 Polish item that conflicts with a mockup capture the Owner wants kept.
- **Risk: the size of B3 and B4.** Build `layout.ts` and its tests first, then the static grid, then tap-to-create and edit, then drag. Commit after each step. If time runs short, ship everything except drag/resize only with the Owner's agreement. The audit's "minimum" (§5.3) includes drag, so do not waive it silently.
- **Risk: test churn.** Prefer keeping accessible names that tests use (listed in WPs). Change names only when the audit requires it.
- **Risk: time zones.** The container may run in UTC. Every new test sets `timezoneId`, and every computation goes through `useOwnerZone()`.
- **Risk: legacy regressions.** Every shared-file change has a v6 branch; run the legacy e2e specs before the PR.
- **Risk: `main` moves.** Before opening the PR, `git fetch origin main` and merge it into the branch (no rebase, no force-push). Resolve conflicts yourself; CI only auto-resolves CURRENT.md and NEXT.md.

## 7. Final checklist
- [ ] Phases A–I done; every §1 row is ✅ or waived in `docs/current/N121.md`
- [ ] New spec and unit tests pass; they fail on `f46de0a` (noted in the PR)
- [ ] `npm run check` and the full `npm run e2e` pass locally; the release audit passes
- [ ] `covered.cjs` reports every sheet control reachable at 390×844 and 375×667
- [ ] Captures regenerated and compared; deviations listed
- [ ] No `supabase/**`, `src/flags.ts`, protected path or `docs/v6/screens/**` changes; no new dependencies
- [ ] NEXT.md diff is exactly "added N121"
- [ ] PR opened with line 1, line 2 and the body sections; Ready posted; run-log Result written
