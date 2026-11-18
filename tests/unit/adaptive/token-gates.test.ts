import {describe,expect,it} from 'vitest';
import {approxTokens,tokenGates} from '../../../supabase/functions/_shared/adaptive/tokens';
import {assembleAtlas,atlasCard} from '../../../supabase/functions/_shared/adaptive/atlas';

describe('07 Acceptance 2 token gates',()=>{
 it('estimates at 3 characters per token and reports the maximum over all projects and cards',()=>{
  expect(approxTokens('')).toBe(0);expect(approxTokens('abc')).toBe(1);expect(approxTokens('abcd')).toBe(2);
  expect(tokenGates({resumes:['x'.repeat(300),'x'.repeat(4500)],cards:['x'.repeat(60),'x'.repeat(300)]})).toEqual({resume_tokens_max:1500,card_tokens_max:100});
  expect(tokenGates({resumes:[],cards:[]})).toEqual({resume_tokens_max:0,card_tokens_max:0});
 });
 it('every Atlas card of a seeded read model stays within 100 tokens, so the card gate can pass',()=>{
  const NOW=new Date('2026-11-18T10:00:00Z'),T=NOW.getTime()-20*86400000;
  const rows:any={settings:{},projects:[],checkpoints:[],cpConcepts:[],sessions:[],concepts:[{id:'s',name:'Sets',kind:'topic',level:'system'},{id:'k',name:'A fairly long concept name about compactness in metric spaces',kind:'result',parent_id:'s'}],
   attempts:Array.from({length:30},(_,i)=>({id:i,occurred_at:new Date(T+i*3600e3*6).toISOString(),session_id:'s'+(i%5),item_kind:'practice',tags:[{concept_id:'k',facet:'execute',role:'target',stage:'E',result:i%3?'ok':'fail',hint_level:0}]})),
   instructionEvents:[{id:1,concept_id:'k',occurred_at:new Date(T).toISOString()}]};
  const view=assembleAtlas(rows,NOW);
  expect(tokenGates({resumes:[],cards:view.model.facts.concepts.map(c=>atlasCard(view,c.id))}).card_tokens_max).toBeLessThanOrEqual(100);
 });
});
