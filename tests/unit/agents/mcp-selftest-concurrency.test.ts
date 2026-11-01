import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #636: a workflow_run smoke triggered by deploy A must not race the
// mutating post-deploy selftest in queued deploy B. Both run the same owner-
// scoped connector selftest, and overlapping part-2 save_pages/undo calls
// have produced a PostgreSQL deadlock. Serialize without skipping a check.
const deploy=readFileSync('.github/workflows/supabase.yml','utf8');
const smoke=readFileSync('.github/workflows/mcp-smoke.yml','utf8');
const exclusive=/^concurrency:\s*\n\s*group:\s*lemma-mcp-selftest\s*\n\s*cancel-in-progress:\s*false/m;

describe('FIX #636: deployed MCP selftests cannot overlap',()=>{
 it('uses one repository-wide concurrency group in both workflows',()=>{
  expect(deploy).toMatch(exclusive);
  expect(smoke).toMatch(exclusive);
  // A branch/ref-specific group would still allow the same connector to be
  // tested simultaneously from a dispatch and a main deployment.
  expect(deploy).not.toMatch(/group:\s*lemma-mcp-selftest-\$\{/);
  expect(smoke).not.toMatch(/group:\s*lemma-mcp-selftest-\$\{/);
 });
 it('retains deploy and smoke verification rather than bypassing assertions',()=>{
  expect(deploy).toContain('supabase db push');
  expect(deploy).toContain('supabase functions deploy mcp --no-verify-jwt');
  expect(deploy).toContain('node tests/mcp/smoke.mjs');
  expect(deploy).toContain('Verify deployed MCP endpoint');
  expect(smoke).toContain('workflow_run:');
  expect(smoke).toContain('workflow_dispatch:');
  expect(smoke).toContain('node tests/mcp/smoke.mjs');
  expect(smoke).toContain('Verify deployed connector');
 });
});
