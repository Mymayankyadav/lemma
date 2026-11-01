import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

describe('AUDIT #540 cold CPU clock diagnostics',()=>{
 it('records browser navigation, paint and first data-backed goal marks without replacing the 1500ms hard gate',()=>{
  const source=readFileSync(join(process.cwd(),'tests/cpu/stress-cpu.spec.ts'),'utf8');
  expect(source).toContain('const durationMs=Date.now()-start');
  expect(source).toContain("performance.getEntriesByType('navigation')");
  expect(source).toContain("performance.getEntriesByType('paint')");
  expect(source).toContain("performance.getEntriesByName('lemma-stress-first-goal-paint'");
  expect(source).toContain('browserTiming');
  expect(source).toContain('expect(auditCpuMatrix(samples,matrix)');
 });
});
