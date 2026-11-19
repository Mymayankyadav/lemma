## Incident #1518: Atlas v3 activation masked the plan smoke assertions

The Supabase run 44449079468 (2026-11-19) deployed its functions and migrations but failed all three post-deploy smoke attempts during part 1, "plan proposal and approval": "Stage-free large plan was not rejected". Tool listing, fixtures and planning resume passed.

**Cause.** The production settings row now has `atlas_migrated_at` set. Since Atlas v3 activation, `proposePlan` requires `plan_template_v1` before it reaches the legacy stage and idea hierarchy guards. The long-standing selftest supplied no template and expected the stage-structure error, so an actual template-required rejection was misreported as missing stage validation. Its accepted plan would also have failed without a template.

**Fix.** Only for an activated owner, the selftest supplies a minimal plan template that passes the existing TypeScript and SQL template contracts. It uses that same template when exercising the stage-free and flat-idea rejections and when approving its three-checkpoint isolated fixture. Before activation it passes no template, preserving the old smoke. All existing selftest checks, guard assertions, cleanup and the four-part schedule remain unchanged. Product plan validation is not weakened or bypassed.

**Regression.** `tests/unit/mcp/incident-1518-selftest-template.test.ts` checks the inactive path, template validation, checkpoint/prerequisite alignment, the existing scale limits and that all three proposal calls use the activation-aware args. A successful production deploy and its four-part MCP smoke are required to confirm incident resolution; this change does not manually clear S0 or write production study data.
