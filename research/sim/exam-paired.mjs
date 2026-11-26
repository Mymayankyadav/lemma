// Each policy sees the same hidden learner, grading draw, paper draw and 12-minute budget.
import {selectExam} from '../../supabase/functions/_shared/exam/selector.ts';
import {replay,predict} from '../../supabase/functions/_shared/adaptive/measure.ts';
import {rankActions} from '../../supabase/functions/_shared/adaptive/kg.ts';
import {pathToFileURL} from 'node:url';
export function simulate(seed=78191,n=2000,mismatch=false) {
  let state=seed>>>0;
  const draw=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
  const now=Date.UTC(2026,10,25),names=['diag','projection'];
  const native=replay({concepts:names.map(id=>({id,name:id,kind:'topic',parent_id:null})),attempts:[
    {id:'previous',novelty:'novel',occurred_at:'2026-11-24',tags:[{concept_id:'projection',facet:'use',role:'target',stage:'E',result:'fail',hint_level:0}]}]}, {},now);
  const nativeRow=rankActions(native,names.map(id=>({id,kind:'teach',concept_id:id,minutes:8,p:predict(native,id,'use',now)})),12)[0].id;
  const sums={atlas:0,weighted:0,adaptive:0},wins={adaptive:0,weighted:0,ties:0};
  for(let i=0;i<n;i++){
    const prior=.05+.9*draw(),gap=draw()<prior,noise=draw(),paper=.8+.4*draw(),transfer=.75+.25*draw(),forgetting=.8+.2*draw();
    const correct=noise<(gap?(mismatch?.38:.2):(mismatch?.72:.9));
    const diag=gap*6*paper*transfer*forgetting,projection=2.5*(2-paper)*forgetting;
    const model={minutes:12,lessons:[['diag',prior,6,0],['projection',1,2.5,2.5]].map(([key,q,x,y])=>({
      kind:'teach',keys:[key],minutes:8,components:[{key,gap:q,gainIfGap:[x,x,x],gainIfSecure:[y,y,y]}]})),
      probes:[{key:'diag',minutes:1,gap:prior,givenGap:[.2,0,.8,0],givenSecure:[.9,0,.1,0]}],fallback:{minutes:4,rate:[.4,.4,.4]}};
    const choice=selectExam(model).chosen;
    const tested=choice.action==='probe',key=tested?choice.branches.find(b=>b.outcome===(correct?'correct':'incorrect')).next[0]:choice.keys[0];
    const scores={atlas:(nativeRow==='diag'?diag:projection)+1.6,weighted:(prior*6>=2.5?diag:projection)+1.6,adaptive:(key==='diag'?diag:projection)+(tested?1.2:1.6)};
    for(const p of Object.keys(sums))sums[p]+=scores[p];
    wins[scores.adaptive>scores.weighted?'adaptive':scores.adaptive<scores.weighted?'weighted':'ties']++;
  }
  return {source:'synthetic',nativeRow,seed,n,mismatch,minutes:12,meanMarks:Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,v/n])),pairedWins:wins};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify([simulate(),simulate(77417,2000,true)],null,2));
