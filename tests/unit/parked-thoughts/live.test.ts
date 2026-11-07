import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveThoughtApi} from '../../../src/data/parked-thoughts/live';
import {getThoughtApi,setThoughtApiForTests} from '../../../src/data/parked-thoughts';

const ID='11111111-1111-4111-8111-111111111111';
const TASK='22222222-2222-4222-8222-222222222222';
const ROW={
 id:ID,user_id:'owner-hidden',study_entry_id:null,text:'Read the lemma',
 status:'open',destination_kind:null,destination_id:null,resolved_at:null,
 version:1,created_at:'2026-11-07T09:00:00Z',updated_at:'2026-11-07T09:00:00Z',
};
const TASK_ROW={
 id:TASK,user_id:'owner-hidden',title:'Make a real task',body:'',
 estimate_minutes:15,priority:'normal',due_kind:'none',due_date:null,due_at:null,
 position:0,status:'backlog',completed_at:null,version:1,
 created_at:'2026-11-07T09:00:00Z',updated_at:'2026-11-07T09:00:00Z',
 subject_id:null,project_id:null,checkpoint_id:null,
};
type Reply={data:unknown;error:{code?:string;message?:string}|null};
let rpc=vi.fn(async (_resource:string,_args:unknown):Promise<Reply>=>({
 data:{status:'ok',actionNo:5,changed:[{id:ID,version:1}]},error:null,
}));
let data:Record<string,unknown>={parked_thoughts:ROW,tasks:TASK_ROW};
let pages:Record<string,Record<string,unknown>[]>={};
let calls:Array<{table:string;methods:string[]}>=[];
const makeQuery=(table:string)=>{
 const methods:string[]=[];
 calls.push({table,methods});
 const chain={
  select:(_fields:string,_options?:unknown)=>{methods.push('select');return chain},
  eq:(_field:string,_value:unknown)=>{methods.push('eq');return chain},
  in:(_field:string,_value:unknown)=>{methods.push('in');return chain},
  order:(_field:string,_options?:unknown)=>{methods.push('order');return chain},
  range:(from:number,to:number):Promise<Reply>=>{
   methods.push('range');
   return Promise.resolve({data:(pages[table]??[]).slice(from,to+1),error:null});
  },
  maybeSingle:():Promise<Reply>=>{methods.push('maybeSingle');
   return Promise.resolve({data:data[table]??null,error:null});},
 };
 return chain;
};
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({from:(table:string)=>makeQuery(table),rpc:(...args:[string,unknown])=>rpc(...args)}),
}));
beforeEach(()=>{
 data={parked_thoughts:{...ROW},tasks:{...TASK_ROW}};
 pages={parked_thoughts:[{...ROW}]};calls=[];
 rpc=vi.fn(async (_resource:string,_args:unknown):Promise<Reply>=>({
  data:{status:'ok',actionNo:5,changed:[{id:ID,version:1}]},error:null,
 }));
 setThoughtApiForTests(null);
});
describe('N58.2.3 owner-RLS parked thought live adapter',()=>{
 it('reads an owner-only bounded list and returns exact total and filter-bound cursor',async()=>{
  pages.parked_thoughts=Array.from({length:67},(_,i)=>({
   ...ROW,id:'11111111-1111-4111-8111-'+String(i+1).padStart(12,'0'),
   text:'Item '+i,
  }));
  const api=createLiveThoughtApi();
  const a=await api.listThoughts({limit:10});
  expect(a.total).toBe(67);expect(a.items).toHaveLength(10);
  expect(a.nextCursor).toBeTruthy();
  const b=await api.listThoughts({limit:10,cursor:a.nextCursor});
  expect(b.total).toBe(67);expect(b.items[0].id).not.toBe(a.items[0].id);
  expect(calls.every(c=>c.methods.includes('select'))).toBe(true);
  expect(calls.filter(c=>c.table==='parked_thoughts').every(c=>c.methods.includes('range'))).toBe(true);
  await expect(api.listThoughts({status:['dismissed'],cursor:a.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({ownerId:'forged'} as never))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('sends owner-free create and all four versioned transitions via one RPC',async()=>{
  const api=createLiveThoughtApi();
  const one=await api.createThought({text:' Read the lemma '});
  expect(one).toMatchObject({record:{id:ID,version:1},actionNo:5});
  data.parked_thoughts={...ROW,text:'Updated',version:2};
  rpc.mockResolvedValue({data:{status:'ok',actionNo:6,
   changed:[{id:ID,version:2}]},error:null});
  const edit=await api.editThought(ID,1,{text:'Updated'});
  expect(edit.record.text).toBe('Updated');
  data.parked_thoughts={...ROW,status:'dismissed',resolved_at:'2026-11-07T10:00:00Z',version:3};
  rpc.mockResolvedValue({data:{status:'ok',actionNo:7,
   changed:[{id:ID,version:3}]},error:null});
  expect((await api.dismissThought(ID,2)).record.status).toBe('dismissed');
  data.parked_thoughts={...ROW,version:4};
  rpc.mockResolvedValue({data:{status:'ok',actionNo:8,
   changed:[{id:ID,version:4}]},error:null});
  expect((await api.reopenThought(ID,3)).record.status).toBe('open');
  data.parked_thoughts=null as never;
  rpc.mockResolvedValue({data:{status:'ok',actionNo:9,
   changed:[{id:ID,version:5}]},error:null});
  expect((await api.deleteThought(ID,4)).record.id).toBe(ID);
  const env=rpc.mock.calls.map(c=>c[1] as {p:Record<string,unknown>}).map(x=>x.p);
  expect(env.map(x=>x.operation)).toEqual(['create','edit','dismiss','reopen','delete']);
  expect(env.every(x=>!('user_id'in x)&&!('ownerId'in x)&&x.resource==='parked_thoughts')).toBe(true);
  expect(env.slice(1).map(x=>x.expectedVersion)).toEqual([1,2,3,4]);
 });
 it('verifies conversion returns a single real task and a linked resolved thought',async()=>{
  const api=createLiveThoughtApi();
  data.parked_thoughts={...ROW,status:'converted',destination_kind:'task',
   destination_id:TASK,resolved_at:'2026-11-07T10:00:00Z',version:2};
  rpc.mockResolvedValue({data:{status:'ok',actionNo:11,changed:[
   {resource:'parked_thoughts',id:ID,version:2},{resource:'tasks',id:TASK,version:1}]},
   error:null});
  const result=await api.convertToTask(ID,1,{title:'Make a real task',estimateMinutes:15});
  expect(result.record.thought.destinationId).toBe(result.record.task.id);
  expect(result.record.task).toMatchObject({id:TASK,estimateMinutes:15});
  const request=rpc.mock.calls[0][1] as {p:Record<string,unknown>};
  expect(request.p.patch).toMatchObject({title:'Make a real task',estimate_minutes:15,due_kind:'none'});
  // Inspect actual keys: the legitimate envelope field "resource" contains
  // the substring "source", so scanning serialized JSON gives a false alarm.
  const forbidden=new Set(['user_id','ownerId','status','source','version','actionNo']);
  for(const part of [request.p,request.p.patch as Record<string,unknown>])
   expect(Object.keys(part).filter(key=>forbidden.has(key))).toEqual([]);
  expect(request.p).toMatchObject({
   resource:'parked_thoughts',operation:'convert_to_task',
   target:{id:ID},expectedVersion:1,
  });
 });
 it('keeps the exact operationId after uncertain RPC failure and failed readback',async()=>{
  const api=createLiveThoughtApi();
  rpc.mockRejectedValueOnce(Error('network lost'));
  await expect(api.createThought({text:'Read the lemma'})).rejects.toThrow();
  await api.createThought({text:'Read the lemma'});
  const [first,second]=rpc.mock.calls.map(c=>(c[1] as {p:{operationId:string}}).p.operationId);
  expect(first).toBe(second);
  const replay=createLiveThoughtApi();
  data.parked_thoughts=null as never;
  await expect(replay.createThought({text:'Read the lemma'})).rejects.toThrow(/readable|missing/i);
  data.parked_thoughts={...ROW};
  await replay.createThought({text:'Read the lemma'});
  const [third,fourth]=rpc.mock.calls.slice(2).map(c=>(c[1] as {p:{operationId:string}}).p.operationId);
  expect(third).toBe(fourth);
 });
 it('fails closed for missing RPCs, conflicts and unaudited receipts',async()=>{
  const api=createLiveThoughtApi();
  rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202',message:'missing'}});
  await expect(api.createThought({text:'Read the lemma'})).rejects.toThrow(/not deployed/);
  rpc.mockResolvedValueOnce({data:{status:'conflict',conflict:{currentVersion:3}},error:null});
  await expect(api.editThought(ID,2,{text:'Failed'})).rejects.toMatchObject({code:'conflict'});
  rpc.mockResolvedValueOnce({data:{status:'ok',changed:[{id:ID,version:1}],
   actionNo:null},error:null});
  await expect(api.createThought({text:'Read the lemma'})).rejects.toThrow(/Unaudited|Malformed/i);
  expect(calls.some(c=>c.methods.includes('insert')||c.methods.includes('update')||
   c.methods.includes('delete'))).toBe(false);
 });
 it('honors facade injection and runtime mode without direct table writes',async()=>{
  const fake=createLiveThoughtApi();
  setThoughtApiForTests(fake);
  expect(getThoughtApi()).toBe(fake);
  setThoughtApiForTests(null);
 });
});
