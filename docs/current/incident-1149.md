## Incident #1149 — a revised proposal cannot be approved twice

Merged N92 introduced a data-integrity hole: `reopen_proposal` refused a withdrawn parent only while its direct successor was **pending and active**. After that successor was approved, its parent could reopen and have the same lineage's card or plan effect applied a second time.

The forward-only additive migration `20261116201000_proposal_reopen_lineage_guard.sql` compatibly replaces the existing `reopen_proposal(uuid)` signature. It conservatively refuses reopening **any** proposal that already has a direct successor, regardless of the successor's status. `revise_proposal` and `reopen_proposal` lock the same owner/parent row, so concurrent revision cannot race with reopen. A legitimately withdrawn proposal with no successor retains the original reopen behavior; returned fields, owner authorization and journal/provenance remain unchanged. No existing deployed migration is edited.

The updated `tests/mcp/sql/proposal-versions.mjs` adds an actual owner-grade/approval journey: revise a pending card proposal, approve its successor, refuse parent reopen and second approval, and prove only one note was inserted. It also exercises a rejected successor. This test fails on the merged N92 function and passes on the replacement. Production merge is gated on SQL CI and independent review.
