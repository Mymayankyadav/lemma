// Three-occurrence sensitivity: two cold manual accepts, then one conditioned
// automatic correction; no extra history or intent is used by the gate.
import {readFile,writeFile} from 'node:fs/promises';
import {padEdit} from '../src/features/pad/padEdit';
import {evaluateWritingAutoCorrection} from '../src/features/tutor/writingAid/autoCorrect';
const dir='docs/implementation/2026-11-21/writing-aid-tutor';
const {cases}=JSON.parse(await readFile(`${dir}/personal-dataset.json`,'utf8'));
const classes=['teh->the','recieve->receive','recieved->received','seperate->separate'];
const evidence=classes.map(name=>({ruleId:name.replace('->','-to-'),sampleSize:200,correct:200,
 artifact:'evaluation-only-probe',population:'synthetic' as const}));
const output:Record<string,unknown>={};
for(const name of classes){
 let n=0,harm=0,target=0,manualBase=0,autoBase=0;
 const [source,replacement]=name.split('->');
 for(const row of cases.filter((x:any)=>x.split==='test'&&x.class===name)){
  const last=row.history.slice(-2);
  if(last.length!==2||last.some((e:any)=>e.pair!==name||e.action!=='manual-accept'||e.undo||e.partialEdit))continue;
  const input={before:padEdit(row.draft),after:padEdit(row.draft+' '),anchor:{text:row.draft,start:0},
   target:{scopeKey:row.id,mountId:'cost',editorRevision:0,selectionRevision:0,modeRevision:0},
   mode:'balanced' as const,enabled:true,composing:false,readOnly:false,inputType:'insertText'};
  const proposal=evaluateWritingAutoCorrection(input,evidence);if(!proposal)continue;
  const correct=proposal.corrected.text===row.intent+' ';n++;harm+=Number(!correct);
  // All three modeled inputs type the alias and separator. The first two
  // choices are explicitly accepted. On the third, a mismatch is undone in
  // one second; this is an assumption, not an observed human recovery time.
  const typedSeconds=3*(source.length+1)*.4;
  target+=2*(replacement.length+1)+(correct?replacement.length+1:source.length+1);
  manualBase+=typedSeconds+2*.3+(correct?.3:0);
  autoBase+=typedSeconds+2*.3+(correct?0:1);
 }
 const estimates=Object.fromEntries([0,40,100].map(ms=>{
  const manualSeconds=manualBase+n*3*ms/1000,autoSeconds=autoBase+n*2*ms/1000;
  return [ms,{manualWpm:target/5/(manualSeconds/60),conditionalAutoWpm:target/5/(autoSeconds/60)}];
 }));
 output[name]={qualifyingProfiles:n,misfiredThird:harm,requiredColdManualAccepts:2*n,estimates};
}
const result={scope:'Illustrative three-occurrence cost sensitivity for qualifying synthetic profiles only; assumes both prior manual accepts were correct and every third-event mistake is undone in 1s. Not a human study or whole-session replay.',
 assumptions:{manualSecondsPerCharacter:.4,tapSeconds:.3,wrongAutoUndoSeconds:1,attentionMs:[0,40,100]},classes:output};
await writeFile(`${dir}/personal-cost.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(output));
