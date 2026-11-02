# Lemma build plan v1

Approved by the owner on 29 October 2026. This is the only task list. Behaviour lives in `docs/spec/`, visuals in `docs/design/`. Agents build; this plan does not change unless the owner asks.

## 0. Quick start for an agent

1. Read this file, then `AGENTS.md`, then only the spec sections your task lists.
2. Pick a task from §8 whose dependencies are merged and that has no open PR (search open PRs for its ID).
3. Open a PR (never a draft: REST-only agents cannot un-draft it) named `<TASK-ID> <title>` from branch `t/<task-id-lowercase>` before writing code, with the line `Owner: <role> · Lease until <HH:MM IST>`. That is your claim (see `docs/agents/README.md` §2).
4. Touch only the paths your task owns. Run `npm run check` and your tests. Write "Ready to merge" in the description when complete; the Steward merges when every check is green and there is no unresolved "AUDIT BLOCK".
5. Then pick the next task. Never wait for permission between tasks.

## 1. Goal

A personal mathematics study app for one person. Claude and ChatGPT teach in their own apps; Lemma keeps everything else. One connector call (`resume`) restores where the owner stopped in about 300 tokens, the tutor saves progress while teaching, and every card, plan and card fix the tutor suggests waits for a one-tap approval in the app. The app (phone first, installable) shows what to resume, reviews cards with FSRS, approves proposals, holds the PDFs, draws the plan and an Atlas of ideas, and shows insights.

The daily loop that must always work:
1. Open Lemma → see the resume target, cards due and proposals waiting.
2. Resume → the chat opens with "Resume Real Analysis"; the tutor calls `resume` and continues exactly where the last chat (in either app) stopped, even if that chat hit a usage limit.
3. The tutor saves progress every few messages and proposes cards.
4. Approve cards with a swipe; leave notes on cards for the next "update my cards".
5. Review due cards, mixed across decks, with confidence before reveal.

## 2. Decisions (do not revisit without the owner)

| # | Decision | Reason |
| --- | --- | --- |
| 1 | One owner; Supabase project `yemqnhnztlbyxmjxidis` is the only store; online-first, no offline sync | The old plan failed on sync complexity |
| 2 | Chatbots use a custom MCP connector (Supabase Edge Function), never raw SQL | Token cost and safety |
| 3 | Connector auth = secret in the URL path, stored in `settings` and rotatable in the app | Works in both Claude ("No sign in") and ChatGPT ("No authentication") |
| 4 | Curriculum changes are proposals approved in the app; progress records are written directly; dictated cards may skip approval | Owner's choice, 29 Oct |
| 5 | PDFs are uploaded in the app and stored as page text the tutor reads by page | Both chatbots can read them; tokens stay low |
| 6 | FSRS-6 engine from the old repo, run in the browser | Already verified against ts-fsrs |
| 7 | React + Vite + TypeScript + Tailwind 4 + motion; GitHub Pages with hash routes; PWA | Familiar to every coding model; free hosting |
| 8 | Demo mode with a fixed dataset | Lets screens be built in parallel and tested with no login |
| 9 | **Superseded**: Dark only, Amber on Obsidian | Historical canvas decision. Current owner-approved look is Graph day and Graph night, with `docs/spec/v4-look.md` overriding `docs/spec/v3.md` wherever they differ (31 Oct 2026). |
| 10 | Mix decks on by default; confidence before reveal is optional and reveals in one tap | Interleaving and calibration evidence |

## 3. Architecture

```
 Phone / desktop browser (PWA on GitHub Pages)
   React app ── supabase-js (publishable key + owner session, RLS) ──┐
                                                                     ▼
 Claude / ChatGPT ── MCP over HTTPS ──► Edge Function "mcp" ──► Supabase Postgres + Storage
                      /functions/v1/mcp/<secret>   (secret key, filters by user_id)
```

- The app computes FSRS and writes review results through the `record_review` function.
- The connector never schedules cards and never deletes data.
- Curriculum flows: tutor → `proposals` table → owner approves in the app → `approve_proposal` applies it.

## 4. Stack

Use the latest release of each major listed; pin exact versions in `package.json` and commit the lockfile (P0-A).

| Area | Choice |
| --- | --- |
| App | React 19, React DOM 19, TypeScript 5 (strict), Vite (latest) with `@vitejs/plugin-react` |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`) on top of the CSS tokens in `design.md` §2 |
| Motion | `motion` 12 (`import { motion } from "motion/react"`) |
| Icons | `lucide-react` |
| Routing | `react-router` 7, hash router |
| Data | `@supabase/supabase-js` 2, `@tanstack/react-query` 5, `zustand` 5 for review-session state |
| Math | `katex` 0.16, `marked` 18, `dompurify` 3 through the legacy renderer (`src/lib/render`) |
| Scheduling | legacy `fsrs.js` (FSRS-6) wrapped in `src/lib/fsrs` |
| PDF | `pdfjs-dist` (latest) with its module worker |
| Charts and Atlas | `d3-scale`, `d3-shape`, `d3-array`, `d3-force`, `d3-zoom`, `d3-selection`, `d3-polygon` |
| PWA | `vite-plugin-pwa` |
| Tests | Vitest + jsdom, Playwright 1.63 (Chromium), `ts-fsrs` 5.4.1 and `tsx` (dev only, for the ported FSRS golden test) |
| Connector | Deno Edge Function with `npm:@modelcontextprotocol/server@^2.0.0`, `npm:zod@^4.3.6`, `npm:@supabase/supabase-js@2` |
| Hosting | GitHub Pages at `https://mymayankyadav.github.io/lemma/` (base path `/lemma/`) |

## 5. Repository layout and ownership

| Path | Owner task | Notes |
| --- | --- | --- |
| `package.json`, lockfile, `vite.config.ts`, `tsconfig*.json`, `index.html`, `.gitignore`, `.env.example` | P0-A | others may add a dependency only through a `CONTRACT` PR (§7) |
| `src/styles/**` | P0-A creates, UI-1 maintains | tokens are fixed by `design.md` |
| `src/app/**` (router, shell, providers, tab bar placeholder) | P0-B creates, UI-1 polishes the tab bar and transitions | |
| `src/data/types.ts`, `src/data/api.ts`, `src/data/hooks.ts`, `src/data/mode.ts`, `src/data/index.ts`, `src/data/env.ts` | P0-B | contract files (§7) |
| `src/data/live/**` | DATA-1 | |
| `src/data/demo/**`, `scripts/make-demo-data.ts` | DEMO-1 | |
| `src/lib/**` | LIB-1 | pure functions, no React |
| `src/pdf/**`, `tests/fixtures/sample.pdf` | PDF-1 | |
| `src/ui/**`, `src/features/kit/**` | UI-1 (components, motion) and UI-2 (`src/ui/art/**`, `src/ui/charts/**`) | |
| `src/features/<screen>/**` | the screen task (§8 Phase 2) | |
| `supabase/migrations/**`, `supabase/config.toml` | DB-1 (MCP-1 may add the `[functions.mcp]` block) | |
| `supabase/functions/mcp/**`, `tests/mcp/**` | MCP-1 | |
| `.github/**` | P0-C | |
| `tests/unit/<area>/**`, `tests/e2e/<screen>.spec.ts` | the task named in `testing.md` | |
| `legacy/**` | read-only reference; INT-1 deletes it at the end | |
| `docs/**`, `plan.md`, `AGENTS.md`, `README.md` | owner (agents edit only when a task says so) | |

