// Fixed-k personal-history sensitivity, using the actual autocorrection gate.
import {readFile,writeFile} from 'node:fs/promises';
import {padEdit} from '../src/features/pad/padEdit';
import {evaluateWritingAutoCorrection,writingAutoPrecisionLowerBound} from '../src/features/tutor/writingAid/autoCorrect';
const dir='docs/implementation/2026-11-21/writing-aid-tutor';
const fixture=JSON.parse(await readFile(`${dir}/personal-dataset.json`,'utf8'));
type Row={id:string;split:string;class:string;user:string;family:string;draft:string;intent:string;preferenceShift:boolean;
 history:Array<{pair:string;action:string;undo:boolean;partialEdit:boolean}>};
const rows:Row[]=fixture.cases;
const classes=['teh->the','recieve->receive','recieved->received','seperate->separate'];
const evidence=classes.map(name=>({ruleId:name.replace('->','-to-'),sampleSize:200,correct:200,
 artifact:'probe-only-not-installed',population:'synthetic' as const}));

function bootstrap(grouped:Map<string,Array<{ok:boolean}>>) {
 const groups=[...grouped.values()]; if(!groups.length)return null;
 let seed=1809311; const draw=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2**32;};
 const samples:number[]=[];
 for(let j=0;j<3000;j++){
  let good=0,total=0;
  for(let k=0;k<groups.length;k++){
   const group=groups[Math.floor(draw()*groups.length)];
   for(let z=0;z<group.length;z++){const v=group[Math.floor(draw()*group.length)];good+=Number(v.ok);total++;}
  }
  samples.push(total?good/total:0);
 }
 samples.sort((a,b)=>a-b);return [samples[Math.floor(samples.length*.025)],samples[Math.floor(samples.length*.975)]];
}
function evaluate(split:string,name:string,history:boolean){
 const selected=rows.filter(r=>r.split===split&&r.class===name),groups=new Map<string,Array<{ok:boolean}>>();
 let eligible=0,correct=0,incorrect=0,shifted=0,shiftErrors=0,deterministicEligible=0;
 const users=new Set(),drafts=new Set();
 for(const row of selected){
  const input={before:padEdit(row.draft),after:padEdit(row.draft+' '),anchor:{text:row.draft,start:0},
   target:{scopeKey:row.id,mountId:'personal-eval',editorRevision:0,selectionRevision:0,modeRevision:0},
   mode:'balanced' as const,enabled:true,composing:false,readOnly:false,inputType:'insertText'};
  const proposal=evaluateWritingAutoCorrection(input,evidence);if(!proposal)continue;deterministicEligible++;
  const last=row.history.slice(-2);
  if(history&&(last.length!==2||last.some(e=>e.pair!==name||e.action!=='manual-accept'||e.undo||e.partialEdit)))continue;
  eligible++;users.add(row.user);drafts.add(row.draft);const ok=proposal.corrected.text===row.intent+' ';
  correct+=Number(ok);incorrect+=Number(!ok);if(row.preferenceShift){shifted++;shiftErrors+=Number(!ok);}
  const group=groups.get(row.family)||[];group.push({ok});groups.set(row.family,group);
 }
 return {profiles:selected.length,families:new Set(selected.map(r=>r.family)).size,deterministicEligible,
  eligible,eligibleUsers:users.size,distinctDrafts:drafts.size,correct,incorrect,coverage:eligible/selected.length,
  wholePopulationHarmRate:incorrect/selected.length,precision:eligible?correct/eligible:null,
  wilson95Lower:writingAutoPrecisionLowerBound(correct,eligible),familyClusterBootstrap95:bootstrap(groups),shifted,shiftErrors};
}
const calibration=Object.fromEntries(classes.map(c=>[c,evaluate('calibration',c,true)]));
const selected=classes.filter(c=>calibration[c].eligibleUsers>=200&&calibration[c].wilson95Lower>=.98);
const result={scope:'Preregistered k=2 synthetic sensitivity; no rule is installed and no human precision is inferred.',
 protocol:'personal-protocol.json',calibration,selected,holdoutGlobal:Object.fromEntries(classes.map(c=>[c,evaluate('test',c,false)])),
 holdoutPersonalProbe:Object.fromEntries(classes.map(c=>[c,evaluate('test',c,true)])),
 holdoutSelected:Object.fromEntries(classes.map(c=>[c,selected.includes(c)?evaluate('test',c,true):null]))};
await writeFile(`${dir}/personal-results.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({selected,calibration,holdoutPersonalProbe:result.holdoutPersonalProbe}));
