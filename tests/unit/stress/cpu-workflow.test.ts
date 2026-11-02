import {evaluateMergeGate} from '../../../scripts/merge-gate';
import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/ci.yml','utf8');
const browser=readFileSync('playwright.config.ts','utf8');
const cold=existsSync('playwright.cpu.config.ts')?readFileSync('playwright.cpu.config.ts','utf8'):'';

describe('AUDIT #540: cold 4x matrix and full sharded Playwright coexist',()=>{
 it('keeps all seven fail-closed base jobs and all eight independent cold CPU cells',()=>{
  for(const job of ['  check:','  e2e:','  qa3-screens:','  mcp-sql:','  cpu-matrix:','  cpu-aggregate:'])
   expect(workflow).toContain(job);
  expect(workflow).toContain('shard: [1, 2, 3, 4]');
  expect(workflow).toContain('profile: [stress, extreme]');
  expect(workflow).toContain('theme: [graph, graph-night]');
  expect(workflow).toContain('width: [360, 390]');
  expect(workflow).toContain('needs: [cpu-matrix]');
  expect(workflow).toContain('npx tsx scripts/qa3-cpu-report.ts');
 });
 it('runs cold 4x tests exactly in the dedicated matrix, never drops them',()=>{
  expect(workflow).toContain('npx playwright test --config playwright.cpu.config.ts tests/cpu/stress-cpu.spec.ts');
  expect(workflow).toContain('--grep "AUDIT #540 cold 4x');
  // The four base shards must run their entire testDir with no exclusions;
  // 144 cold cases live in a separate, explicitly required CPU testDir.
  expect(workflow).toContain('--shard=\${{ matrix.shard }}/4');
  expect(workflow).not.toMatch(/--grep-invert/);
  expect(browser).toContain("testDir: './tests/e2e'");
  expect(cold).toContain("testDir: './tests/cpu'");
  // CPU evidence is strictly first-attempt. Inheriting CI retries=2 hides
  // over-budget first renders and can cancel 45-minute extreme matrices.
  // Zero retries strengthens, never relaxes, the 1,500ms cold-render gate.
  expect(cold).toMatch(/retries:\s*0/);
  expect(existsSync('tests/cpu/stress-cpu.spec.ts')).toBe(true);
  expect(existsSync('tests/e2e/stress-cpu.spec.ts')).toBe(false);
  expect(workflow).toContain('test "$count" -eq 18');
  expect(workflow).toContain('name: e2e-${{ matrix.shard }}-of-4');
  expect(workflow).toContain('needs: e2e');
 });
});


// AUDIT #540: the canonical seven-job merge gate must not silently accept a
// PR whose CPU evidence jobs were omitted from the REST check-run response.
describe('AUDIT #540 exact-head CPU merge gate',()=>{
 const headSha='cpu-gate-test-head';
 const base=['check','mcp-sql','e2e-1-of-4','e2e-2-of-4','e2e-3-of-4','e2e-4-of-4','qa3-screens'];
 const cpu=['cpu-aggregate',...['stress','extreme'].flatMap(profile=>
  ['graph','graph-night'].flatMap(theme=>[360,390].map(width=>
   'cpu-matrix ('+profile+', '+theme+', '+width+')')))];
 const names=[...base,...cpu];
 const evaluate=(checks:string[])=>evaluateMergeGate({
  headSha,draft:false,body:'Ready to merge\n',mergeable:true,mergeableState:'clean',leaseEligible:true,
  checkRuns:checks.map((name,i)=>({name,id:i+1,headSha,status:'completed',conclusion:'success'})),
  commitStatuses:[],auditComments:[],
 });
 it('accepts all 16 exact-head completed-success jobs',()=>{
  expect(names).toHaveLength(16);
  expect(evaluate(names).ok).toBe(true);
 });
 for(const missing of cpu)it('fails closed if '+missing+' is absent',()=>{
  const decision=evaluate(names.filter(name=>name!==missing));
  expect(decision.ok).toBe(false);
  expect(decision.reason).toContain(missing);
 });
});
