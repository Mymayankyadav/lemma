import {describe,expect,it} from 'vitest';
import {replay,estimate} from '../../../supabase/functions/_shared/adaptive/measure';

// N182: estimate() named the inferring parent with a nested scan of every concept for every concept; on a 2,500-concept
// account (the extreme demo) Today took 80 s to render with atlasV3 on. It now reads the model's id index.
describe('estimate scales with the number of concepts',()=>{
 const N=400,concepts=Array.from({length:N},(_,i)=>({id:'k'+i,name:'Concept '+i,kind:'topic',parent_id:i>=N-5?null:'k'+(N-5+(i%5))}));   // parents last, as in the demo
 const attempts=Array.from({length:30},(_,i)=>({id:i+1,occurred_at:new Date(Date.UTC(2026,10,1)+i*3600e3).toISOString(),session_id:'s'+(i%3),item_kind:'practice',tags:[{concept_id:'k'+(i%10),facet:'use' as const,role:'target' as const,stage:'E' as const,result:(i%3?'ok':'fail') as 'ok'|'fail',hint_level:0}]}));
 it('names the parent it infers from, without scanning the concept list',()=>{
  const s=replay({concepts,attempts,tags:[],instructions:[],links:[],items:[],sessions:[],assumptions:[],cards:[],reviews:[]} as any,{},Date.UTC(2026,10,19));
  let reads=0;const counted=new Proxy(s.facts.concepts,{get(t,p,r){if(p==='find'||p==='filter'||p==='some'||(typeof p==='string'&&/^\d+$/.test(p)))reads++;return Reflect.get(t,p,r);}});
  (s.facts as any).concepts=counted;
  for(const c of concepts)for(const f of ['recall','use'] as const){const e=estimate(s,c.id,f);if(c.parent_id)expect(e.inferredFrom).toBe('Concept '+c.parent_id.slice(1));}
  expect(reads).toBe(0);
 });
});
