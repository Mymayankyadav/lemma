// Evaluate the real deterministic autocorrection gate on independent synthetic
// examples; do not install evidence into the production registry.
import {readFile, writeFile} from 'node:fs/promises';
import {padEdit} from '../src/features/pad/padEdit';
import {detectWritingAutoCorrection, evaluateWritingAutoCorrection, writingAutoPrecisionLowerBound,
  type WritingAutoCalibration} from '../src/features/tutor/writingAid/autoCorrect';

const directory='docs/implementation/2026-11-21/writing-aid-tutor';
const fixture=JSON.parse(await readFile(`${directory}/dataset.json`,'utf8'));
type Row = {id:string; split:string; class:string; typo:string; candidate:string; draft:string; user:string;
  intent:string; shouldChange:boolean; intentional:boolean; literal:boolean; math:boolean; preferenceShift:boolean;
  history:Array<{at:number;pair:string;action:string;undo:boolean;partialEdit:boolean}>};
const rows: Row[]=fixture.typoCases;
const classes=['teh->the','recieve->receive','recieved->received','seperate->separate'];
const rule=(name:string)=>name.replace('->','-to-');
const injected:WritingAutoCalibration[]=classes.map(name=>({ruleId:rule(name),sampleSize:200,correct:200,
  artifact:'evaluation-only-permissive-probe',population:'synthetic'}));
function request(row:Row) {
  return {before:padEdit(row.draft), after:padEdit(row.draft+' '),
    anchor:{text:row.draft,start:0}, target:{scopeKey:row.id,mountId:'calibration',editorRevision:0,selectionRevision:0,modeRevision:0},
    mode:'balanced' as const,enabled:true,composing:false,readOnly:false,inputType:'insertText'};
}
function summarize(split:string,name:string,evidence:readonly WritingAutoCalibration[],historyK=0) {
  const selected=rows.filter(r=>r.split===split && r.class===name);
  let eligible=0,correct=0,incorrect=0,literalBlocked=0,mathBlocked=0,productionCorrections=0,shifted=0,shiftErrors=0;
  const unique=new Set<string>(), users=new Set<string>(), errors:string[]=[];
  for (const row of selected) {
    const input=request(row), result=evaluateWritingAutoCorrection(input,evidence);
    if (detectWritingAutoCorrection(input)) productionCorrections++;
    if (!result) {if(row.literal)literalBlocked++;if(row.math)mathBlocked++;continue;}
    const recent=row.history.slice(-historyK);
    if (historyK && (recent.length<historyK || recent.some(event=>event.pair!==name || event.action!=='manual-accept' || event.undo || event.partialEdit))) continue;
    eligible++; unique.add(row.draft); users.add(row.user); if(row.preferenceShift)shifted++;
    if (result.corrected.text===row.intent+' ') correct++;
    else {incorrect++;if(row.preferenceShift)shiftErrors++;if(errors.length<12)errors.push(row.id);}
  }
  return {examples:selected.length,eligible,distinctEligibleDrafts:unique.size,eligibleUsers:users.size,correct,incorrect,
    coverage:eligible/selected.length,wholePopulationIncorrectRate:incorrect/selected.length,shifted,shiftErrors,
    wilson95Lower:writingAutoPrecisionLowerBound(correct,eligible),literalBlocked,mathBlocked,productionCorrections,errorExamples:errors};
}
const calibration=Object.fromEntries(classes.map(name=>[name,summarize('calibration',name,injected)]));
const accepted:WritingAutoCalibration[]=classes.filter(name=>{
  const x=calibration[name];return x.eligible>=200 && x.distinctEligibleDrafts>=200 && x.wilson95Lower>=.98;
}).map(name=>({ruleId:rule(name),sampleSize:calibration[name].eligible,correct:calibration[name].correct,
  artifact:'synthetic-independent-calibration',population:'synthetic'}));
const testGateProbe=Object.fromEntries(classes.map(name=>[name,summarize('test',name,injected)]));
const testSelected=Object.fromEntries(classes.map(name=>[name,summarize('test',name,accepted)]));
const historyCalibration=Object.fromEntries(classes.map(name=>[name,Object.fromEntries([1,2,3,4,5].map(k=>[k,summarize('calibration',name,injected,k)]))]));
const selectedHistoryK=Object.fromEntries(classes.map(name=>[name,[1,2,3,4,5].find(k=>{
  const x=historyCalibration[name][k];return x.eligibleUsers>=200 && x.distinctEligibleDrafts>=200 && x.wilson95Lower>=.98;
}) ?? null]));
const historyTest=Object.fromEntries(classes.map(name=>[name,Object.fromEntries([1,2,3,4,5].map(k=>[k,summarize('test',name,injected,k)]))]));
const historySelectedTest=Object.fromEntries(classes.map(name=>[name,selectedHistoryK[name]===null ? null :
  summarize('test',name,injected,selectedHistoryK[name] as number)]));
const output={scope:'Independent synthetic, template-generated cases; not a human precision estimate. Injected 200/200 evidence is used only to expose the deterministic gate, never installed.',
  threshold:{minimumEligible:200,minimumDistinctDrafts:200,wilson95Lower:.98},calibration,
  selectedRuleIds:accepted.map(x=>x.ruleId),testGateProbe,testSelected,
  historyPolicy:'Research-only: last k attempts for the same pair are all explicit manual accepts, with no undo/dismiss/partial edit; auto/passive/tutor signals never count.',
  historyCalibration,selectedHistoryK,historyTest,historySelectedTest,
  actualProductionRegistry:'synthetic conditional rows installed; this probe supplies no trusted personal history so detectWritingAutoCorrection must abstain'};
if (Object.values(testGateProbe).some((x:any)=>x.productionCorrections)) throw Error('Untrusted probe unexpectedly enabled autocorrection');
await writeFile(`${directory}/autocorrect.json`,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({selected:output.selectedRuleIds,selectedHistoryK,calibration,testGateProbe,historySelectedTest}));
