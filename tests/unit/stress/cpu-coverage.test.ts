import {describe,expect,it} from 'vitest';
import {QA3_ROUTES} from '../../../scripts/qa3-report';
import {CPU_CASES,auditCpuCoverage,cpuMatrixTimeoutMs,type CpuRouteSample} from '../../../scripts/stress-cpu-coverage';

const samples=():CpuRouteSample[]=>CPU_CASES.flatMap(c=>QA3_ROUTES.map(route=>({
 route,actualRoute:route,profile:c.profile,theme:c.theme,width:c.width,
 cpuThrottle:4,durationMs:850,navigationType:'document',ready:true,
 nodes:400,screenshot:'test-results/screens/stress-cpu/'+route.replaceAll('/','-')+'.png',
})));

describe('AUDIT #540: fail-closed 4x cold-route coverage',()=>{
 it('allows the full 18-route extreme evidence pass to finish before judging its 4000ms per-route budget',()=>{
  // A first-attempt extreme run already exceeded 600s after only 11/18 routes.
  // This is a harness execution ceiling, NOT a relaxation of any route budget.
  expect(cpuMatrixTimeoutMs('stress')).toBe(600_000);
  expect(cpuMatrixTimeoutMs('extreme')).toBe(1_800_000);
 });
 it('requires all 144 matrix cells, not just Today or one worst-case profile',()=>{
  expect(samples()).toHaveLength(144);
  expect(auditCpuCoverage(samples())).toEqual([]);
 });
 it('rejects the old 1x-only route evidence in any matrix',()=>{
  const rows=samples().map(row=>row.route==='/'?row:{...row,cpuThrottle:1});
  expect(auditCpuCoverage(rows)).toContain('missing 4x cold first-render evidence for stress/graph/360 /projects');
  expect(auditCpuCoverage(rows)).toContain('missing 4x cold first-render evidence for extreme/graph-night/390 /projects');
 });
 it('rejects missing, duplicate, cached-hash and stale-route evidence',()=>{
  expect(auditCpuCoverage(samples().slice(1))).toContain('missing 4x cold first-render evidence for stress/graph/360 /');
  expect(auditCpuCoverage([...samples(),samples()[0]])).toContain('duplicate 4x route stress/graph/360 /');
  const cached=samples().map(row=>row.route==='/cards'&&row.profile==='stress'&&row.theme==='graph'&&row.width===360
   ?{...row,navigationType:'hash'}:row);
  expect(auditCpuCoverage(cached)).toContain('missing 4x cold first-render evidence for stress/graph/360 /cards');
  const stale=samples().map(row=>row.route==='/atlas'&&row.profile==='extreme'&&row.theme==='graph-night'&&row.width===390
   ?{...row,actualRoute:'/cards'}:row);
  expect(auditCpuCoverage(stale)).toContain('missing 4x cold first-render evidence for extreme/graph-night/390 /atlas');
 });
 it('keeps the strict 4000ms and 1500-node ceilings',()=>{
  const slow=samples().map(row=>row.route==='/atlas'&&row.profile==='extreme'&&row.theme==='graph-night'&&row.width===360
   ?{...row,durationMs:4000}:row);
  expect(auditCpuCoverage(slow)).toContain('/atlas [extreme/graph-night/360]: 4x CPU first render >= 4s');
  const overDom=samples().map(row=>row.route==='/atlas'&&row.profile==='extreme'&&row.theme==='graph-night'&&row.width===360
   ?{...row,nodes:1500}:row);
  expect(auditCpuCoverage(overDom)).toContain('/atlas [extreme/graph-night/360]: 1500 DOM nodes');
 });
 it('rejects missing screenshots, NaN and wrong matrix metadata',()=>{
  const missing=samples().map(row=>row.route==='/kit'&&row.profile==='stress'&&row.theme==='graph'&&row.width===360
   ?{...row,screenshot:''}:row);
  expect(auditCpuCoverage(missing)).toContain('missing 4x cold first-render evidence for stress/graph/360 /kit');
  const malformed=samples().map(row=>row.route==='/kit'&&row.profile==='stress'&&row.theme==='graph'&&row.width===360
   ?{...row,durationMs:NaN}:row);
  expect(auditCpuCoverage(malformed)).toContain('missing 4x cold first-render evidence for stress/graph/360 /kit');
  const wrong=samples().map(row=>row.route==='/kit'&&row.profile==='stress'&&row.theme==='graph'&&row.width===360
   ?{...row,profile:'unknown'}:row);
  expect(auditCpuCoverage(wrong)).toContain('unknown 4x matrix for /kit');
 });
});
