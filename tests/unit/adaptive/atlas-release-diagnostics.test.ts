import {describe,expect,it} from 'vitest';
import {modelFit,diagnostics} from '../../../scripts/atlas/release-core';

// N183: the release report carries D1-D5 and the serving change with each status (07 Acceptance 3, I13), which activation now requires for `action`.
const T=Date.UTC(2026,10,1,10);
const rows=(miscalibrated:boolean):any=>({settings:{capacity:{weekday_minutes:120}},projects:[{id:'p',last_study_on:'2026-12-01'}],checkpoints:[{id:'c',project_id:'p',position:1,status:'not_started',tier:'core'}],cpConcepts:[{checkpoint_id:'c',concept_id:'k'}],
 concepts:[{id:'s',name:'Sets',kind:'topic',level:'system'},{id:'k',name:'Compactness',kind:'result',parent_id:'s'}],sessions:[],
 // miscalibrated: a long run of passes, then a long run of failures, which the model cannot follow fast enough
 attempts:Array.from({length:120},(_,i)=>({id:i+1,occurred_at:new Date(T+i*3600e3*5).toISOString(),session_id:'s'+(i%9),item_kind:'practice',
  tags:[{concept_id:'k',facet:'use',role:'target',stage:'E',result:miscalibrated?(i<60?'ok':'fail'):(i%4?'ok':'fail'),hint_level:0}]})),
 instructionEvents:[{id:1,concept_id:'k',occurred_at:new Date(T-3600e3).toISOString()}]});
const run=(m:boolean)=>{const r=rows(m);return diagnostics(r,modelFit(r),new Date(T+40*86400e3)).diagnostics;};

describe('N183 release diagnostics carry D1-D5 and the serving change',()=>{
 it('every stream with 50 or more events reports all five tests and its actions; thin streams report only insufficient data',()=>{
  for(const m of [false,true])for(const d of run(m)){
   if(d.n<50){expect(d.status).toBe('insufficient data');continue;}
   expect(Object.keys(d.tests!).sort()).toEqual(['D1','D2','D3','D4','D5']);
   for(const v of Object.values(d.tests!))expect(v===null||typeof v==='boolean').toBe(true);
   expect(Array.isArray(d.actions)).toBe(true);
   // the status agrees with the tests and actions, which is exactly what activation checks
   if(d.status==='action'){expect(Object.values(d.tests!)).toContain(false);expect(d.actions!.length).toBeGreaterThan(0);}
   else{expect(d.status).toBe('ok');expect(Object.values(d.tests!)).not.toContain(false);expect(d.actions).toEqual([]);}
  }
 });
 it('a stream that fails a test names the serving change it triggers',()=>{
  const a=run(true).find(d=>d.stream==='attempt')!;
  expect(a.status).toBe('action');
  const changes:Record<string,RegExp>={D1:/model below baseline; serve/,D2:/^recalibrating$/,D3:/^residual feature: /,D4:/prediction distribution mismatch/};
  for(const [k,re] of Object.entries(changes))if(a.tests![k as 'D1']===false)expect(a.actions!.some(x=>re.test(x))).toBe(true);
 });
});
