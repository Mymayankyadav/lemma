import {describe,expect,it} from 'vitest';
import {QA3_ROUTES} from '../../../scripts/qa3-report';
import {auditCpuCoverage, type CpuRouteSample} from '../../../scripts/stress-cpu-coverage';

const samples=():CpuRouteSample[]=>QA3_ROUTES.map(route=>({
 route, actualRoute:route, profile:'extreme', theme:'graph-night', width:360,
 cpuThrottle:4, durationMs:850, navigationType:'document', ready:true,
}));

describe('AUDIT #540: fail-closed 4x cold route coverage',()=>{
 it('requires a cold 4x first render for every visual route',()=>{
  expect(auditCpuCoverage(samples())).toEqual([]);
 });
 it('rejects the old 1x-only route evidence even when Today is 4x',()=>{
  const rows=samples().map((row,index)=>({...row,cpuThrottle:index===0?4:1}));
  expect(auditCpuCoverage(rows)).toContain('missing 4x cold first-render evidence for /projects');
 });
 it('rejects a missing route, duplicate, cached hash transition and stale screen',()=>{
  const missing=samples().slice(1);
  expect(auditCpuCoverage(missing)).toContain('missing 4x cold first-render evidence for /');
  const duplicate=[...samples(),samples()[0]];
  expect(auditCpuCoverage(duplicate)).toContain('duplicate 4x route /');
  const cached=samples().map(row=>row.route==='/cards'?{...row,navigationType:'hash' as const}:row);
  expect(auditCpuCoverage(cached)).toContain('missing 4x cold first-render evidence for /cards');
  const stale=samples().map(row=>row.route==='/atlas'?{...row,actualRoute:'/cards'}:row);
  expect(auditCpuCoverage(stale)).toContain('missing 4x cold first-render evidence for /atlas');
 });
 it('enforces the original 1500ms threshold, not an averaged or relaxed budget',()=>{
  const slow=samples().map(row=>row.route==='/atlas'?{...row,durationMs:1500}:row);
  expect(auditCpuCoverage(slow)).toContain('/atlas: 4x CPU first render >= 1.5s');
 });
 it('rejects missing, NaN and wrong worst-case profile metadata',()=>{
  const malformed=samples().map(row=>row.route==='/kit'?{...row,durationMs:NaN}:row);
  expect(auditCpuCoverage(malformed)).toContain('missing 4x cold first-render evidence for /kit');
  const easy=samples().map(row=>row.route==='/kit'?{...row,profile:'stress'}:row);
  expect(auditCpuCoverage(easy)).toContain('missing 4x cold first-render evidence for /kit');
 });
});
