import {describe,expect,it} from 'vitest';
import {QA3_ROUTES} from '../../../scripts/qa3-report';
import {analyzeQa3Cpu,renderQa3CpuMarkdown} from '../../../scripts/qa3-cpu-report';

const sample=()=>QA3_ROUTES.map(route=>({
 route,actualRoute:route,profile:'extreme',theme:'graph-night',width:360,
 cpuThrottle:4,durationMs:800,navigationType:'document',ready:true,nodes:450,
 screenshot:'test-results/screens/stress-cpu/'+route.replaceAll('/','-')+'.png',
}));

describe('QA-3 4x CPU addendum',()=>{
 it('fails closed when the route-specific evidence file is absent',()=>{
  const report=analyzeQa3Cpu(null);
  expect(report.status).toBe('INCOMPLETE');
  expect(report.errors).toContain('missing or non-array 4x cold-route evidence');
 });
 it('does not accept old 1x-only evidence for 17 routes',()=>{
  const report=analyzeQa3Cpu(sample().map((row,i)=>({...row,cpuThrottle:i?1:4})));
  expect(report.status).toBe('INCOMPLETE');
  expect(report.errors).toContain('missing 4x cold first-render evidence for /projects');
 });
 it('reports a hard failure at exactly 1500ms',()=>{
  const report=analyzeQa3Cpu(sample().map(row=>row.route==='/atlas'?{...row,durationMs:1500}:row));
  expect(report.status).toBe('FAIL');
  expect(report.errors).toContain('/atlas: 4x CPU first render >= 1.5s');
 });
 it('passes only with all 18 cold measurements and records route-specific evidence',()=>{
  const report=analyzeQa3Cpu(sample());
  expect(report.status).toBe('PASS');
  expect(report.measured).toBe(18);
  expect(renderQa3CpuMarkdown(report)).toContain('| /atlas | 800ms | 450 |');
 });
 it('rejects malformed evidence without throwing or treating it as complete',()=>{
  const report=analyzeQa3Cpu([...sample(),null]);
  expect(report.status).toBe('INCOMPLETE');
  expect(report.errors).toContain('malformed 4x cold-route measurement');
 });
});
