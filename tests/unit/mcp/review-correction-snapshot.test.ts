import {describe,expect,it,vi} from 'vitest';
import {readRegisteredResource} from '../../../supabase/functions/mcp/tools/registry';
import type {Context} from '../../../supabase/functions/mcp/db';

const owner='11111111-1111-4111-8111-111111111111';
const schedule={state:2,due:'2026-12-01T00:00:00Z',stability:5,difficulty:4,
 last_review:'2026-11-25T08:00:00Z',step:0,reps:3,lapses:0};
const snapshot={review:{id:'42',cardId:'22222222-2222-4222-8222-222222222222',rating:3},
 card:{id:'22222222-2222-4222-8222-222222222222',version:7,schedule},expectedVersion:7,
 readAt:'2026-11-25T09:00:00Z'};
function context(){
 const rpc=vi.fn(async()=>({data:snapshot,error:null}));
 const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle:vi.fn(async()=>({
  data:{resource:'review_corrections',mcp_ok:true,schema:{operations:['correct','void'],fields:['reason','replacementState']}},error:null,
 })),order:vi.fn(()=>query),range:vi.fn(async()=>({data:null,count:null,
  error:{message:'relation public.review_corrections does not exist'}}))};
 const from=vi.fn(()=>query);
 return {c:{userId:owner,db:{from,rpc}} as unknown as Context,rpc,from};
}
describe('N239 exact review correction snapshot',()=>{
 it('reads the owner-bound review and exact current card version/schedule through one RPC',async()=>{
  const {c,rpc,from}=context();
  const result=JSON.parse(await readRegisteredResource(c,{what:'review_corrections',id:'42'},'get'));
  expect(rpc).toHaveBeenCalledExactlyOnceWith('n239_mcp_review_correction_snapshot',{p_user:owner,p_review:'42'});
  expect(from).toHaveBeenCalledExactlyOnceWith('lemma_command_resources');
  expect(result).toMatchObject({resource:'review_corrections',items:[snapshot],total:1,nextCursor:null});
  expect(result.guidance).toContain('card.version');
  expect(result.guidance).toContain('expectedVersion');
  expect(result.items[0].card.schedule).toEqual(schedule);
  expect(JSON.stringify(result)).not.toContain(owner);
 });
 it('preserves a denied foreign-review result without falling back to table reads',async()=>{
  const {c,rpc,from}=context();
  rpc.mockResolvedValueOnce({data:null,error:{message:'Review not found for owner'}} as never);
  await expect(readRegisteredResource(c,{what:'review_corrections',id:'42'},'get')).rejects.toThrow('Review not found for owner');
  expect(from).toHaveBeenCalledExactlyOnceWith('lemma_command_resources');
 });
 it('rejects forged owner arguments and invalid IDs before invoking the reader',async()=>{
  const {c,rpc}=context();
  await expect(readRegisteredResource(c,{what:'review_corrections',id:'42',user_id:'foreign'} as never,'get')).rejects.toThrow(/authenticated owner/);
  for(const id of [undefined,'0','-1','4.2','1 OR 1=1','9223372036854775808'])
   await expect(readRegisteredResource(c,{what:'review_corrections',id},'get')).rejects.toThrow(/review ID/i);
  expect(rpc).not.toHaveBeenCalled();
 });
 it('requires an exact get and rejects filters that would suggest a different snapshot',async()=>{
  const {c,rpc}=context();
  await expect(readRegisteredResource(c,{resource:'review_corrections',query:'review'},'search')).rejects.toThrow(/exact review/i);
  for(const extra of [{cursor:'old'},{status:'active'},{limit:20},{project:'other'},{start:'2026-11-25'}])
   await expect(readRegisteredResource(c,{what:'review_corrections',id:'42',...extra},'get')).rejects.toThrow(/filter/i);
  expect(rpc).not.toHaveBeenCalled();
 });
 it('rejects a malformed or mismatched snapshot without supplying a guessed version',async()=>{
  const {c,rpc}=context();
  rpc.mockResolvedValueOnce({data:{...snapshot,expectedVersion:6},error:null});
  await expect(readRegisteredResource(c,{what:'review_corrections',id:'42'},'get')).rejects.toThrow(/snapshot/i);
  rpc.mockResolvedValueOnce({data:{...snapshot,review:{...snapshot.review,id:'43'}},error:null});
  await expect(readRegisteredResource(c,{what:'review_corrections',id:'42'},'get')).rejects.toThrow(/snapshot/i);
 });
});
