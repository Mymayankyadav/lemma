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
