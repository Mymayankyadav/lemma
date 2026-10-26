# Agent operating instructions for Lemma

**Read [plan.md](plan.md) from the current `main` branch before doing any work.**

The owner alternates between ChatGPT, Astra, Claude and other coding agents. Only one chatbot ordinarily works at a time, **consecutively on `main`**, and the next may know nothing except the instruction **"follow the plan.md"**.

## Mandatory behavior

1. Follow the **current handoff**, **task queue**, **sequential-agent protocol** and **handoff checklist** in `plan.md`.
2. Verify repository head, recent CI runs and applicable Supabase migration state instead of relying on an earlier chatbot's assertions.
3. Continue the first safe unblocked implementation task; inspect and reuse existing code before adding components. **Do not reimplement FSRS**.
4. Commit tested, small changes to `main` unless the user has expressly requested a branch; re-read HEAD and file SHAs before writes and never force-push.
5. Leave existing anonymous and account data intact; no implicit account enrollment, invented scheduling state or unverified automatic sync.
6. Before finishing a coding turn, **commit an updated `plan.md` on `main`**, with exact progress, CI/deployment evidence, next task and blockers. When unable to finish, record the error and an executable recovery step.
7. Do not touch the Carrel project. The only permitted backend is Lemma's Supabase project `yemqnhnztlbyxmjxidis`.

`plan.md` determines **what to do next**; source code, tests and the database determine **what actually works**. Older `PROMPT.md` and chronological roadmap entries are historical, not competing instructions.
