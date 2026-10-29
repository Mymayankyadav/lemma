# Lemma — personal mathematics study app (reset 29 Oct 2026)

**Status: repository reset. No active plan. Agents must not implement anything until a new `plan.md` lands on `main`.**

The previous multi-lane plan (sync engine, tutor handoff packets, Android, release gates) was retired by the owner. Everything is still in Git history (last pre-reset commit `76ec066`).

New direction (plan pending UI design): a single-user study app. Supabase is the database; Claude and ChatGPT read and write it through a connector; a small web app shows projects, study sessions, flashcard decks and FSRS review.

## Kept on purpose (reuse candidates)

| Path | Why kept |
| --- | --- |
| `src/fsrs.js` | FSRS-6 scheduler + optimizer, verified against ts-fsrs (`test/compare_tsfsrs.mts`, `test/optimizer_synthetic.js`) |
| `src/render.js` | Markdown + KaTeX + cloze renderer (`test/render_test.js`) |
| `src/app/charts.js`, `jobs.js` | Dependency-free charts; optimizer Web Worker |
| `src/app/model.js`, `session.js`, `view_review.js`, `view_stats.js`, `view_browse.js`, `view_editor.js`, `util.js` | Reference implementations (card model, review queue with interleaving, reviewer with undo/shortcuts, stats, deck tree, editor). They still call the deleted `Store`; port, don't run. |
| `build.js`, `src/index.html`, `src/config.js`, `src/service-worker.js`, `src/manifest.webmanifest`, `src/icons/` | Single-file offline PWA build pattern. `build.js` lists deleted modules and must be rewritten. |
| `supabase/config.toml` | Links project `yemqnhnztlbyxmjxidis`. |

`package.json` scripts still reference deleted tests; the new plan rewrites it.

## Production database note

Supabase project `yemqnhnztlbyxmjxidis` still holds the old schema (19 tables, test-scale data). Its migration files were removed here; the new plan decides whether to drop or migrate them. Do not touch it before the plan says so.
