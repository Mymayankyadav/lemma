# v6 reference set (behaviour references, not instructions)

Agents work only on NEXT.md items. Files here are cited by those items as the target behaviour and look. Nothing in this folder authorizes work outside an item's Scope, and nothing here overrides AGENTS.md, CURRENT.md, NEXT.md or a test.

Added by the priority run on 2026-11-05 from the Owner's "Lemma Mobile UI v6 Reviewed" package.

| File | What it is |
|---|---|
| `prototype/mockup.html` | Standalone UI mockup with example data (SHA-256 `aabfca9c101c0d38…`, the Inbox-repaired revision). **Not the product.** Open it in a browser to see interactions. Do not copy its code, `window.__lemma*` globals or browser-local storage into `src/`. |
| `screens/<screen>-<day\|night>.png` | 390×844 captures of that mockup (Today, Paths, Review, Calendar, Progress, Inbox, Cards, Atlas, Settings; Focus in Day). Rendered with system fallback fonts. |
| `Lemma_UI_v6_Direction_Plan.md` | Product direction and phased plan. The phases (V6-00 … V6-08) are milestones. NEXT.md turns them into items. Its hashes and some baseline notes refer to earlier inputs. |
| `Lemma_v6_Data_MCP_Contract.md` | Data and MCP contract: command envelope, receipts, versions, sync, release gates G1–G7. |
| `Lemma_v6_Capability_Registry.json`, `Lemma_v6_Schema_Inventory.json` | Inventory of current columns and the proposed new resources. Inputs, not implemented coverage. |
| `DESIGN_HANDOFF.md` | Per-screen behaviour and the metric definitions (logged time, in progress, occupied, capacity stack, subject time). |
| `INBOX_FIX_REPORT.md` | The Inbox bottom-stack invariant (tabs and timer reachable, decisions above them). |
| `prototype/effort-metrics.js`, `prototype/notebook-runtime.js` | Prototype logic for the time metrics and the browser store. They are references for behaviour and test cases only. |

Precedence when they disagree: a test on main, then NEXT.md item text, then CURRENT.md, then this folder.

## Owner decisions (2026-11-05)

- **D1 Production deploys.** Agent items that add database objects or MCP tools (N10–N12 and later) may deploy to production on merge, provided they pass the additive-only migration guard in AGENTS.md "Safety".
- **D2 Release gates.** Full app/MCP parity (contract gates G1–G7) is required for the **new** v6 study resources before each is turned on. Parity for the existing columns listed in `Lemma_v6_Capability_Registry.json` is a separate later track and does **not** block v6.
- **D3 Chat as approval.** An explicit instruction in chat authorizes the same change as the app would, only for changes that can be undone, or that are shown as a preview and confirmed first. Anything that cannot be undone needs a preview.
- **D4 Sync.** Start with refresh-based sync: the app re-reads changed records on focus, on visibility change, or after its own writes. No live push or Realtime subscription yet.
- **D5 Undo for study tables (#861).** The item that makes study commands reversible (N11.3, or N11 if not split) may replace `public.undo_action(uuid,bigint,boolean)` compatibly, in one new migration, with the PR body line `Replaces function: undo_action (reviewer verified signature and behaviour)`. Allowed, and nothing else: (1) `create or replace` with the same signature, where the only change to the body is appending `'study_entries','study_intervals','calendar_blocks'` to both table lists (the lock loop and the "Unrecognized journal table" check); no `revoke` or re-`grant` (replacing keeps the existing privileges); (2) `lemma_log_change` triggers on those three tables using the existing `public.log_change()`, exactly as `20261029183249_action_log.sql` creates them for the other tables; (3) making those three tables' foreign keys `deferrable initially immediate`, as that migration did for all others, so undo can restore rows in any order. Tests (PGlite): undo restores a deleted calendar block; undo reverts a saved or updated study entry with its intervals; undo after a newer edit to the same row is refused; another owner's action is refused; the existing undo tests pass unchanged. The reviewer compares the new function body with the old one line by line and requests changes for any difference beyond the three table names.
