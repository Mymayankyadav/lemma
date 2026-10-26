# Lemma

A mathematics learning environment: flashcards, proof practice, offline-first study, and model-independent tutor handoffs between Claude and ChatGPT.

## Status

- GitHub repository initialized.
- Supabase project: `yemqnhnztlbyxmjxidis` (Mumbai, separate from Carrel).
- Initial learning-state tables and owner-scoped RLS deployed.
- Next: import the prepared Phase 1 application source, then add Supabase authentication, notes, review events and robust sync.

## Deployment

Target: GitHub Pages for web and Capacitor for Android. No private service-role key should be included in the client.

See `docs/SETUP.md` for configuration.

## Current implementation checkpoint (26 October 2026)

**Supabase backend deployed** in the separate Lemma project `yemqnhnztlbyxmjxidis`, with 14 owner-protected tables, an append-only review ledger, revision-safe note and plan publishing, and zero findings from the last security-advisor scan.

**Source import is the next gate.** Download the conversation attachment `lemma-phase2-source.zip`, then in GitHub select **Add file → Upload files**, upload that exact ZIP to the root of this repository, and commit it to `main`. The `Import Lemma source archive` GitHub Action validates and extracts it, installs dependencies, commits the real sources and tries to deploy the web app. If GitHub Pages isn't enabled, set Settings → Pages → Build and deployment to **GitHub Actions** and rerun the deploy workflow.

The imported app's existing flashcard storage remains active. The new offline/Supabase components are staged but **not connected to the active store yet**; don't rely on them to synchronize data until the auth, cross-device and review-replay milestones pass. See [Phase 2 sync contract](docs/PHASE2_SYNC_CONTRACT.md) and [Development roadmap](docs/DEVELOPMENT_ROADMAP.md).
