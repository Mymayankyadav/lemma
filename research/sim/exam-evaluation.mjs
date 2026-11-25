// Offline only. A prediction or output from the paired simulator is never trial evidence.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {selectExam,inputsHash} from '../../supabase/functions/_shared/exam/selector.ts';

const policies=['atlas','weighted','adaptive'];
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const finite=Number.isFinite;
const unit=x=>finite(x)&&x>=0&&x<=1;
function rng(seed) {let state=seed>>>0;return ()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);}
export function design(blocks) {
  const families=blocks.flat();
  if(!blocks.length||blocks.some(b=>b.length!==3)||new Set(families).size!==families.length||families.some(f=>typeof f!=='string'||!f))
    throw Error('Supply matched blocks of three disjoint topic families.');
  return blocks.flatMap((b,i)=>b.map((family,position)=>({block:i,family,position,policy:policies[(i+position)%3]})));
}
function interval(samples) {
  if(samples.length<2)return {n:samples.length,mean:mean(samples),interval95:null};
  const random=rng(4701);
  const boot=Array.from({length:5000},()=>mean(samples.map(()=>samples[Math.floor(random()*samples.length)]))).sort((a,b)=>a-b);
  return {n:samples.length,mean:mean(samples),interval95:[boot[124],boot[4874]]};
}
export async function replay(decisions) {
  const differences=[],invalid=[];
  for(const d of decisions){
    if(!d.inputs||!d.qualitative||!d.chosen){invalid.push(d.id);continue;}
    const h=await inputsHash({inputs:d.inputs,predictions:d.predictions,qualitative:d.qualitative});
    const result=selectExam(d.inputs);
    if(h!==d.inputs_hash||JSON.stringify([result.chosen.action,result.chosen.keys,result.chosen.gain_mid])!==
      JSON.stringify([d.chosen.action,d.chosen.keys,d.chosen.gain_mid])){invalid.push(d.id);continue;}
    if(result.chosen.action!==d.qualitative.kind||JSON.stringify(result.chosen.keys)!==JSON.stringify(d.qualitative.keys))
      differences.push({id:d.id,shown:d.qualitative,shadow:result.chosen,why:result.chosen.rationale});
  }
  return {decisions:decisions.length,invalid,differences};
}
// Use the latest applicable pre-response forecast. Equal timestamps cannot
// establish causal order. Corrections keep the original response and revised score.
export function assessmentsFromExport(decisions,attempts) {
  const assessments=[];
  for(const a of attempts) {
    if(a.voided_at||a.independence==='reading'||!['correct','partial','incorrect'].includes(a.outcome))continue;
    const time=Math.min(Date.parse(a.created_at),Date.parse(a.occurred_at));
    if(!finite(time))continue;
    const prior=decisions.filter(d=>d.user_id===a.user_id&&d.sitting_id===a.sitting_id&&d.inputs?.blueprintVersion===a.blueprint_version&&
      Date.parse(d.decided_at)<time&&d.predictions?.some(p=>p.key===a.row_key)).sort((x,y)=>Date.parse(y.decided_at)-Date.parse(x.decided_at));
    if(!prior.length||prior[1]&&Date.parse(prior[0].decided_at)===Date.parse(prior[1].decided_at))continue;
    const fraction={correct:1,partial:.5,incorrect:0}[a.outcome];
    assessments.push({decisionId:prior[0].id,row:a.row_key,observedAt:new Date(time).toISOString(),marks:a.marks_awarded??fraction,
      maximum:a.marks_possible??1,binary:a.marks_possible==null&&a.outcome!=='partial',hinted:a.hint_level>0||a.independence!=='independent'});
  }
  return assessments;
}
export function audit(decisions,assessments) {
  const byId=new Map(decisions.map(d=>[d.id,d])),groups=new Map();
  let matched=0,excluded=0;
  for(const a of assessments){
    const d=byId.get(a.decisionId),p=d?.predictions?.find(p=>p.key===a.row);
    if(!p||Date.parse(d.decided_at)>=Date.parse(a.observedAt)||!finite(Date.parse(a.observedAt))||!finite(Date.parse(d.decided_at))||
      !unit(p.p)||!unit(p.low)||!unit(p.high)||p.low>p.high||!finite(a.maximum)||a.maximum<=0||!finite(a.marks)||!unit(a.marks/a.maximum)){
      excluded++;continue;
    }
    matched++;
    const y=a.marks/a.maximum,prob=Math.max(1e-9,Math.min(1-1e-9,p.p)),binary=a.binary===true&&(y===0||y===1);
    for(const key of ['all','facet/'+p.facet,'form/'+p.form,'hint/'+(a.hinted?'assisted':'independent'),'evidence/'+p.evidence]){
      const g=groups.get(key)??{brier:[],logLoss:[],absoluteMarkError:[],intervalCoverage:[]};
      if(binary){g.brier.push((prob-y)**2);g.logLoss.push(-Math.log(y?prob:1-prob));}
      g.absoluteMarkError.push(Math.abs(a.marks-a.maximum*p.p));g.intervalCoverage.push(Number(p.low<=y&&y<=p.high));groups.set(key,g);
    }
  }
  return {matched,excluded,groups:Object.fromEntries([...groups].map(([k,g])=>[k,{n:g.absoluteMarkError.length,binary:g.brier.length,
    ...Object.fromEntries(Object.entries(g).map(([metric,values])=>[metric,mean(values)]))}]))};
}
export function evaluateTrial(trial={}) {
  const rows=trial.families??[], blocks=trial.blocks??[], gate=trial.gate??{}, issues=[],metrics={};
  const empty={recommendation:'keep-off',issues,metrics};
  if(trial.source!=='observed'||!blocks.length){issues.push('No observed, preregistered matched families.');return empty;}
  const assigned=design(blocks),byFamily=new Map(rows.map(r=>[r.family,r]));
  if(rows.length!==assigned.length||byFamily.size!==assigned.length)issues.push('Include every assigned family, including deferred families.');
  const groups=blocks.map((_,i)=>assigned.filter(a=>a.block===i).map(a=>({...byFamily.get(a.family),assignment:a})));
  const transfer=[],delayed=[],proof=[],recall=[],teachingOnly=[],probeIncrement=[];
  const values={reentryMinutes:[],wronglySkipped:[],repeatDiagnostics:[],prepAuthorMinutes:[],duplicateProposals:[],ideasStillUseful:[],reviewMinutes:[]};
  const arms=Object.fromEntries(policies.map(p=>[p,Object.fromEntries(Object.keys(values).map(k=>[k,[]]))]));
  if(blocks.length<3||blocks.length%3!==0)issues.push('A complete three-block counterbalance is required.');
  const registered=Date.parse(trial.registeredAt);
  const reviewed=fields=>fields.every(n=>finite(n)&&n>=0);
  for(const group of groups) {
    const valid=group.every(r=>r.assignment.policy===r.policy&&r.unseenTransfer===true&&r.independent===true&&
      r.minutes===group[0].minutes&&r.delayDays===group[0].delayDays&&r.minutes>0&&r.delayDays>=14&&r.delayDays<=28&&
      unit(r.pretest)&&unit(r.transfer)&&unit(r.delayedProof)&&unit(r.delayedRecall)&&finite(registered)&&registered<Date.parse(r.startedAt)&&
      reviewed(Object.keys(values).map(k=>r[k]))&&typeof r.deferred==='boolean');
    if(!valid){issues.push('Incomplete, time-mismatched or retrospectively assigned block '+group[0].assignment.block);continue;}
    const [base,weighted,adaptive]=policies.map(p=>group.find(r=>r.policy===p));
    const gain=r=>100*(r.transfer-r.pretest);
    transfer.push(gain(adaptive)-gain(base));teachingOnly.push(gain(weighted)-gain(base));probeIncrement.push(gain(adaptive)-gain(weighted));
    proof.push(100*(adaptive.delayedProof-base.delayedProof));recall.push(100*(adaptive.delayedRecall-base.delayedRecall));
    delayed.push((proof.at(-1)+recall.at(-1))/2);
    for(const r of group)for(const k of Object.keys(values))arms[r.policy][k].push(r[k]);
    for(const k of Object.keys(values))values[k].push(adaptive[k]-base[k]);
  }
  Object.assign(metrics,{adaptiveVsAtlas:interval(transfer),weightedVsAtlas:interval(teachingOnly),adaptiveVsWeighted:interval(probeIncrement),
    delayed:interval(delayed),delayedProof:interval(proof),delayedRecall:interval(recall),deferredFamilies:rows.filter(r=>r.deferred).length,
    byPolicy:Object.fromEntries(policies.map(p=>[p,Object.fromEntries(Object.entries(arms[p]).map(([k,v])=>[k,mean(v)]))])),
    adaptiveMinusAtlas:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,interval(v)]))});
  const pairedReturns=trial.returnComparisons??[];
  const validReturns=pairedReturns.filter(p=>typeof p.snapshotHash==='string'&&p.snapshotHash===p.preExamSnapshotHash&&
    p.delayDays>=14&&p.delayDays<=28&&[p.full,p.preExam].every(r=>r&&unit(r.proof)&&unit(r.recall)&&reviewed([r.minutes,r.wronglySkipped,r.repeatDiagnostics])));
  metrics.returnReplay=Object.fromEntries(['minutes','wronglySkipped','repeatDiagnostics','proof','recall'].map(k=>[k,interval(validReturns.map(p=>p.full[k]-p.preExam[k]))]));
  if(!validReturns.length||validReturns.length!==pairedReturns.length)issues.push('Missing paired, identical-snapshot re-entry observations.');
  if(!reviewed([gate.minimumMarksPer100,gate.allowedDelayedLoss,gate.maxReentryMinutes,gate.maxReviewMinutes])||
    !metrics.adaptiveVsAtlas.interval95||metrics.adaptiveVsAtlas.mean<gate.minimumMarksPer100||metrics.adaptiveVsAtlas.interval95[0]<=0||
    !metrics.delayed.interval95||metrics.delayed.interval95[0]<=-gate.allowedDelayedLoss||
    metrics.byPolicy.adaptive.reentryMinutes>gate.maxReentryMinutes||metrics.byPolicy.adaptive.reviewMinutes>gate.maxReviewMinutes)
    issues.push('Observed outcome intervals or burden limits do not meet the preregistered gate.');
  return {...empty,recommendation:issues.length?'keep-off':'eligible-for-independent-review'};
}
export async function report(data={}) {
  const decisions=data.exam_decisions??[], comparison=await replay(decisions);
  const predictions=audit(decisions,data.assessments??assessmentsFromExport(decisions,data.exam_attempts??[])),trial=evaluateTrial(data.trial);
  if(comparison.invalid.length||!predictions.matched||predictions.excluded){trial.recommendation='keep-off';trial.issues.push('A complete prospective prediction audit is required.');}
  return {trial,predictions,comparison};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const data=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):{};
  console.log(JSON.stringify(await report(data),null,2));
}
