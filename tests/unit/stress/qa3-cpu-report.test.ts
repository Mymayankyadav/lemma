import {describe,expect,it} from 'vitest';
import {QA3_ROUTES} from '../../../scripts/qa3-report';
import {CPU_CASES} from '../../../scripts/stress-cpu-coverage';
import {analyzeQa3Cpu,renderQa3CpuMarkdown} from '../../../scripts/qa3-cpu-report';

const sample=()=>CPU_CASES.flatMap(c=>QA3_ROUTES.map(route=>({
 route,actualRoute:route,profile:c.profile,theme:c.theme,width:c.width,
 cpuThrottle:4,durationMs:800,navigationType:'document',ready:true,nodes:450,
 screenshot:'test-results/screens/stress-cpu/'+c.profile+'-'+c.theme+'-'+c.width+'-'+route.replaceAll('/','-')+'.png',
})));

describe('QA-3 full 4x CPU evidence addendum',()=>{
 it('fails closed when evidence is absent',()=>{
  const report=analyzeQa3Cpu(null);
  expect(report.status).toBe('INCOMPLETE');
  expect(report.errors).toContain('missing or non-array 4x cold-route evidence');
 });
 it('rejects a missing profile/theme/width matrix',()=>{
  const report=analyzeQa3Cpu(sample().filter(row=>!(row.profile==='extreme'&&row.theme==='graph-night'&&row.width===390)));
  expect(report.status).toBe('INCOMPLETE');
  expect(report.errors).toContain('missing 4x cold first-render evidence for extreme/graph-night/390 /');
 });
 it('does not accept old 1x-only evidence on non-Today routes',()=>{
  const report=analyzeQa3Cpu(sample().map(row=>({...row,cpuThrottle:row.route==='/'?4:1})));
  expect(report.status).toBe('INCOMPLETE');
  expect(report.errors).toContain('missing 4x cold first-render evidence for stress/graph/360 /projects');
 });
 it('reports a hard failure at exactly 1500ms',()=>{
  const report=analyzeQa3Cpu(sample().map(row=>row.route==='/atlas'&&row.profile==='extreme'&&row.theme==='graph-night'&&row.width===360
   ?{...row,durationMs:1500}:row));
  expect(report.status).toBe('FAIL');
  expect(report.errors).toContain('/atlas [extreme/graph-night/360]: 4x CPU first render >= 1.5s');
 });
 it('passes only all 144 cold cells and prints each route',()=>{
  const report=analyzeQa3Cpu(sample());
  expect(report.status).toBe('PASS');
  expect(report.measured).toBe(144);
  expect(renderQa3CpuMarkdown(report)).toContain('| extreme/graph-night/360 | /atlas | 800ms | 450 |');
 });
 it('rejects malformed evidence without throwing',()=>{
  const report=analyzeQa3Cpu([...sample(),null]);
  expect(report.status).toBe('INCOMPLETE');
  expect(report.errors).toContain('malformed 4x cold-route measurement');
 });
});
