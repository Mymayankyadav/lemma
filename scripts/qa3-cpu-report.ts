/** QA-3 full 144-cell cold 4x CPU evidence addendum.
 * This is separate from the 1x hash-transition layout report and fails closed.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CPU_CASES,auditCpuCoverage,cpuCaseKey,type CpuRouteSample} from './stress-cpu-coverage';

export type Qa3CpuReport={
 status:'PASS'|'FAIL'|'INCOMPLETE';measured:number;expected:number;
 errors:string[];rows:CpuRouteSample[];
};
function validSample(x:unknown):x is CpuRouteSample{
 if(!x||typeof x!=='object'||Array.isArray(x))return false;
 const r=x as Record<string,unknown>;
 return ['route','actualRoute','profile','theme','navigationType','screenshot'].every(k=>typeof r[k]==='string')&&
  ['width','cpuThrottle','durationMs','nodes'].every(k=>typeof r[k]==='number')&&
  typeof r.ready==='boolean';
}
export function analyzeQa3Cpu(raw:unknown):Qa3CpuReport{
 if(!Array.isArray(raw))return {status:'INCOMPLETE',measured:0,expected:144,
  errors:['missing or non-array 4x cold-route evidence'],rows:[]};
 const rows=raw.filter(validSample);
 const errors=rows.length===raw.length?[]:['malformed 4x cold-route measurement'];
 errors.push(...auditCpuCoverage(rows));
 const incomplete=errors.some(e=>e.startsWith('missing ')||e.startsWith('malformed ')||
  e.startsWith('unknown ')||e.startsWith('duplicate ')||e.startsWith('mismatched '));
 return {status:incomplete?'INCOMPLETE':errors.length?'FAIL':'PASS',
  measured:rows.length,expected:144,errors,rows};
}
export function renderQa3CpuMarkdown(report:Qa3CpuReport):string{
 const lines=[
  '# QA-3 — 4× CPU cold-route evidence',
  '',
  '**Status: '+report.status+'**',
  'Measured: '+report.measured+'/'+report.expected+' visual route/matrix cells.',
  'Profiles: stress and extreme; Graph day/night; 360px and 390px.',
  'Every route uses a new document and Navigation Timing proof; no cached hash transition substitutes.',
  'The original ST-0 layout matrix remains a separate gate.',
  '',
  '| Matrix | Route | First render at 4× | DOM nodes | Screenshot |',
  '| --- | --- | ---: | ---: | --- |',
 ];
 for(const row of report.rows)lines.push('| '+row.profile+'/'+row.theme+'/'+row.width+
  ' | '+row.route+' | '+row.durationMs+'ms | '+row.nodes+' | '+row.screenshot+' |');
 lines.push('','## Evidence failures','');
 if(report.errors.length)for(const error of report.errors)lines.push('- '+error);
 else lines.push('None.');
 return lines.join('\n');
}
function main():void{
 const inputDir=process.argv[2]??'test-results/stress-cpu';
 const output=process.argv[3]??'test-results/qa3/cpu-route-report.md';
 const all:unknown[]=[];const missing:string[]=[];
 for(const c of CPU_CASES){
  const path=resolve(inputDir,c.profile+'-'+c.theme+'-'+c.width+'.json');
  try{
   const parsed=JSON.parse(readFileSync(path,'utf8')) as unknown;
   if(Array.isArray(parsed))all.push(...parsed);
   else missing.push(cpuCaseKey(c)+': non-array evidence');
  }catch{missing.push(cpuCaseKey(c)+': missing 4x CPU file');}
 }
 const report=analyzeQa3Cpu(all);
 if(missing.length){report.errors.unshift(...missing);report.status='INCOMPLETE';}
 mkdirSync(dirname(resolve(output)),{recursive:true});
 writeFileSync(resolve(output),renderQa3CpuMarkdown(report),'utf8');
 process.stdout.write('QA-3 4x CPU '+report.status+' · '+report.measured+'/'+report.expected+' route cells\n');
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
