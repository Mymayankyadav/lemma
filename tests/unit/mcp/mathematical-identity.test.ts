import {describe,expect,it,vi} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {normalizedFront} from '../../../supabase/functions/mcp/text';
import {fingerprint} from '../../../supabase/functions/_shared/adaptive/items';
import {proposeCards,saveProgress} from '../../../supabase/functions/mcp/tools/write';
import {fakeContext} from '../adaptive/fakedb';

const context=()=>({...fakeContext({
 projects:[{id:'p',slug:'algebra',title:'Algebra',status:'active',system:false}],
 sessions:[{id:'s',project_id:'p',number:1,state:'open'}],checkpoints:[],sources:[],
 notes:[{id:'n',project_id:'p',front:'Define A',status:'active'}],
 settings:[{connector_last_client:'claude'}],
}),batch:[] as any[]});

describe('mathematical identities (#1771, #1812)',()=>{
 it.each([
  ['Define A','Define a'],['Is zero in [0,1]?','Is zero in (0,1)?'],
  ['What is 0.1?','What is 01?'],['Compute n!','Compute n'],
  ['Is {0,1} finite?','Is (0,1) finite?'],['Evaluate \\sin x','Evaluate sin x'],
 ])('retains the distinction between %s and %s',(left,right)=>{
  expect(normalizedFront(left)).not.toBe(normalizedFront(right));
  expect(fingerprint(left)).not.toBe(fingerprint(right));
 });
 it('still recognizes the same prompt after safe whitespace or canonical Unicode normalization',()=>{
  expect(normalizedFront('  Define\n A  ')).toBe(normalizedFront('Define A'));
  expect(fingerprint('Define\n A')).toBe(fingerprint('Define A'));
  expect(normalizedFront('Définir A')).toBe(normalizedFront('Définir A'));
  expect(fingerprint('Définir A')).toBe(fingerprint('Définir A'));
 });
 it('proposes a scalar card beside its existing matrix card, while skipping an exact repeated prompt',async()=>{
  const c=context();
  const result=await proposeCards(c,{project:'algebra',cards:[{front:'Define a',back:'The scalar coefficient'},{front:' Define  A ',back:'The matrix'}]});
  expect(result).toContain('1 cards wait for approval');expect(result).toContain('skipped 1 duplicate');
  expect(c.batch.filter(command=>command.table==='proposals').map(command=>command.values.payload.front)).toEqual(['Define a']);
 });
 it('passes distinct interval identities through the production progress writer',async()=>{
  const c=context();
  await saveProgress(c,{project:'algebra',session:'S1',events:[
   {kind:'attempt',text:'Yes',item:'Is zero in [0,1]?'},{kind:'attempt',text:'No',item:'Is zero in (0,1)?'},
  ]});
  const events=c.batch.find(command=>command.fn==='save_progress').args.p_payload.events;
  expect(events.map((event:any)=>event.item)).toEqual(['Is zero in [0,1]?','Is zero in (0,1)?']);
  expect(events[0].fp).not.toBe(events[1].fp);
 });
});