## 6. Working protocol

- **Claim**: branch `t/<task-id>` (lowercase, e.g. `t/scr-home`), a PR (never a draft) titled `<TASK-ID> <title>` opened before the first code commit, carrying `Owner: <role> · Lease until <HH:MM IST>`. Only the lease holder pushes; when the lease has expired, any agent may take over, commenting "taking over" (see `docs/agents/README.md` §2).
- **Scope**: only your owned paths. Need something outside them? Use §7, or leave a note in your PR under "Needs from others" and build against what exists.
- **Quality bar**: `npm run check` passes; your tests pass; screens match `design.md` and the boards (compare your screenshot from `test-results/screens/` with the board); no `console.error` in the browser; no hard-coded colours outside `src/styles`.
- **PR description**: what changed, how you verified it (commands and results), screenshot(s) for UI, remaining gaps.
- **Merge**: squash merge when CI is green on the last commit and there are no conflicts. Bootstrap exception: until `.github/workflows/ci.yml` exists on `main` (P0-A, P0-C itself, and chat-first PRs that land earlier), merge when `npm ci && npm run check` passes locally and the PR description pastes that output. On conflicts, merge `main` into your branch (never force-push, never rewrite history).
- **After merge**: pick the next task in §8. Do not edit this plan to mark progress; merged PR titles are the progress record.
- **Never**: push to `main` directly, commit secrets or `.env`, touch any Supabase project other than `yemqnhnztlbyxmjxidis`, change the database outside migrations (except DB-1 step 1), weaken or delete a failing test, add tracking or analytics.
- **Models**: use the strongest available model for P0-A/B, DB-1, MCP-1, LIB-1 and DEMO-1 (contracts and logic). Any capable model can do UI-1/2 and screens.

## 7. Contract changes

`src/data/types.ts`, `src/data/api.ts`, `src/data/hooks.ts` and the specs are contracts. If a task truly needs a change:
1. Open a separate PR titled `CONTRACT <short description>` that only adds (never renames or removes) fields, methods or hooks, plus the matching line in `docs/spec/data.md`.
2. Implement the new method as `throw notImplemented()` in both adapters in the same PR, and mention which task will fill it.
3. Merge when green. Continue your task on top of it.

## 8. Task board

Phases run in order; tasks inside a phase run in parallel. "Done when" items are the acceptance checks for the PR.

### Priority: chat-first track (start now, before everything else)

The owner wants to study in Claude and ChatGPT as soon as possible, with no app screens. This track needs only DB-1 and MCP-1; neither depends on P0-B, P0-C or any UI task.

| Order | Task | Starts when | Notes |
| --- | --- | --- | --- |
| 1 | DB-1 | now | Apply migrations with the Supabase MCP (no CI needed). Then seed the owner: run `public.bootstrap()` once as the owner (see `data.md` §5.1). |
| 2 | MCP-1 | now, in parallel; deploy after DB-1 | Build all 14 tools, including `create_project`, `proposals` and `decide` (`connector.md` §5.12–5.14), which let the owner create projects and approve proposals in chat. Deploy with Supabase MCP `deploy_edge_function` (`verify_jwt: false`) if `supabase.yml` does not exist yet. Ship read tools + `resume` + `create_project` + `propose_plan` + `proposals` + `decide` + session tools in the first PR so planning and studying work; the rest can follow. |
| 2b | DB-2 Action log | now | One migration: `actions`, `action_changes`, the `log_change()` trigger on every table, `undo_action`, `v_history`, `settings.master_prompt`, `projects.prompt`, `projects.status` `archived` (`data.md` §2.1, §2.3, §2.21, §5.9, §5.10). Test in a rolled-back transaction: insert, update and delete a note, undo each, undo the undo (redo), and the conflict and cascade errors. Existing reads must hide `archived` projects. Make every foreign key `deferrable initially immediate`. Also add `diagnostics` (§2.22) and `sources.plan_checked_at`, and the diagnostics effects of approve/reject (§5.4). |
| 2c | MCP-2 Prompts and undo | after DB-2 | Upgrade of the live MCP-1 connector, not a rebuild: same function name `mcp`, same URL and secret, so the owner's Claude and ChatGPT connections keep working after redeploy. Tools `set_prompt`, `history`, `undo`, `edit`, `add`, `delete`, `review`, `grade` (`connector.md` §5.15–5.22); `save_progress` diagnostics, `propose_plan_change` `diagnostics`/`book`, the `ADAPT` packet line, rules §6.4, `get(what=diagnostics)`; the `NEXT:` hint at the end of every tool output (§5 end); `get(what=prompt)`; the `OWNER` block in every packet; `Undo: A<n>` at the end of every write tool's output; every connector write RPC sets `lemma.source`, `lemma.tool`, `lemma.summary`; new server instructions text (`connector.md` §4, §5.15–5.18, §8.1, §9 steps 11–12). |
| 3 | Owner | after MCP-1 deploys | Get the connector address in the Supabase dashboard › SQL editor: `select 'https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/mcp/' \|\| connector_secret from settings;` then add it to Claude and ChatGPT (`connector.md` §10). |

How the owner works before the app exists:
- **Start a project**: attach the book PDF to a Claude Project (or ChatGPT Project) and say "New project: Real Analysis, goal: …". The tutor calls `create_project` (with `book`), reads the attached PDF, and proposes a plan.
- **Approve**: say "approve it" (or "approve P1, P3, reject P2"); the tutor calls `decide`. ChatGPT also asks to confirm each write.
- **Study**: "Resume Real Analysis". Pages are read from the attached PDF (SRC shows "attached in chat") until PDF upload in the app (PDF-1, SCR-PROJ) stores page text.
- **Cards** collect in Supabase; reviewing them waits for the review screen (SCR-REV). The tutor's warm-up questions and re-checks work from day one.

After MCP-2 the owner says once: "From now on, always: write all maths in LaTeX, never Unicode symbols; be Socratic" — the tutor saves it with `set_prompt` and every later session starts with it. Any mistake: "undo that" or "show history". Anything can be changed, added or deleted from chat (`edit`, `add`, `delete`), and flashcards can be reviewed in chat ("quiz me on my due cards"). The plan adapts: the tutor logs gaps, strengths and new material as diagnostics (`D7`) and proposes bridge checkpoints or plan updates that cite them; new notes: attach them and say "new notes for Real Analysis".

Agents on this track touch only `supabase/**` and `tests/mcp/**`, so they never conflict with Phase 0 or the UI work. With spare agents, continue Phase 0 → 3 as below in parallel.

### Phase 0: foundation (one agent, three PRs, in order)

