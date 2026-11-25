import {expect,it} from 'vitest';
import {selectExam,selectorModel,inputsHash,type Model} from '../../../supabase/functions/_shared/exam/selector';
import {planExam} from '../../../supabase/functions/_shared/exam/plan';
import {now,sitting} from '../mcp/exam-fixture';
export const worked=(gap=.45,minutes=12,probeMinutes=1):Model=>({minutes,lessons:[
  {kind:'teach',keys:['diagonalization'],minutes:8,components:[{key:'diagonalization',gap,gainIfGap:[6,6,6],gainIfSecure:[0,0,0]}]},
  {kind:'teach',keys:['projections'],minutes:8,components:[{key:'projections',gap:1,gainIfGap:[2.5,2.5,2.5],gainIfSecure:[2.5,2.5,2.5]}]}],
  probes:[{key:'diagonalization',minutes:probeMinutes,gap,givenGap:[.2,0,.8,0],givenSecure:[.9,0,.1,0]}],
  fallback:{minutes:4,rate:[.4,.4,.4]}});
it('prices all four branches and the fallback on an equal twelve-minute clock',()=>{
  const {chosen,runner_up}=selectExam(worked());
  expect(runner_up?.gain_mid).toBe(4.3);expect(chosen.gain_mid).toBe(4.8225);
  expect(chosen.gain_mid-runner_up!.gain_mid).toBeCloseTo(.5225,8);
  expect(chosen.action).toBe('probe');expect(chosen.voi).toBe(.9225);expect(chosen.netVoi).toBe(.5225);
  expect(chosen.breakEvenMinutes?.toFixed(2)).toBe('2.31');
  expect(chosen.branches?.map(b=>b.outcome)).toEqual(['correct','partial','incorrect','unscorable']);
  expect(chosen.branches?.every(b=>b.followupMinutes===11)).toBe(true);
  expect(selectExam(worked(.45,12,2.32)).chosen.action).toBe('teach');
  expect(selectExam(worked(.9)).chosen.keys).toEqual(['diagonalization']);
  expect(selectExam(worked(.05)).chosen.keys).toEqual(['projections']);
  expect(selectExam(worked(.45,4)).chosen).toMatchObject({action:'corrections',gain_mid:1.6,minutes:4});
});
it('freezes reproducible models, bans deferred prerequisite chains and prices repair bundles',async()=>{
  const p=sitting({study_minutes:30,activation_study_minutes:30,blueprint:[{key:'a',title:'Basics',marks:12},
    {key:'b',title:'Application',marks:45,prereqs:['a']}],ledger:{}});
  const asOf=()=>planExam({sitting:p,attempts:[],evidence:[],now});
  const model=selectorModel(asOf());
  expect(model.lessons.find(l=>l.keys.join()==='a,b'&&l.kind==='teach')).toMatchObject({minutes:16});
  const result=selectExam(model);
  expect(result.candidates.every(c=>c.gain_low<=c.gain_mid&&c.gain_mid<=c.gain_high)).toBe(true);
  expect(selectExam(JSON.parse(JSON.stringify(model)))).toEqual(result);
  expect(await inputsHash({model,result})).toBe(await inputsHash({result,model}));
  p.ledger={a:{disposition:'defer',reason:'Time'}};expect(selectorModel(asOf()).lessons).toEqual([]);
});
