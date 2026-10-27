# Lemma agent instructions

Read current remote [plan.md](plan.md) first. It is the **only** engineering roadmap, task queue and current handoff. Up to three agents may run at once, **one per lane** (A sync/auth/backend, B UI, C Android). The owner says "follow the plan.md, lane X"; if no lane is named, ask which lane.

- A request to follow/continue the plan means execute one bounded slice of your lane's NEXT task. A request only to plan or review means documentation only. The user's current scope overrides the queue.
- Start from current `main`, verify relevant source/CI, and adopt unfinished work. Read deeper docs only for the selected task. Never require previous chat history.
- Preserve existing code and data. Reuse `src/fsrs.js`; do not reconstruct the scheduler, renderer, store or imported project.
- No new image-upload, camera, OCR or image-tutoring features. Private study-knowledge documents are the limited exception described in the plan; preserve existing media compatibility.
- Edit only your lane's files (`lanes.json`); `node test/lane_guard.js <X>` must pass. Work on a `lane-x/` branch and merge through a PR (plan §3). Never push to `main` directly, force-push, delete files, or touch another lane's branch, PR or status file. Cross-lane changes go as requests in your own `docs/lanes/<X>.md`.
- Verify the task's gate and update your lane file `docs/lanes/<X>.md` (handoff and next action) and your task rows in the same PR. Distinguish local/mock/CI/live results and pending checks. Keep the plan compact; use Git history for chronology.
- Documentation-only changes must pass `npm run test:plan`; preserve its required section names/fields. Code changes use the checks and gates in the plan.
- The only backend is Lemma Supabase `yemqnhnztlbyxmjxidis`. Never modify Carrel. No implicit account enrollment, secret keys in clients or loss of dirty data.

Retired roadmaps and old prompts do not create extra tasks.
