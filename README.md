# Lemma

A persistent mathematics learning workspace built on existing FSRS-6 flashcards, proof practice and offline review. Planned additions make study context, approved plans and unfinished proof attempts portable between tutors.

**Web:** https://mymayankyadav.github.io/lemma/  
**Repository:** https://github.com/Mymayankyadav/lemma  
**Backend:** dedicated Supabase Lemma project `yemqnhnztlbyxmjxidis` (Mumbai); Carrel is separate.

## Start here

[plan.md](plan.md) is the **only roadmap and current chatbot handoff**. [AGENTS.md](AGENTS.md) supplies short operating rules. Up to three chatbots can work in parallel, one per lane, each on its own branch and pull request; the user can say **"follow the plan.md, lane A/B/C"** without supplying earlier chats.

The plan defines exact task gates, a minimal mathematics-focused UI and private shared study knowledge. New image-upload/OCR/media features are excluded; narrowly scoped knowledge documents may be supported.

## What currently exists

- Vanilla JavaScript app, mathematical Markdown/KaTeX, original FSRS-6, proof steps, prerequisites, search/graph, statistics, local import/export and IndexedDB persistence.
- Optional account login (Google first, email link fallback; live web sign-in verified), explicit transfer/comparison and substantial per-account outbox, revision RPC, review/retraction and workspace-isolation infrastructure.
- **Account editing/automatic sync is still gated.** Signing in does not silently migrate local cards. Cross-device scheduling remains a release gate.
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
