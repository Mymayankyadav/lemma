import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #636: overlapping deploy and standalone MCP selftests mutate the same
// owner-scoped fixture. GitHub Actions concurrency is not FIFO: a third
// trigger replaces the older pending run. Preserve every smoke verification.
const deploy=readFileSync('.github/workflows/supabase.yml','utf8');
const smoke=readFileSync('.github/workflows/mcp-smoke.yml','utf8');
const acquire='node scripts/mcp-selftest-queue.mjs acquire';
const release='node scripts/mcp-selftest-queue.mjs release';

describe('FIX #636: deployed MCP selftests cannot overlap',()=>{
 it('uses durable cross-workflow FIFO tickets rather than lossy Actions concurrency',()=>{
  for(const workflow of [deploy,smoke]){
   expect(workflow).toContain(acquire);
   expect(workflow).toContain(release);
   expect(workflow).toContain('issues: write');
   expect(workflow).toContain('actions: read');
   expect(workflow).not.toMatch(/^concurrency:/m);
   expect(workflow).toContain('if: always()');
   expect(workflow.indexOf(acquire)).toBeLessThan(workflow.indexOf('node tests/mcp/smoke.mjs'));
   expect(workflow.indexOf('node tests/mcp/smoke.mjs')).toBeLessThan(workflow.indexOf(release));
  }
  expect(deploy).toContain("if: steps.credentials.outputs.ready == 'true'");
  expect(deploy.indexOf(acquire)).toBeLessThan(deploy.indexOf('supabase db push'));
  expect(deploy.indexOf('supabase functions deploy mcp --no-verify-jwt')).toBeLessThan(deploy.indexOf(release));
  expect(smoke).toContain('timeout-minutes: 75');
  expect(deploy).toContain('timeout-minutes: 80');
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
