# Lemma agent instructions

Read current remote [plan.md](plan.md) first. It is the **only** engineering roadmap, task queue and current handoff. The owner uses different chatbots consecutively, never simultaneously, and may say only "follow the plan.md".

- A request to follow/continue the plan means execute one bounded next task. A request only to plan or review means documentation only. The user's current scope overrides the queue.
- Start from current `main`, verify relevant source/CI, and adopt unfinished work. Read deeper docs only for the selected task. Never require previous chat history.
- Preserve existing code and data. Reuse `src/fsrs.js`; do not reconstruct the scheduler, renderer, store or imported project.
- No new image-upload, camera, OCR or image-tutoring features. Private study-knowledge documents are the limited exception described in the plan; preserve existing media compatibility.
- Work on `main` unless instructed otherwise. Recheck remote HEAD before publication; fast-forward or use an expected-head check. Never force-push or overwrite newer work. No concurrent agents or lock infrastructure.
- Verify the task's gate and update the plan's current handoff, statuses and precise next action in the same delivery. Distinguish local/mock/CI/live results and pending checks. Keep the plan compact; use Git history for chronology.
- Documentation-only changes must pass `npm run test:plan`; preserve its required section names/fields. Code changes use the checks and gates in the plan.
- The only backend is Lemma Supabase `yemqnhnztlbyxmjxidis`. Never modify Carrel. No implicit account enrollment, secret keys in clients or loss of dirty data.

Retired roadmaps and old prompts do not create extra tasks.
