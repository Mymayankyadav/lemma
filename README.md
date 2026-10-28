# Lemma

A persistent mathematics learning workspace built on existing FSRS-6 flashcards, proof practice and offline review. Planned additions make study context, approved plans and unfinished proof attempts portable between tutors.

**Web:** https://mymayankyadav.github.io/lemma/  
**Repository:** https://github.com/Mymayankyadav/lemma  
**Backend:** dedicated Supabase Lemma project `yemqnhnztlbyxmjxidis` (Mumbai); Carrel is separate.

## Start here

[plan.md](plan.md) is the **only roadmap and current chatbot handoff**. [AGENTS.md](AGENTS.md) supplies short operating rules. Say **"continue the plan"** for automatic task/lane selection, or **"follow the plan.md, lane A–F"** to constrain work. Agents claim work, test, merge qualifying PRs, coordinate dependencies and advance without routine approval prompts. Up to six implementation agents can work concurrently, one per lane (sync/backend, UI, Android, study plan, tutor handoff, release); a single agent can work sequentially. Plan §3 defines recovery and the few owner-only actions. No earlier chats are needed.

The plan defines exact task gates, a minimal mathematics-focused UI and private shared study knowledge. New image-upload/OCR/media features are excluded; narrowly scoped knowledge documents may be supported.

## What currently exists

- Vanilla JavaScript app, mathematical Markdown/KaTeX, original FSRS-6, proof steps, prerequisites, search/graph, statistics, local import/export and IndexedDB persistence.
- Optional account login (Google first, email link fallback; live web sign-in verified), explicit transfer/comparison and substantial per-account outbox, revision RPC, review/retraction and workspace-isolation infrastructure.
- **SYNC-04 is complete:** automatic account sync passed independent-browser/offline/expiry/lost-response gates on the real local stack with production security parity. Production phone/Pages smoke remains an Android/release gate. Signing in does not silently migrate local cards.
- AI helpers depend on Claude host capabilities; they are not general ChatGPT/Claude connectivity on the deployed website.
- Study-context/plan/checkpoint schema exists; the complete learning UI and portable tutor workflow remain planned.
- Native Android (Capacitor) project with a CI-built debug APK and native Back/resume shell; not yet verified on a physical device, no release build.

See the plan for dated CI/deployment evidence; source and observed results take precedence over historical prose.

## Development

```sh
npm ci
npm run test:syntax
npm test
npm run build
```

Browser tests need Playwright Chromium. For documentation-only changes, run `npm run test:plan` and check links. Pages deployment and regression CI are separate; documentation-only pushes do not deploy web assets.

## References — read as needed

- [Study planning and tutor contract](docs/STUDY_PLANNING_PROTOCOL.md)
- [Sync architecture reference](docs/PHASE2_SYNC_CONTRACT.md)
- [Data model reference](docs/DATA_MODEL.md)
- [Setup](docs/SETUP.md)
- [Historical sync audit](docs/SYNC_AUDIT_2026-10-26.md)

These support the canonical plan; they do not define competing execution queues.