#### P0-A Clean slate and scaffold
- Depends on: none. Owns: repo root config, `src/styles/**`, `legacy/**` moves.
- Read: this plan §4–5; `design.md` §2–3.
1. Delete every remote branch except `main` (`git ls-remote --heads origin`, then `git push origin --delete <name>` in batches). If your environment refuses, skip and say so in the PR; the owner will do it (§10).
2. Move `src/app/*.js` and `test/*` to `legacy/app/` and `legacy/test/`. Move `src/fsrs.js` to `src/lib/fsrs/fsrs.js` and `src/render.js` to `src/lib/render/render.js`; change only their last line (`if (typeof module …) module.exports = X;`) to `export default FSRS;` / `export default Render;` so they load as ES modules. Delete `build.js`, `src/index.html`, `src/config.js`, `src/service-worker.js`, `src/manifest.webmanifest`, `src/icons/`, the old `package.json` and lockfile.
3. Create a Vite React TypeScript app at the repo root with `base: '/lemma/'` and strict TypeScript. Install the packages in §4 at their latest versions within the given majors; pin exact versions.
4. Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`, `test` (`vitest run`), `e2e` (`playwright test`), `check` (typecheck, test, build), `format` (Prettier).
5. Styles: `src/styles/tokens.css` with every token in `design.md` §2 exactly; `src/styles/base.css` (reset, `color-scheme: dark`, body font `--font-ui`, background `--obsidian`, focus ring, reduced-motion rule); `src/styles/surfaces.css` with the classes in `design.md` §3; `src/styles/app.css` that imports Tailwind and the three files and maps colours, radii and fonts with `@theme`.
6. `index.html`: `lang="en"`, `viewport-fit=cover`, theme colour `#0D0C11`, Google Fonts links for Instrument Sans (400, 500, 600, 700, italic 400) and STIX Two Text (400, 500, 600, italic 400, 500) with `display=swap`, title "Lemma".
7. Commit `.env.production` with the public values `VITE_SUPABASE_URL=https://yemqnhnztlbyxmjxidis.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VXVRKxz662EOyIFg4UwmaA_N1nywXRA` (publishable keys are meant for browsers; RLS protects data). The `test` script is `vitest run --passWithNoTests`. `src/data/env.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `.env.example` lists both; `.gitignore` covers `.env*`, `dist`, `test-results`, `playwright-report`.
- Done when: `npm run check` passes; `npm run dev` shows an empty obsidian page with the lamp glow; `legacy/` holds the old files; no old build files remain.

#### P0-B Contracts, shell and routes
- Depends on: P0-A. Owns: `src/app/**`, contract files in `src/data/`, placeholder `src/features/*/Page.tsx`.
- Read: `data.md` §7–9; `design.md` §6 (route list) and §5 (TabBar).
1. `src/data/types.ts`: every type in `data.md` §7 with the exact names and fields.
2. `src/data/api.ts`: interface `LemmaApi` with every method in `data.md` §8, a one-line comment each; class `LemmaError {code, message}`; helper `notImplemented(name)`.
3. `src/data/mode.ts`: demo when the URL search has `demo=1` (remember it in `sessionStorage` for the tab), else live.
4. `src/data/index.ts`: `getApi()` returns the demo or live adapter. Create `src/data/demo/adapter.ts` and `src/data/live/adapter.ts` as classes implementing `LemmaApi` where every method throws `notImplemented`.
5. `src/data/hooks.ts`: all hooks, keys and invalidations in `data.md` §9.
6. Router: hash routes for every screen in `design.md` §6 (`/`, `/projects`, `/projects/new`, `/p/:slug`, `/p/:slug/cp/:code`, `/s/:slug/:n`, `/proposals`, `/proposals/:id`, `/review`, `/review/run`, `/review/done`, `/cards`, `/cards/:no`, `/atlas`, `/insights`, `/settings`, `/sign-in`, `/kit`). Each renders `src/features/<name>/Page.tsx` (folders: `home`, `projects`, `new-project`, `project`, `checkpoint`, `session`, `proposals`, `plan-proposal`, `review`, `review-run`, `review-done`, `cards`, `card`, `atlas`, `insights`, `settings`, `sign-in`, `kit`). Each placeholder shows an `h1` with the screen name.
7. Shell: `App.tsx` (QueryClient, router, toast host), `AppShell.tsx` (Ground, outlet, tab bar on `/`, `/projects`, `/review`, `/insights` only), `TabBar.tsx` (4 links with Lucide icons and active state; UI-1 restyles), `ErrorBoundary.tsx`, `DemoChip.tsx` (small "Demo" chip top-left in demo mode).
8. Auth gate placeholder: in live mode without a session, redirect to `/sign-in`; in demo mode never.
- Done when: every route renders its placeholder in demo mode; `npm run check` passes.

#### P0-C CI, deploy and test harness
- Depends on: P0-A. Owns: `.github/**`, `playwright.config.ts`, `vitest.config.ts`, `tests/e2e/routes.spec.ts`.
- Read: `testing.md` §2, §4, §6.
1. `ci.yml` (pull requests and pushes to `main`): Node 22, `npm ci`, `npx playwright install --with-deps chromium`, `npm run check`, `npm run e2e`; upload `playwright-report` and `test-results/screens` as artifacts.
2. `pages.yml` (push to `main`): build (Vite reads `.env.production`; no variables needed), copy `index.html` to `404.html`; deploy `dist` with the official upload-pages-artifact and deploy-pages actions.
3. `supabase.yml` (push to `main` touching `supabase/**`, and manual): Supabase CLI; link to `yemqnhnztlbyxmjxidis` with secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` (fall back to the older name: `${{ secrets.SUPABASE_DB_PASSWORD || secrets.LEMMA_SUPABASE_DB_PASSWORD }}`); never run `supabase config push` (it would overwrite the owner's auth settings); `supabase db push`; `supabase functions deploy mcp --no-verify-jwt`. If the secrets are missing, print a notice and succeed.
4. `mcp-smoke.yml` (manual, and on success of `supabase.yml`): `node tests/mcp/smoke.mjs` with secret `MCP_URL`; skip with a notice if missing.
5. `keepalive.yml` (daily at 03:17 UTC): `POST ${SUPABASE_URL}/rest/v1/rpc/ping` with headers `apikey` and `Content-Type: application/json`, body `{}`.
6. `setup-check.yml` (manual): writes a table to the run summary saying which of `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `LEMMA_SUPABASE_DB_PASSWORD`, `MCP_URL` are present or missing, never their values. Run it once after merge and post the table on the PR.
7. `.github/pull_request_template.md`: Task ID, what changed, verification, screenshots, gaps.
8. Playwright and Vitest configs exactly as `testing.md` §4 and §2; `tests/e2e/routes.spec.ts` visits every route and finds its `h1`.
- Done when: the new CI runs and is green on this PR itself (a workflow added in a PR runs on that PR); after merge the placeholder app is live at `https://mymayankyadav.github.io/lemma/?demo=1#/`.

### Phase 1: core (eight agents in parallel; starts when Phase 0 is merged)

#### DB-1 Database
- Priority: chat-first track; starts now, independent of Phase 0.
- Owns: `supabase/migrations/**`, `supabase/config.toml`, `src/data/live/database.types.ts`.
- Read: `data.md` all.
1. Reset the old schema exactly as `data.md` §11 (Supabase MCP `execute_sql` or the dashboard SQL editor). The tool may ask the owner to confirm; the owner approved this on 29 Oct.
2. Write migrations with timestamp names, in this order: tables and constraints (§2), triggers (§2.20), RLS and grants (§3), storage bucket and policies (§4), functions and view (§5). Use `gen_random_uuid()`, `extensions.gen_random_bytes`, `search_path = ''`.
3. Apply to `yemqnhnztlbyxmjxidis`. Preferred: merge the migrations and let `supabase.yml` run `supabase db push` (needs the owner's secrets, §10). If the secrets are not there yet, apply each file in order with Supabase MCP `apply_migration`, then make the history match the file names: `update supabase_migrations.schema_migrations set version = '<file timestamp>' where name = '<file name without timestamp>'`, so later `db push` runs see them as applied.
4. Seed the owner so the connector works before the app exists: as `postgres`, `select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users limit 1), 'role', 'authenticated')::text, true); select public.bootstrap();` in one transaction (committed). Check: `select count(*) from settings` = 1, `select count(*) from styles` = 6.
5. Generate types into `src/data/live/database.types.ts`.
6. Run the security advisor and fix every warning.
7. In the PR, paste the result of these checks: `select count(*) from pg_tables where schemaname = 'public'` (expect 19); an RLS check showing every public table has RLS on; calling `bootstrap()` as the owner from the SQL editor via `set request.jwt.claims` returns a settings row and 6 styles.
- Done when: the checks above pass; `approve_proposal` applied to a hand-written card, plan and plan change in a transaction you roll back produces the rows in `data.md` §5.4 (paste the output).

#### MCP-1 Connector
- Priority: chat-first track; starts now, independent of Phase 0; live deploy after DB-1.
- Owns: `supabase/functions/mcp/**`, `tests/mcp/**`, the `[functions.mcp]` block in `supabase/config.toml`.
- Read: `connector.md` all; `data.md` §2, §5, §6.
1. Build the files in `connector.md` §3 and the 14 tools in §5 with the exact names, descriptions, parameters and outputs.
2. Implement the packet builder (§8) and enforce the budgets in §1.
3. Implement `/selftest` (§9) and `tests/mcp/smoke.mjs`.
4. Deploy with `supabase functions deploy mcp --no-verify-jwt` (or Supabase MCP `deploy_edge_function`). DB-1 must be merged first for a live deploy; build and unit-check against a local `supabase start` if it is not.
5. Run the smoke test with the owner's URL (read `settings.connector_secret` from the database with the Supabase MCP and build the URL; never paste the secret in the PR).
- Done when: smoke passes against the deployed function; `tools/list` is ≤ 10,500 characters; the PR includes the resume packet produced by the self-test project.

#### UI-1 Components and motion
- Owns: `src/ui/**` except `src/ui/art/**` and `src/ui/charts/**`; `src/features/kit/**`; restyles `src/app/TabBar.tsx` and route transitions in `src/app/AppShell.tsx`.
- Read: `design.md` §2–5, §7, §9; boards `Foundations.dc.html`, `Motion.dc.html`.
1. `src/ui/motion.ts`: tokens and variants (rise, stagger, deal, unfold, flyLeft, flyRight, flyUp, sheet, pop) per `design.md` §7, each with a reduced-motion version.
2. Components in the `design.md` §5 table except illustrations and charts, one file each, props as listed.
3. `MathText` uses `src/lib/render` (if LIB-1 is not merged yet, wrap the legacy `render.js` through the same path; LIB-1 keeps the interface `renderMarkdown(source, {macros, cloze})`).
4. Tab bar and route transitions (§7: tab crossfade, drill-in push with the page behind scaling to 0.94).
5. `/kit` gallery with every component in every state.
6. `tests/e2e/kit.spec.ts`.
- Done when: `/kit` matches `Foundations.dc.html` side by side (attach both screenshots); kit spec passes; no raw colour values outside `src/styles`.

#### UI-2 Illustrations and charts
- Owns: `src/ui/art/**`, `src/ui/charts/**`; adds their sections to `/kit` (append-only edit of `src/features/kit/Page.tsx`).
- Read: `design.md` §5 (illustrations, charts), §6.12, §6.16, §6.20, §7; boards `States.dc.html`, `Insights.dc.html`, `Done.dc.html`, `Atlas.dc.html`.
1. Illustrations: `CompassArt`, `CardFanArt`, `PlugArt {connected}`, `PageStackArt`, `DoneBurst`, `Starfield` as animated SVG React components (CSS keyframes or `motion`), static under reduced motion.
2. Charts: `LineArea`, `StackedBars`, `HBars`, `GroupedBars`, `Sparkline`, `CalibrationBars` drawn with d3-scale/d3-shape into SVG, sized by props, tokens for colours, draw-in animation, `role="img"` with an `aria-label` describing the data.
- Done when: each item appears in `/kit` with sample data and matches its board.

#### DATA-1 Live adapter
- Owns: `src/data/live/**` (except the generated types file, which DB-1 owns).
- Read: `data.md` all; `design.md` §6.4.
1. Supabase client from `env.ts` (PKCE flow, persist session, detect session in URL).
2. Implement every `LemmaApi` method with supabase-js queries, the RPCs and storage; map rows to the domain types; compute derived states with `src/lib/derive.ts` (LIB-1) — if LIB-1 is not merged, import from the path anyway and merge after it.
3. `signIn` uses Google OAuth with `redirectTo` = current URL without the hash; `bootstrap()` after sign-in.
4. `addSource` uses `src/pdf/ingest.ts` (PDF-1) and uploads to `sources/<user_id>/<source_id>.pdf`; insert pages in batches of 50; update status.
5. Map Supabase errors to `LemmaError` codes; detect offline (`navigator.onLine` false or fetch failure) as `offline`.
- Done when: `npm run check` passes; a script `scripts/live-read-check.ts` (run with the owner's session token in `LEMMA_TOKEN`, optional) lists projects; in the PR, list every method and how you exercised it (unit test with a mocked client is enough for writes).

#### DEMO-1 Demo data and adapter
- Owns: `src/data/demo/**`, `scripts/make-demo-data.ts`, `tests/unit/data/demo.test.ts`.
- Read: `data.md` §5, §6, §7, §8, §10; boards for the visible numbers.
1. Generator script with a fixed seed producing `src/data/demo/fixture.json` that satisfies every number in `data.md` §10 (concept names and links as on the Atlas board; review history realistic for FSRS).
2. In-memory adapter implementing every method with the same rules as the database (approve logic of §5.4, review record and undo, comments, misconceptions, derived states via `src/lib/derive.ts`). Dates in the fixture are relative to load time.
3. `addSource` in demo runs the real `src/pdf/ingest.ts` and keeps pages in memory.
4. Unit tests from `testing.md` §3.
- Done when: tests pass; every placeholder screen can call its hooks without errors in demo mode.

#### LIB-1 Logic library
- Owns: `src/lib/**` (wrappers around the moved legacy files), `tests/unit/lib/**`.
- Read: `data.md` §6; `product.md` F8; `design.md` §6.11, §6.16; legacy `session.js`, `model.js`, `view_review.js`.
1. `src/lib/fsrs/index.ts`: ESM wrapper exposing the legacy engine's `preview`, `formatIvl`, `makeClock`, `parseSteps`, `optimize`, `buildDataset`, `evaluate`, `retrievability`, `DEFAULT_W` with TypeScript types; `scheduleConfig(settings)` builds the engine config (`w`, `retention`, `maxIvl`, `learn`, `relearn`, `fuzz`, `loadBalance`). Keep `fsrs.js` unchanged.
2. `src/lib/render/index.ts`: `renderMarkdown(source, {macros, cloze})`, `clozeOrds(source)`, `plainText(source, max)`, KaTeX with `output: 'htmlAndMathml'`.
3. `src/lib/queue.ts`: build and advance a review queue from `ReviewItem[]` and settings per `product.md` F8 (port the logic of legacy `session.js`).
4. `src/lib/derive.ts`: checkpoint UI status, project progress, session display, re-check ladder, concept status, due today (`data.md` §6).
5. `src/lib/insights.ts`: all numbers on the Insights screen and the review summary.
6. `src/lib/chat.ts`: prompt builders (`Resume <project>`, `Study <project>, <code> <title>`, `Plan <project>`, `Revise the plan for <project>: <text>`, `Update my cards`) and deep links (`https://claude.ai/new?q=`, `https://chatgpt.com/?q=`).
7. `src/lib/text.ts`: slugify, relative time ("2 h ago", "Wed", "28 Oct"), minutes format ("18h 40m").
8. `src/lib/optimizer.worker.ts`: runs `optimize` in a Web Worker for Settings.
9. Unit tests from `testing.md` §3 (port the legacy tests).
- Done when: unit tests pass; nothing in `src/lib` imports React.

#### PDF-1 PDF ingestion
- Owns: `src/pdf/**`, `tests/unit/pdf/**`, `tests/fixtures/sample.pdf`.
- Read: `design.md` §6.4; `data.md` §2.4–2.5.
1. `ingest(file, {onProgress})` returns `{pageCount, pages: [{page, label, body}], outline, hasText}` using pdf.js with its worker (Vite `?url` import).
2. Text rules in `design.md` §6.4; labels from `getPageLabels()`; outline flattened with levels and resolved to page indexes.
3. Create `tests/fixtures/sample.pdf` (3 pages, labels `i, 1, 2`, one outline entry, a hyphenated line) with a one-off script you do not commit, then unit-test it.
- Done when: the unit test passes and a 300-page PDF is read in under 30 s on a laptop (note the timing in the PR).

### Phase 2: screens (ten agents in parallel; starts when UI-1, UI-2, DEMO-1 and LIB-1 are merged; SCR-PROJ also needs PDF-1)

Every screen task:
- Builds `src/features/<folder>/` from the matching `design.md` §6 section and board, using only `src/ui` components, `src/lib` functions and `src/data/hooks.ts`.
- Handles loading (skeletons after 300 ms), error (toast with "Try again"), empty (`EmptyState`) and offline states.
- Respects reduced motion and the accessibility rules in `design.md` §9.
- Adds its Playwright spec from `testing.md` §4 and attaches its screenshot next to the board in the PR.

| Task | Screens (`design.md`) | Folders | Board(s) | Spec |
| --- | --- | --- | --- | --- |
| SCR-HOME | Home §6.1 | `home` | `Main` | `home.spec.ts` |
| SCR-PROJ | Projects §6.2, New project §6.3 (uses PDF-1) | `projects`, `new-project` | `Projects`, `NewProject` | `projects.spec.ts` |
| SCR-PATH | Project §6.5, checkpoint sheet §6.6 | `project`, `checkpoint` | `Path` | `project.spec.ts` |
| SCR-SESS | Session record §6.9 | `session` | `Session` | `session.spec.ts` |
| SCR-PROP | Approve §6.7, plan proposal §6.8 | `proposals`, `plan-proposal` | `Proposals`, `PlanReview` | `proposals.spec.ts` |
| SCR-REV | Review §6.10, card review §6.11, summary §6.12 | `review`, `review-run`, `review-done` | `Review`, `Card`, `Done` | `review.spec.ts` |
| SCR-CARD | Cards §6.13, card detail §6.14 | `cards`, `card` | `CardDetail` | `cards.spec.ts` |
| SCR-ATLAS | Atlas §6.15 | `atlas` | `Atlas` | `atlas.spec.ts` |
| SCR-INS | Insights §6.16 | `insights` | `Insights` | `insights.spec.ts` |
| SCR-SET | Settings §6.17, sign in §6.18 | `settings`, `sign-in` | `Connect` | `settings.spec.ts` |

Notes per task:
- SCR-REV keeps review-session state in a `zustand` store in `src/features/review-run/store.ts` (queue, current card, revealed, confidence, answered, undo stack, start time per card for `durationMs`). Keyboard shortcuts as in §6.11.
- SCR-PROP implements the drag gesture with `motion` (`drag="x"`, `dragElastic` 0.6, commit thresholds in §6.7).
- SCR-ATLAS keeps the d3-force layout in `src/features/atlas/layout.ts` (pure) and pauses animations when the page is hidden.
- SCR-SET runs the optimizer through `src/lib/optimizer.worker.ts`; the backup download uses a Blob URL with an `<a download>`.

### Phase 3: integration and acceptance (starts when Phase 2 is merged)

#### INT-1 Live mode, PWA and release
- Owns: integration fixes across `src/app/**` and adapters (coordinate in the PR if you must touch a feature folder), `vite.config.ts` PWA block, `public/` icons.
- Read: `design.md` §6.18, §6.20, §10; `connector.md` §10.
1. End-to-end in live mode against the real project: sign in, bootstrap, create a project with a real PDF, see the connector URL in Settings.
2. Offline banner and save-failure toasts with retry (3 attempts, back-off 1 s, 3 s, 9 s) for `recordReview` and approvals.
3. PWA: manifest per `design.md` §10, icons generated from an SVG of the amber `∫` (192, 512, maskable), Workbox runtime caching for Google Fonts (cache-first) and app assets; "New version ready" toast with Reload.
4. "Tutor not connected" state on Home until the first connector call.
5. Delete `legacy/` once nothing imports from it.
6. Write `docs/guide.md` for the owner: install the app on the phone, connect Claude and ChatGPT (from `connector.md` §10), the daily loop, what each screen does (one short paragraph each).
- Done when: the deployed site works in live mode for the owner's account (screen recording or screenshots in the PR from a signed-in session are optional; the MCP smoke passing on `main` is required), Lighthouse PWA installable, and all CI is green.

#### QA-1 Acceptance run
- Depends on: Phase 2 for the first run, INT-1 for the final run.
1. Give ChatGPT's browser agent `testing.md` §7 against the deployed demo; save its report as `docs/acceptance/<date>.md`.
2. Open one issue per FAIL with the screenshot, labelled with the screen task ID; the owning task's agent (or any agent) fixes it in a PR titled `FIX <issue>`.
3. Re-run until all checks pass.
- Done when: a report with every check PASS is merged.

### Owner requests after the first build (30 Oct)

#### UI-3 Themes, density and calm (priority for the app)
- Depends on: everything merged so far. Owns: `src/styles/**`, `src/ui/**`, `index.html` boot script, `scripts/make-themes.ts`, `scripts/review-shots.mjs`, `.github/workflows/review-shots.yml`, `src/features/settings/Appearance*.tsx`, and size/colour classes in every `src/features/**` file (coordinate: touch only class names there).
- Read: `docs/spec/themes.md` (all); it overrides sizes, elevations and motion defaults in `design.md`.
- PR 1 `UI-3 tokens and density`: semantic type and spacing tokens, replace every `text-[Npx]` and hard-coded size; densities compact/cozy/comfortable; default compact.
- PR 2 `UI-3 themes and lab`: `themes.ts` + generator + `themes.css` with the contrast gate; boot script; Settings › Appearance; floating lab button and sheet.
- PR 3 `UI-3 calm and space use`: effects calm/rich (default calm) and the layout fixes of `themes.md` §5.
- After PR 3: push a branch `review/themes` with `THEMES=all` so the review workflow commits contact sheets per theme; link them in the PR.
- Done when: `themes.md` §7.

#### How work runs now (31 Oct 10:25)
- Four hourly agents (Steward :00, Fixer :15, Builder :30, Auditor :45) coordinate through GitHub: leases in PR descriptions and the issues "Task board", "Audit log" and "Agent log". See `docs/agents/README.md` and `docs/agents/prompts.md`. Add work by adding a section here with task IDs, specs and "depends on".

#### Reminders and notifications (Planner, 31 Oct 22:40): NOTIF-0 … NOTIF-7, QA-5 — **owner-requested 31 Oct 23:33 IST; audit first**
- Spec: `docs/spec/notifications.md`. Web Push reminders that work in the browser, the installed PWA and the Android app (`android.md`). They cover cards due, checkpoints planned for tomorrow, a kind "smaller step" when a project is behind plan, picking up a paused session, tutor proposals (approve cards from the notification, with Undo), plan-past-target and a weekly digest.
- Rules: quiet hours, at most 3 a day, nothing while studying, fewer after repeated dismissals. Server-side scheduling (pg_cron → Edge Function `notify`); no Firebase, no new dependency, no connector change.
- **Owner-requested (31 Oct 23:33 IST), Auditor first:** the Auditor audits PR "PLAN notifications" before it merges; after that Fixer and Builder agents start the tasks below. The decision changes in `notifications.md` §9 and the open questions are the Planner's proposed defaults; an owner reply overrides them. The owner must add the secrets in §10 before NOTIF-4 can run live.
- Order: NOTIF-0, NOTIF-1 and NOTIF-2 in parallel → NOTIF-3 → NOTIF-4; NOTIF-5 after NOTIF-0; NOTIF-6 after NOTIF-0, NOTIF-5 and LOOK-9; NOTIF-7 after NOTIF-0 and LOOK-7; QA-5 last. Full acceptance in `notifications.md` §7.

| Task | Spec | Depends on | Owns | State |
| --- | --- | --- | --- | --- |
| NOTIF-0 CONTRACT reminders data surface | §6g | — | `src/data/{types,api,hooks,env}.ts`, `.env.example`, demo notify fixtures, `data.md` §7.4 | pending audit |
| NOTIF-1 Reminders schema | §6a–6d | — | `supabase/migrations/<ts>_notifications.sql`, `tests/mcp/notif1.mjs`, one `mcp-sql` step | pending audit |
| NOTIF-2 Web Push and notification text | §4f, §6f | — | `supabase/functions/_shared/{webpush,notify-text}.ts`, `tests/unit/notify/{webpush,text}.test.ts` | pending audit |
| NOTIF-3 Rules and copy | §3, §4 | NOTIF-2 | `supabase/functions/notify/{rules,copy}.ts`, `tests/unit/notify/rules.test.ts` | pending audit |
| NOTIF-4 `notify` function and schedule | §6e, §6f | NOTIF-1, NOTIF-3 | `supabase/functions/notify/**`, `<ts>_notify_cron.sql`, `config.toml` block, `supabase.yml` deploy line | pending audit |
| NOTIF-5 Service worker push handling | §4g, §5c, §5d | NOTIF-0 | `public/push-sw.js`, `src/lib/push-sw-core.js`, `vite.config.ts` (`importScripts` only), badge icon, `check-pwa.mjs` | pending audit |
| NOTIF-6 Settings › Reminders | §5a, §5b, §5e, §5f | NOTIF-0, NOTIF-5, LOOK-9 (live part: NOTIF-1, NOTIF-4) | `src/features/settings/Reminders*.tsx`, `src/lib/push.ts`, live notify methods, `AppShell.tsx` listener | pending audit |
| NOTIF-7 Notification entry points | §5d | NOTIF-0, LOOK-7 | `review/Page.tsx` (`start`), `review-done/*` (offer), `insights/Page.tsx` (`days`) | pending audit |
| QA-5 Reminders acceptance | §7 | all NOTIF | `docs/acceptance/notifications.md`, `scripts/notify-dry-run.ts` | pending audit |

#### v4 look (owner, 31 Oct 13:08): LOOK-0 … LOOK-9, QA-4
- Spec: `docs/spec/v4-look.md`. The owner called the checkpoint presentation "the ugliest I have seen". The audit of every screen (night and day, default and S profiles) found six causes:
  - the accent is the same red as "late" and "bad";
  - boxes sit inside boxes, and labels look like buttons;
  - the same fact is repeated three times at one weight;
  - there is no type system;
  - the background curve is fixed on top of the content;
  - the stage Metro was built as clipped button rails.
- The fix is "a quiet notebook": paper, ink and one red pencil for "you are here"; one `Route` line for checkpoints at any size; and an Atlas with real levels and links as lanes.
- **Approved by the owner on 31 Oct at 13:59 IST**, including the decision changes in `v4-look.md` §8. Start now.
- Presentation only: no database, connector or `src/data` contract changes.
- Start LOOK-0, then LOOK-1, LOOK-3 and LOOK-4 in parallel. LOOK-5 … LOOK-9 follow, and QA-4 comes last.
- The days-late mismatch (checkpoint sheet vs Metro) and the cards-list LaTeX leak may land early as `FIX` PRs.
- Mockups: `docs/design/v4/`. Audit contact sheets: `docs/design/v4/audit/`.

#### Android app (Planner, 31 Oct 22:40): AND-1 … AND-9, QA-6 — **owner-requested 31 Oct 23:33 IST; audit first**
- Spec: `docs/spec/android.md`. Recommendation: a Trusted Web Activity around the existing PWA. Google sign-in, KaTeX, pdf.js and every v4 screen work unchanged, every merged PR reaches the phone without a store release, and notifications (`notifications.md`) need no Firebase.
- Stages: 1 installable app on Play internal testing with launcher shortcuts; 2 notifications shown as "Lemma"; 3 home-screen widget (due count, Continue, next checkpoint) from a read-only token; 4 read-only offline snapshot; 5 offline review (needs a separate decision change).
- **Owner-requested (31 Oct 23:33 IST), Auditor first:** the Auditor audits PR "PLAN android" before it merges; after that Fixer and Builder agents start AND-1 … AND-8. The owner provides the Play Console account, the upload key, fingerprints and the asset-links repo (`android.md` §8). **AND-9a/9b stay blocked** until the owner changes decision §2 #1.
- Order: AND-1 and AND-2 → AND-3 → AND-4; AND-5 after AND-3 and NOTIF-6; AND-6 after AND-2, NOTIF-1 and NOTIF-4; AND-7 after AND-3 and AND-6; AND-8 after LOOK-9; QA-6 last. Full acceptance in `android.md` §6.

| Task | Spec | Depends on | Owns | State |
| --- | --- | --- | --- | --- |
| AND-1 Install quality (manifest, shortcuts, screenshots) | §4a | LOOK-9 | `vite.config.ts` manifest keys (not colours, not `importScripts`), shortcut icons, screenshots, `check-pwa.mjs` | pending audit |
| AND-2 Platform detection and asset links | §4b, §4c | — | `src/lib/platform.ts`, `docs/android/{assetlinks.template.json,setup.md}` | pending audit |
| AND-3 TWA shell and CI build | §4a | AND-1, AND-2 | `android/**`, `.github/workflows/android.yml`, `.gitignore` | pending audit |
| AND-4 Store listing kit and privacy page | §5 | AND-1, LOOK-5 | `docs/android/listing.md`, `public/privacy.html`, `scripts/play-shots.mjs` | pending audit |
| AND-5 Notifications inside the app | §4a | AND-3, NOTIF-6 | `android/**` (delegation only), `docs/android/notifications-check.md` | pending audit |
| AND-6 Widget data and pairing | §4d | AND-2, NOTIF-1, NOTIF-4 | `<ts>_widget_tokens.sql`, `notify/widget.ts`, `settings/Widget*.tsx`, additive data methods | pending audit |
| AND-7 Native widget | §4d | AND-3, AND-6 | `android/app/src/main/java/**/widget/**`, widget resources, JVM tests | pending audit |
| AND-8 Read-only offline snapshot | §4e | LOOK-9 | `src/lib/offline-cache.ts`, `OfflineBanner.tsx`, `AppShell.tsx` hydrate, `Button` `needsNetwork` | pending audit |
| AND-9a CONTRACT offline answers | §4f | owner decision §2 #1 | data contract, `<ts>_record_review_offline.sql` | awaiting owner decision |
| AND-9b Offline review queue | §4f | AND-8, AND-9a | `src/lib/review-outbox.ts`, review offline paths | awaiting owner decision |
| QA-6 Android acceptance | §6 | AND-1 … AND-8 | `docs/acceptance/android.md` | pending audit |

#### Tutor transcriptions (owner, 31 Oct 08:38): DB-5, MCP-6, UI-8
- Spec: `docs/spec/transcribe.md`. The connector cannot push PDFs or page text today: kind `book` only makes an empty record. The tutor will transcribe handwritten notes or scanned pages attached in chat into Markdown with LaTeX using a new `save_pages` tool. It writes either into an uploaded scan's pages or into a new text-only source, in batches of up to 10 pages, undoable, with who transcribed it and a "check" flag for doubtful pages.
- The app shows transcription progress, a page viewer with the original beside it, edit and "mark checked", and export as .tex or .md.
- Order: DB-5 → MCP-6 → UI-8, which can run alongside the stress tasks.
- **UI-8b (31 Oct 11:05, owner):** upload `.tex` and `.md` files directly as sources (`transcribe.md` §2b). Built in the PR "UI-8b". This also covers the "scanned PDFs have no text" gap from 30 Oct, with no paid OCR service.

#### Stress (owner, 31 Oct 00:24): ST-0 … ST-7, MCP-5, QA-3, the next plan
- Spec: `docs/spec/stress.md`. Every UI element is fed 10–100× realistic data (36–100 checkpoints, 2,500 ideas, 30,000 cards, 4,000 due, 1,500-character card faces, 10×10 matrices, 60 projects) to find where it stops doing its job. Each element keeps its job by changing form above a measured switch point: the stage Metro, segmented progress bars, folded lists, scrolling card faces with a sticky grade bar, a full-screen maths view, a daily review share, and server-side aggregates.
- Trigger: the owner's Algebra 1 (36 checkpoints, no stages) turned the Paths bar into a barcode and the project Metro into overlapping rings.
- Start ST-0 (stress fixtures and suite), ST-5 (server aggregates and paging) and MCP-5 (connector guards) now. Then ST-1 … ST-7 (ST-1 and ST-4 first), then QA-3. Done means each section's acceptance passes in profiles S and X, in both themes, at 390 and 360 px.

#### v3 (owner's decisions, 30 Oct 14:48): DB-4, MCP-4, DEMO-2, UI-6a … UI-6e, QA-2
- Spec: `docs/spec/v3.md`. It overrides every earlier design document: Graph paper by day and at night only (automatic, with an Automatic/Day/Night override), compact, calm, docked tab bar, Metro with schedule colours, the Atlas as a cosmos hierarchy, and sources-first projects (name plus many PDFs, sources appended any time, the tutor fills the rest and appends plans).
- Start DB-4, UI-6a and DEMO-2 now; then UI-6b, UI-6c, UI-6d, UI-6e and MCP-4; QA-2 last. Issues #337–#345 are the review gaps.
- The owner's Algebra 1 project was deleted on 30 Oct (undo action A4882); its orphaned ideas are cleaned up by DB-4.
- **30 Oct 22:38, owner:** the cosmos Atlas (UI-6c) is replaced by a foldable outline with links drawn in the margin (`v3.md` §4), and plan review opens each checkpoint in a drawer (`v3.md` §4a). Both shipped together as UI-7.

#### UI v2, Euclid (owner's final choice, 30 Oct 10:48): UI-5a … UI-5h, DB-3, MCP-3
- Spec: `docs/spec/ui-euclid.md` (overrides `design.md`, `themes.md` and `lab.md` where they differ). Choice: Euclid by day and Euclid at night by night (follow the phone), Ascent timeline (Metro kept), Orbits Atlas (Branches, Outline kept), compact, lively; eight worlds selectable.
- UI-5a first (tokens and components in PR 1, then backgrounds and the layout check); UI-5b … UI-5h in parallel after it; DB-3 now; MCP-3 after DB-3. UI-4a, UI-4b and UI-4c below are superseded: do not start them.
- **Approved by the owner (30 Oct, 11:06)**: the review round design in `ui-euclid.md` §8.7–8.8 and the icon-first tab bar in §8.0 (Today, Paths, Review, Insights; label only on the active tab). Build them exactly as the lab's Review tab behaves (`docs/design/lab/lemma-lab.html`, functions `viewReview`, `renderRV`, `reveal`, `grade`, `bindSwipe`, `finishRV`).

| Task | Builds | Acceptance (in addition to `ui-euclid.md` §9) |
| --- | --- | --- |
| UI-5a | tab bar per §8.0 in `src/app/TabBar.tsx`, plus foundations | four tabs, labels only on the active one, due badge on Review |
| UI-5e | `src/features/review`, `review-run`, `review-done` per §8.6–8.8, using the real queue (`src/lib/queue`) and FSRS intervals instead of the lab's fixed ones | e2e `review.spec.ts` updated: polygon shows n sides; Sure reveals; Again requeues two cards later and dashes its side; swipe right grades Good; the last answer opens "Q.E.D." with the four tiles and the transcript; "Go over the n missed" starts a round of only those cards; reduced motion shows final frames |


#### Lemma Lab round 2 (superseded by UI v2 for UI work): DB-3, MCP-3, UI-4a, UI-4b, UI-4c
- Spec: `docs/spec/lab.md` (it overrides `design.md` for Home, Atlas, the project timeline and Appearance). Reference prototype: `docs/design/lab/lemma-lab.html`.
- Start UI-4a, DB-3 now and in parallel; UI-4b and UI-4c can start on demo data at once and switch to live fields when DB-3 merges; MCP-3 after DB-3.

## 9. Milestones (order of work when fewer agents are available)

0. **M0 Chat-first (priority)**: DB-1 and MCP-1 → the owner connects Claude and ChatGPT and studies in chat.
1. **M1 Study loop works**: P0-A, P0-B, P0-C → DB-1 → MCP-1 → LIB-1 → DEMO-1 → UI-1 → SCR-HOME, SCR-PROP, SCR-REV → DATA-1. The owner can plan and study in chat, approve cards and review.
2. **M2 Full app**: UI-2, PDF-1, SCR-PROJ, SCR-PATH, SCR-SESS, SCR-CARD, SCR-SET.
3. **M3 Insight and polish**: SCR-ATLAS, SCR-INS, INT-1, QA-1.

With many agents, start every task whose dependencies are met; the milestones are only a priority order.

## 10. Owner one-time steps

Status on 29 Oct 2026, 21:30 IST:

| Step | Status |
| --- | --- |
| Google sign-in in Supabase | Done; verified from the auth logs (sign-in from `https://mymayankyadav.github.io/lemma/` today). Keep `http://localhost:5173/**` in the redirect URLs for local runs. After your first sign-in on the new app, turn off "Allow new users to sign up". |
| GitHub secrets `SUPABASE_ACCESS_TOKEN` and the DB password | Reported done by the owner; P0-C's setup check confirms. Either `SUPABASE_DB_PASSWORD` or the old `LEMMA_SUPABASE_DB_PASSWORD` works. Variables are no longer needed. |
| Delete old branches | Pending: delete every branch except `main` (GitHub › Branches, or in a local clone `git ls-remote --heads origin \| awk '{print $2}' \| sed 's#refs/heads/##' \| grep -vx main \| xargs -n 20 git push origin --delete`). Also turn on Settings › General › "Automatically delete head branches". |
| Confirm the database reset | Pending: approve the confirmation when DB-1 asks. |
| `MCP_URL` secret | After MCP-1 is live: copy the address from Lemma › Settings into a repository secret. |
| Connect Claude and ChatGPT | After MCP-1: `connector.md` §10. |
| Install on the phone | Open the site, Share › Add to Home Screen. |
| Draft PR ready-for-review handoff (only in REST-only runtimes) | When a PR says `Needs ready-for-review transition`, open that draft in GitHub and select **Ready for review**, or have a GraphQL-capable agent call `markPullRequestReadyForReview`. GitHub REST has no ready-for-review endpoint. The Steward may squash-merge only after the transition and exact-head green CI. |
| **Android Play Console and signing (AND-3/QA-6)** | Owner: create the Google Play Console app `io.github.mymayankyadav.lemma`, enable Play App Signing, retain the upload keystore privately, and configure the four CI signing secrets named in `docs/spec/android.md` §8. CI can build unsigned before these steps. Never commit signing material. |
| **Android origin-root asset links (AND-2/AND-3/QA-6)** | Owner: publish `.nojekyll` and `.well-known/assetlinks.json` in the separate user-site repository `Mymayankyadav/mymayankyadav.github.io` with both public SHA-256 signing/upload fingerprints; the `/lemma/` project site cannot serve this origin-root path. Upload the first Android App Bundle manually to Internal testing and add your account as a tester. |
| **Notification delivery secrets (NOTIF-4/QA-5)** | Owner: set `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `NOTIFY_ACTION_SECRET`, `NOTIFY_CRON_SECRET` in the designated Supabase Edge secrets for the single approved project, and put the cron secret in Vault under `lemma_notify_cron` as specified in `docs/spec/notifications.md` §10. Share only the public VAPID key; never paste private values into GitHub. |
| **AND-8 live two-user offline isolation acceptance (QA-6)** | Owner: use two disposable Google/Supabase identities in the approved Lemma project, or personally perform the sign-out → second-user sign-in → airplane-mode acceptance check. Verify the first owner's IndexedDB database is deleted and the second user sees only their own cached study data. Never put credentials, session tokens or screenshots of private data in PRs or CI. Mocked auth-event regressions are useful but do not replace this live two-user check. Record only pass/fail and sanitized evidence on [AND-8 #629](https://github.com/Mymayankyadav/lemma/pull/629). |
| **PR #615 — owner-visible v4 Today card** | **Action needed after independent Auditor CLEAR and strict first-attempt CI:** open [PR #615](https://github.com/Mymayankyadav/lemma/pull/615) and click **Ready for review**. It is a draft; REST-only agents cannot perform this transition. Do not merge until all seven exact-head checks, no-retry C2/D6 evidence and Auditor CLEAR pass. |

## 11. Later (not in v1)

App screens for the master prompt (Settings) and the action history with undo buttons; OAuth sign-in for the connector instead of the URL secret; page images so Claude can read formulas from scans (`get_page_image`); Anki import and export; daily reminder notifications; offline review with a write queue; per-subject FSRS parameters; photos of handwritten proofs; full-text search across all projects.

## 12. Known traps (read before coding)

- `render.js` reads the globals `katex`, `marked` (namespace import, so `marked.Marked` exists) and `DOMPurify`; set them in `src/lib/render/globals.ts` and import that before `render.js`. It emits cloze spans `.cz.czq` (blank) and `.cz.cza` (answer).
- `FSRS.preview(card, now, cfg, env)` returns `{1..4: {card, ivl, delay}}` in engine fields (`st, due, s, d, last, step, reps, lapses`, times in ms); convert to and from `CardState` in `src/lib/fsrs`. Labels come from `formatIvl(delay)`.
- OAuth with hash routes: Supabase returns to `/lemma/?code=…`. Use `redirectTo = origin + pathname` (no hash), let supabase-js exchange the code, strip `?code` with `history.replaceState`, and restore the screen from `sessionStorage`.
- Never invalidate `review-items` after `recordReview`; the review screen owns its queue.
- `getReviewItems` returns exactly the due set of `data.md` §6.5 (daily limits applied); `src/lib/queue` only orders it.
- Demo fixture times are minutes relative to load, and card due days are study-day offsets, so "23 due" holds at any hour and time zone.
- MCP: `createMcpHandler(() => new McpServer(...))` per request, `server.registerTool(name, {description, inputSchema: z.object(...), annotations}, handler)`, `handler.fetch(req)`. The secret key bypasses RLS: filter every query by `user_id` and set `user_id` on every insert.
- `apply_migration` records its own version; align `schema_migrations.version` with the file timestamps or the first `supabase db push` fails.
- `EmptyState` is built by UI-2 together with the illustrations it shows.

## 13. References

- Specs: `docs/spec/product.md`, `data.md`, `connector.md`, `design.md`, `testing.md`.
- Design boards: `docs/design/canvas/*.dc.html` (exported from the owner's canvas; inline styles hold the exact values; open in a browser for the visual, though interactive parts need the canvas runtime) and the owner's original reference `docs/design/reference-amber-on-obsidian.png`.
- Owner-only links (private to the owner): design canvas https://claude.ai/artifact/NjsHYBnmuZYgphy3mY13Qu, research notes https://claude.ai/artifact/EQiFLZfqa1ewaHTR1vbCdo.
- Legacy code kept for reference until INT-1: `legacy/` (FSRS engine and renderer already moved into `src/lib`).
