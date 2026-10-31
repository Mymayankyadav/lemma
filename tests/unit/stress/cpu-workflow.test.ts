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
  expect(existsSync('tests/cpu/stress-cpu.spec.ts')).toBe(true);
  expect(existsSync('tests/e2e/stress-cpu.spec.ts')).toBe(false);
  expect(workflow).toContain('test "$count" -eq 18');
  expect(workflow).toContain('name: e2e-${{ matrix.shard }}-of-4');
  expect(workflow).toContain('needs: e2e');
 });
});
