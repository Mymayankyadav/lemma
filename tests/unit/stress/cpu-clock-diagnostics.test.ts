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
 it('records each loaded-state assertion and the two paint frames without replacing the wall-clock gate',()=>{
  const readiness=readFileSync(join(process.cwd(),'tests/e2e/stress-cpu-readiness.ts'),'utf8');
  const cpu=readFileSync(join(process.cwd(),'tests/cpu/stress-cpu.spec.ts'),'utf8');
  for(const phase of ['route-marker','cards-first-row','cards-loaded-count','plan-heading',
   'plan-ideas-region','session-events','no-skeleton','no-card-proposal-error',
   'no-session-error']){
   expect(readiness,'missing loaded-state phase '+phase).toContain("'"+phase+"'");
  }
  // The expensive wait often happens before the first route-marker check.
  // Keep independent diagnostics for document load, theme and real heading.
  for(const phase of ['document-navigation','theme-ready','heading-ready']){
   expect(cpu,'missing pre-readiness phase '+phase).toContain("'"+phase+"'");
  }
  expect(cpu).toContain("'two-paint-frames'");
  expect(cpu).toContain('readinessPhases');
  expect(cpu).toContain('const durationMs=Date.now()-start');
  expect(cpu).toContain('expect(auditCpuMatrix(samples,matrix)');
 });

});
