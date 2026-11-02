# Mandatory cleanup manifest

Baseline source for every row: commit `64dc7f68e9df36487462b2f7108a7508453fb846`; exact tracked blobs and references are in `inventory.json`. Implementation PR #765. Reviewer: pending independent Auditor; no reviewer result claimed.

| Path | Category / references | Disposition | Reason / replacement | Risk / validation |
| --- | --- | --- | --- | --- |
| AGENTS.md | startup; every run | UPDATE in place | mode guard and unconditional release supplement | safety; fresh-start readthrough, CI |
| plan.md §§0,6,8,10 | task source, foundation/reset/setup | UPDATE in place | guard-first selection, canonical OPS3 tasks, historical purge/reset/theme labels | preserve every task ID/owner step; no deletion commands remain runnable |
| docs/agents/README.md | handbook / owner decisions / old snapshot | UPDATE in place | pinned IDs, guard and current vs historical status | preserve §4 and legacy body, resolve relative links |
| docs/agents/dispatch.md, prompts.md | live legacy protocol/playbooks | UPDATE header; KEEP_CURRENT legacy content until cutover | active mode redirects to v3; inactive remains legacy | preserve executable gate/CI/audit text and rollback source |
| README.md | public current index | UPDATE | remove rebuilding-from-scratch assertion; v4/v3 precedence | no product behavior change |
| docs/design/README.md | reference index | UPDATE | historical amber/canvas; current v4/v3 precedence | no assets moved; original relative board links retained |
| docs/guide.md | user guide / maintainer entry | UPDATE additive | current coordination link | no user flow removed |
| docs/spec/** | approved behavior, UI/backend/contracts | KEEP_CURRENT | no product plan adoption in OPS3 | preserve current owner decisions and active PR contracts |
| docs/acceptance/**, images, fixtures | audit/runtime evidence; active PRs | KEEP_CURRENT | permanent references | no source/test loss or path movement |
| supabase/** | migrations/functions/live-data contracts | KEEP_CURRENT | protected material | no DB action, migration change or new project |
| scripts/merge-gate.ts + existing tests | #748/#749 active fix | KEEP_CURRENT | reuse canonical existing PR; mandatory supplement | no duplicate code ownership |
| legacy/**, old spec files/boards | historical assets, regression/reference callers | DEFER | in-place historical context suffices; optional indexing after stabilization | source parity/reference audit required before any later move/delete |
| all remote branches/open PRs | active source and provenance | DEFER | no bulk close/delete; #744 splits retain own review lineage | future hygiene requires canonical replacement and narrow authority |

Reference audit scope: complete REST tree (804 entries), tracked Markdown/readme paths, runtime/build/test/workflow input paths from inventory, current open-PR heads/bodies and known #749 ownership. No move or deletion proposed, so immutable links/asset/import targets remain intact. Local link validation covers changed Markdown relative file targets, with historical future-path references treated as existing scope rather than proof of delivery. No claim that every old comment or historical asset was semantically audited.
