# Lane E — tutor handoff (TUTOR-01)

Next action: TUTOR-01 T1 — create `src/app/tutor_handoff.js` with `TutorHandoff.exportPacket` and `parseReply` (packet `lemma.tutor_handoff.v1`, `ready:false`) exactly per `docs/SHIP_PLAN.md`, document the format in `docs/TUTOR_HANDOFF.md`, and test round trips, size bounds, schema/ID/revision validation and hostile input in `test/tutor_packet.js` against a mock `StudyPlan`.

| Field | Value |
| --- | --- |
| Status | New lane (integration 28 Oct). T1 claimed 28 Oct 2026 09:41 UTC; in progress on `lane-e/tutor-01-t1-packet`. |
| Task | TUTOR-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md` |
| Owns | see `lanes.json` lane E |
| Depends on | `StudyPlan` from lane D for real persistence; build and test against the documented contract with a mock until it merges. Packet shape source: "Cross-model handoff context packet" in `docs/STUDY_PLANNING_PROTOCOL.md` (D-owned; ask D via your lane file for changes). |
| Slices | T1 packet export/parse · T2 handoff sheet `TutorHandoff.open` (copy packet, paste reply, per-proposal student approval, `src/styles/handoff.css`) · T3 persist via `StudyPlan`, record `tutor_handoffs` audit row, stale-write rejection test on local stack (`test/stack_tutor_*.js`) · T4 owner real round trip Claude→ChatGPT→Claude (≈10 min), then `ready:true` |
| Production | Avoid migrations; if one is needed name it `<ts>_tutor01_<slug>.sql`; A applies it after merge (SHIP-A2). |

**Requests from other lanes:** none yet.

**T1 claim:** `chat-20261028-lane-e-t1` · heartbeat 2026-10-28 09:41 UTC. Files: `src/app/tutor_handoff.js`, `test/tutor_packet.js`, `docs/TUTOR_HANDOFF.md`, this handoff. Mock StudyPlan only; no production migration or student approval. Next: implement pure bounded packet export/parse, test, and request CI.
