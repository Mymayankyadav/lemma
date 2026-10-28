# Lemma agent instructions

Read current remote [plan.md](plan.md) first. It is the **only** engineering roadmap and task queue. Protocol v5 grants standing authority to minimize human intervention within approved scope; tool permissions and explicit user limits still apply.

- Implement/follow/continue means select, implement, verify, merge and advance through ready slices without repeated “continue” prompts. Planning/review-only requests remain documentation only.
- Respect an explicit lane. Otherwise choose automatically by plan §0; never ask merely because no lane was named. Up to six implementation agents, one per lane (A–F; see `lanes.json`); during the 28 Oct ship-today push read `docs/SHIP_PLAN.md` right after `plan.md`; one agent may work sequentially across roles.
- Inspect current `main`, open PRs/CI and all lane handoffs. Claim/resume via the draft-PR heartbeat protocol in §3; preserve active work and recover stale claims only with the specified evidence.
- One bounded slice per PR; after green merge/main checks, advance to the next eligible slice. If blocked, record the exact gate and work on independent tasks. At runtime limits push a recoverable checkpoint.
- Preserve the imported code/data and original `src/fsrs.js`; no scheduler/store rewrite or new image-upload/camera/OCR/image-tutoring project. Private study knowledge has only the narrow exception in the plan.
- Use `lanes.json`, lane branches and `node test/lane_guard.js <X>`. Cross-lane requests are read directly from handoffs, never relayed through the owner. Automatic `integration/` PRs may reconcile ownership/queue/CI under §3; no fresh owner request is required. Never override another active claim.
- No direct main pushes, force-pushes, protection bypasses, weakened tests or deletion of dirty data/history. Preserve tracked files; necessary reversible source changes use the plan's integration review and existing guard.
- Documentation-only changes: `npm run test:plan`, applicable lane guard, links and diff review. Code: task tests and gates. Merge only the current reviewed/tested head; report local/mock/CI/live evidence honestly.
- Only backend: Lemma Supabase `yemqnhnztlbyxmjxidis`; never modify Carrel. New migrations follow the plan's local verification, merge and production rules. No implicit enrollment or secrets in clients/logs.
- Decide routine details from existing patterns and record rationale. Ask only for the narrow owner actions in §3 after preparing a concrete result; bundle requests, preserve approval history, and continue unrelated work. Student approvals inside the product remain explicit.

Update your lane's next action and task evidence in the same PR. Retired plans/prompts are historical, not competing queues. No prior chat is needed.
