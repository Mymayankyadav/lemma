/** QA-3 CPU evidence addendum. This is intentionally separate from the
 * eight-case layout report: hash transitions at 1x cannot certify 4x cold loads.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {QA3_ROUTES} from './qa3-report';
import {auditCpuCoverage,type CpuRouteSample} from './stress-cpu-coverage';

export type Qa3CpuReport={
 status:'PASS'|'FAIL'|'INCOMPLETE';
 measured:number;expected:number;errors:string[];
 rows:CpuRouteSample[];
};
function validSample(x:unknown):x is CpuRouteSample{
 if(!x||typeof x!=='object'||Array.isArray(x))return false;
 const r=x as Record<string,unknown>;
 return ['route','actualRoute','profile','theme','navigationType','screenshot'].every(k=>typeof r[k]==='string') &&
  ['width','cpuThrottle','durationMs','nodes'].every(k=>typeof r[k]==='number') &&
  typeof r.ready==='boolean';
}
export function analyzeQa3Cpu(raw:unknown):Qa3CpuReport{
 if(!Array.isArray(raw))return {status:'INCOMPLETE',measured:0,expected:QA3_ROUTES.length,
  errors:['missing or non-array 4x cold-route evidence'],rows:[]};
 const rows=raw.filter(validSample);
 const errors=rows.length===raw.length?[]:['malformed 4x cold-route measurement'];
 errors.push(...auditCpuCoverage(rows));
 const missing=errors.some(e=>e.startsWith('missing ')||e.startsWith('malformed '));
 return {status:missing?'INCOMPLETE':errors.length?'FAIL':'PASS',
  measured:rows.length,expected:QA3_ROUTES.length,errors,rows};
}
export function renderQa3CpuMarkdown(report:Qa3CpuReport):string{
 const lines=[
  '# QA-3 — 4× CPU cold-route evidence',
  '',
  '**Status: '+report.status+'**',
  'Measured: '+report.measured+'/'+report.expected+' visual routes.',
  'Profile: extreme · Graph night · 360px. Every route uses a new document.',
  'The eight-case ST-0 layout matrix is separate and does not substitute for this CPU proof.',
  '',
  '| Route | First render at 4× | DOM nodes | Screenshot |',
  '| --- | ---: | ---: | --- |',
 ];
 for(const row of report.rows)lines.push('| '+row.route+' | '+row.durationMs+'ms | '+row.nodes+' | '+row.screenshot+' |');
 lines.push('','## Evidence failures','');
 if(report.errors.length)for(const error of report.errors)lines.push('- '+error);
 else lines.push('None.','');
 return lines.join('\n');
}
function main():void{
 const input=process.argv[2]??'test-results/stress-cpu/extreme-graph-night-360.json';
 const output=process.argv[3]??'test-results/qa3/cpu-route-report.md';
 let raw:unknown=null;
 try{raw=JSON.parse(readFileSync(resolve(input),'utf8')) as unknown;}catch{raw=null;}
 const report=analyzeQa3Cpu(raw);
 mkdirSync(dirname(resolve(output)),{recursive:true});
 writeFileSync(resolve(output),renderQa3CpuMarkdown(report),'utf8');
 process.stdout.write('QA-3 4x CPU '+report.status+' · '+report.measured+'/'+report.expected+' routes\n');
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
