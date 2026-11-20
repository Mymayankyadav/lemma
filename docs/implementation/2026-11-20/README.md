# Lemma remaining implementation — agent handoff (20 Nov 2026)

## Owner's final shipping instructions

**The new scheduler and learning algorithm are on by default when shipped.** Settings > Planning exposes a persistent owner-scoped **New / Legacy** switch; missing settings select **New**, for new and existing accounts. This preference covers Today and authenticated MCP queue/resume, with the same decision and clear failure fallback. Already materialized rounds remain intact. The new algorithm's prospective randomized experimental practice routes still require independent bank/protocol/safety eligibility; their native fallback is not a covert general opt-out.

**Lemma Pad ships as a dedicated full app page** (`/pad` and navigable in the app) with an integrated **custom mathematical on-screen keyboard**, available by default. Keep native soft/hardware keyboards, IME composition, selection/caret, offline draft recovery, ink, explicit submission to tutor and accessible hide/show. The Pad must not ship merely as a checkpoint-embedded prototype.

Building behind a default-off flag is allowed under AGENTS Build stage; **N198 must enable the default-on release and verify it** on clean install, upgrade, online, offline and Android. Do not mistake a conditional test arm / temporary rollback for normal Legacy default.

## Snapshot and boundaries

The Owner supplied a roughly 118 MB research/plan archive (not a code checkout). The production TypeScript repository is `Mymayankyadav/lemma`. Last checked main: `d4f86b1c96de5daa2a05d8c216e34dc134e4a960`; its latest observed full-suite result was passing. Open implementation PRs at audit: **#1533 N191, #1535 N192, #1537 N193, #1546 N195, #1547 N196**. These are active claims, not blank tasks. Refresh every head and check before editing.

The old `NEXT.md` contained 44 entries and is preserved unchanged in `NEXT-before-reconciliation.md`, with one-row-per-entry dispositions in `LEGACY-DISPOSITION.md`; do not erase evidence or assert all old work was merged.

## Starting a chat agent (copy/paste)

> Read AGENTS.md, CURRENT.md, docs/current/, NEXT.md, and docs/implementation/2026-11-20/README.md. Refresh the current open incidents, PRs and checks first. Follow AGENTS.md work order and claim rules; continue an eligible existing PR instead of duplicating it. Pick the highest OPEN queue item whose Needs are completed, or perform independent repairs on its existing PR while recording its still-unmet acceptance dependencies. Implement the full task packet, meaningful tests, docs/current note, migration/owner safety, and acceptance evidence. Keep passing work and minimize PRs/tokens by batching a coherent outcome, not by skipping validation. When blocked, document the exact external/owner condition and pick another eligible item. The coordinated release must ship **New scheduler/algorithm by default with Settings New/Legacy switch** and **visible full-page Lemma Pad with custom math keyboard**. Do not mark unrun device/provider/production tests as passed.

## Proposed dependency order

```
 N191 evidence/calendar/receipt core
   ├─ N197 privilege cutover ─────────────────────────┐
   ├─ N193 durable tutor ── N192 full Pad page/keyboard ├─ N198 full release
   ├─ N195 live study & UI ───────────────────────────┤
   └─ N196 new agenda/forecast/practice ─────────────┘
 N193 ── N199 optional direct transport [external eligibility]
 N192 ── N200 optional OCR [asset/device eligibility]
```

- **First complete unblocked pickup:** N191's existing PR #1533. A new agent must wait for a real lease-expired takeover or equivalent Owner assignment; don't open a duplicate PR. Fixing independent failures in other existing PRs can proceed in parallel before N191 merges, without claiming their full acceptance.
- **After N191:** N197, N193, N195, N196 are independent streams, subject to shared file/migration coordination. N192's dedicated route/keyboard can be built now, but final tutor integration needs N193. N198 finishes all six.
- **Conditional:** N199 and N200 are blocked until external eligibility and should never block shipping core features.

## How to make the task small in overhead, not in value

One task = one coherent user outcome, including production contract, UI, tests, docs, privacy and rollback. Prefer updating the existing PR, one atomic batch of changes per run; do not create parallel PRs for single-file fixes already in scope. Check changed files for ownership collisions (`src/data/usePlanRelease.ts`, the export registry, `src/flags.ts`, Settings, and migration order) before editing.

Every packet includes: an exact Done; implementation route; validation; likely paths; out-of-scope constraints; dependency, release and reference handoff. Choose only an eligible item; edit its own packet/notes when code differs from the snapshot. Do not use an old static task list to infer work is still missing or already completed.

## Release decision and operational gates

N198 must distinguish **default-on** from **unsafe activation**. A qualification gate is not permission to silently ship New off. Measure native parity, hard scheduling constraints, latency and native fallback in deployed read-only shadow, complete fresh/upgrade SQL, owner permissions, signed-in study/Pad/tutor/evidence journey, physical POCO M8 Power (Android 16) keyboard/TalkBack/share tests and production rollback. Once accepted and expressly authorized, ship New by default and Pad page/keyboard visible; keep a reversible emergency stop and user Legacy option.

Prospective practice experiments have their own eligibility and follow-up rules, independent of the New scheduler default. If an experimental subroute is ineligible, use native and record why. Do not present the optional practice experiment as already established.

## Publishing this plan

This is an **Owner-authorized documentation-only `rules:` PR**, not a deployment or feature flag change. Per AGENTS.md, **Owner merges rules PRs**. No migrations, credentials, live application code or feature flags are modified by this publication.
