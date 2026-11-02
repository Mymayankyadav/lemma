# Protocol templates

Templates are data/examples with no execution or approval authority. Populate exact IDs, full SHAs/revisions, dated timestamps and source URLs; placeholders are invalid. Validate with `scripts/agent-protocol.mjs` after fetching actual evidence. Validators check supplied evidence shape and policy, not truth, transactional ownership or server-side enforcement.

- [records.md](records.md): run, claim/release, control, handoff, audit, release/verification, capability and metrics records.
- [change-package.md](change-package.md): intake, exact approval, UI/architecture requirement mapping, supersession and active-PR reconciliation.
- [packet.json](packet.json): five-ticket envelope; fill every field and per-ticket authority before publication.
- Pure validator entry points: validateRun, validateControl, validatePacket, admitTicket, resolveClaim, mayContinue, evaluateRelease. Required structures are explicit in source and working synthetic cases in `tests/agents/protocol.test.mjs`; fictional test IDs never authorize real operations.
