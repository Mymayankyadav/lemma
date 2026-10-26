# Lemma

A persistent mathematical learning environment: existing FSRS-6 flashcards, proof practice, offline review, and planned model-independent study sessions and Claude ↔ ChatGPT handoffs.

**Live web app:** https://mymayankyadav.github.io/lemma/  
**GitHub:** https://github.com/Mymayankyadav/lemma  
**Backend:** dedicated Supabase Lemma project `yemqnhnztlbyxmjxidis` (Mumbai; **not** Carrel).

## For every chatbot or coding agent: start here

**[Follow `plan.md`](plan.md).** It is the canonical execution plan and durable cross-chatbot handoff: current implementation state, precisely one next task, safety requirements, testing gates, the completed ledger and a required end-of-session update. [`AGENTS.md`](AGENTS.md) makes this entry point explicit to coding tools.

The owner usually asks a succession of different chatbots to **"follow the plan.md"**. Continue from live `main` and update the same plan before ending; never require an old chat transcript to resume.

## Accurate implementation status

- The existing JavaScript/math flashcard app is imported, built and deployed to GitHub Pages; the original `src/fsrs.js` remains the scheduling engine. IndexedDB preserves anonymous/local cards.
- GitHub Actions runs syntax checks, FSRS-6 comparison, storage/outbox tests, rendering, Chromium E2E, browser sync emulation and account Store adapter tests.
- Supabase has authenticated owner-scoped records, revision-safe RPCs for notes/profiles/plans, an immutable review/retraction ledger, and account-scoped offline cache/outbox primitives. See `supabase/migrations/`.
- Optional email authentication, manual copy-missing enrollment and a read-only account comparison are present.
- **Full automatic cloud synchronization is NOT activated** in the visible Store: the account workspace is internally gated until review/profile conflicts and two-device scheduling convergence are verified. Account sign-in does not silently migrate anonymous cards.
- Android Capacitor dependencies/config are present but **native releases are not yet verified**.

## Developer commands

```sh
npm ci
npm run test:syntax
npm test
npm run build
```

Run `npm run test:plan` when editing operational handoff. All app changes should also pass GitHub Actions. Browser E2E needs Playwright Chromium.

## More reference material

- [Canonical handoff and task queue](plan.md)
- [Detailed product planning/tutor contract](docs/STUDY_PLANNING_PROTOCOL.md)
- [Sync audit and release gates](docs/SYNC_AUDIT_2026-10-26.md)
- [Offline sync contract](docs/PHASE2_SYNC_CONTRACT.md)
- [Historical engineering roadmap](docs/DEVELOPMENT_ROADMAP.md)
- [Setup and deployment](docs/SETUP.md)

Historical milestones in those documents may use past-tense branch/ZIP instructions; **`plan.md` and the verified current repository take precedence**.
