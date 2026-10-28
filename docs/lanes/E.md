# Lane E — tutor handoff (TUTOR-01)

Next action: TUTOR-01 T2 — add an explicit-consent copy/paste handoff sheet (`TutorHandoff.open` and E-owned `src/styles/handoff.css`) after T1 PR #86 is green and merged; keep `ready:false`. Compare current `StudyPlan.activeContext()` ID/revision/checkpoint against reply before any approved action. Then T3 persistence and T4 owner model round trip.

| Field | Value |
| --- | --- |
| Status | New lane (integration 28 Oct). T1 implementation on `lane-e/tutor-01-t1-packet`, [PR #86](https://github.com/Mymayankyadav/lemma/pull/86). Head is subject to CI gate. |
| Task | TUTOR-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md` |
| Owns | see `lanes.json` lane E |
| Depends on | `StudyPlan` from lane D for real persistence; build and test against the documented contract with a mock until it merges. Packet shape source: "Cross-model handoff context packet" in `docs/STUDY_PLANNING_PROTOCOL.md` (D-owned; ask D via your lane file for changes). |
| Slices | T1 packet export/parse · T2 handoff sheet `TutorHandoff.open` (copy packet, paste reply, per-proposal student approval, `src/styles/handoff.css`) · T3 persist via `StudyPlan`, record `tutor_handoffs` audit row, stale-write rejection test on local stack (`test/stack_tutor_*.js`) · T4 owner real round trip Claude→ChatGPT→Claude (≈10 min), then `ready:true` |
| Production | Avoid migrations; if one is needed name it `<ts>_tutor01_<slug>.sql`; A applies it after merge (SHIP-A2). |

**Requests from other lanes:** none yet.

**T1 claim:** `chat-20261028-lane-e-t1` · heartbeat 2026-10-28 09:41 UTC. Files: `src/app/tutor_handoff.js`, `test/tutor_packet.js`, `docs/TUTOR_HANDOFF.md`, this handoff. Mock StudyPlan only; no production migration or student approval. Next: implement pure bounded packet export/parse, test, and request CI.

**T1 evidence (28 Oct, 09:46 UTC):** Pure `exportPacket` (≤32 KiB Markdown, up to 4 pinned cited excerpts, explicit last proof and hint level) and untrusted `parseReply` (≤64 KiB JSON, strict root/event/card/amendment schemas, UUIDs, revision checks, no side effects) implemented, with `docs/TUTOR_HANDOFF.md` and `test/tutor_packet.js`. Local `node test/tutor_packet.js`, `node --check` for both new JS files: PASS against mock; full `npm test`, `npm run build`, lane guard and local-stack/CI pending. **Do not enable ready**: PLAN-01 P1 is a draft PR #83; T2–T4/physical tutoring and backend gates incomplete. No production changes or real student approval.

**T2 claim (28 Oct 09:54 UTC):** `chat-20261028-lane-e-t2`, branch `lane-e/tutor-01-t2-review-sheet`; T1 merged via PR #86 at main@8987151. Scope: E-owned `src/app/tutor_handoff.js` (add `open`), `src/styles/handoff.css`, `test/tutor_sheet.js`, this handoff. Implements copy/paste and review-only per-item selection with no persistence or implicit approval; T3 owns actual saving. Post-merge main CI pending at claim. Next: implement and test the hidden sheet, then verify CI and screenshots.
