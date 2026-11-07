import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveDeadlineApi} from '../../../src/data/deadlines/live';
import {getDeadlineApi,setDeadlineApiForTests} from '../../../src/data/deadlines';
import {liveClient} from '../../../src/data/live/client';
import type {DeadlineRecord} from '../../../src/data/deadlines/contract';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));

type Row=Record<string,unknown>;
type Response={data:unknown;error:{code?:string;message?:string}|null};
type Read={table:string;fields:Array<[string,string,unknown]>;columns:string};
const at='2026-11-07T10:00:00.000Z';
const id=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
function deadline(n:number,extra:Row={}):Row{
 return {id:id(n),user_id:'RLS-owner',title:'Exam '+n,kind:'exam',
  due_kind:'date',due_date:'2026-12-01',due_at:null,
  subject_id:null,project_id:null,checkpoint_id:null,
  remaining_minutes:60,estimate_source:'owner',status:'open',
  version:1,created_at:at,updated_at:at,source:'app',...extra};
}
function projection(kind:'project'|'checkpoint',n:number):Row{
 return {origin:kind,source_id:id(n),title:'Projected '+kind,kind:'milestone',
  due_kind:'date',due_date:'2026-12-03',due_at:null,
  status:'open',projected:true,subject_id:null,
  project_id:id(400),checkpoint_id:kind==='checkpoint'?id(n):null,
  remaining_minutes:null,estimate_source:null,version:1};
}
function asFeed(row:Row):Row{
 return {...row,origin:'deadline',source_id:row.id,projected:false};
}
class Query implements PromiseLike<Response>{
 private filters:Array<[string,string,unknown]>=[];
 private columns='*';
 private one=false;
 constructor(private table:string,private state:{
  deadlines:Row[];projects:Row[];checkpoints:Row[];reads:Read[];
 }){}
 select(columns:string){this.columns=columns;return this}
 eq(k:string,v:unknown){this.filters.push(['eq',k,v]);return this}
 in(k:string,v:unknown[]){this.filters.push(['in',k,v]);return this}
 maybeSingle(){this.one=true;return this}
 then<TResult1=Response,TResult2=never>(
  onfulfilled?:((value:Response)=>TResult1|PromiseLike<TResult1>)|null,
  onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null
 ):Promise<TResult1|TResult2>{
  const fields=this.filters.slice();
  this.state.reads.push({table:this.table,fields,columns:this.columns});
  const rows=this.table==='deadlines'?this.state.deadlines:
   this.table==='projects'?this.state.projects:this.state.checkpoints;
  const found=rows.filter(r=>fields.every(([op,key,v])=>op==='eq'
   ?r[key]===v:op==='in'?(v as unknown[]).includes(r[key]):true));
  return Promise.resolve({data:this.one?(found[0]??null):found,
   error:null} as Response).then(onfulfilled,onrejected);
 }
}
function harness(){
 const state={
  deadlines:[deadline(1),deadline(2)] as Row[],
  projects:[{id:id(400),created_at:at,updated_at:at}] as Row[],
  checkpoints:[{id:id(500),created_at:at,updated_at:at}] as Row[],
  reads:[] as Read[],envelopes:[] as Row[],
  serverReceipts:new Map<string,Response>(),
  uncertain:0,missing:false,conflict:false,sequence:800,
  client:{from:vi.fn(),rpc:vi.fn(),insert:vi.fn(),update:vi.fn(),delete:vi.fn()},
 };
 const feed=()=>[
  ...state.deadlines.map(asFeed),
  projection('project',400),projection('checkpoint',500),
 ];
 state.client.from.mockImplementation((table:string)=>new Query(table,state));
 state.client.rpc.mockImplementation(async(name:string,args:Row):Promise<Response>=>{
  if(name==='deadline_feed'){
   if(state.missing)return {data:null,error:{code:'PGRST202',message:'Function not found'}};
   return {data:feed().slice(Number(args.p_offset),Number(args.p_offset)+Number(args.p_limit)),error:null};
  }
  expect(name).toBe('deadlines_command');
  const command=args.p as Row;
  state.envelopes.push(structuredClone(command));
  if(state.missing)return {data:null,error:{code:'PGRST202',message:'Function not found'}};
  if(state.conflict)return {data:{status:'conflict',
   conflict:{currentVersion:14}},error:null};
  const opId=String(command.operationId);
  let reply=state.serverReceipts.get(opId);
  if(!reply){
   const operation=command.operation;
   const patch=(command.patch||{}) as Row;
   const target=command.target as {id:string}|undefined;
   let row:Row;
   if(operation==='create'){
    row=deadline(++state.sequence,{...patch,status:'open',version:1});
    state.deadlines.push(row);
   }else{
    const old=state.deadlines.find(r=>r.id===target?.id);
    if(!old)return {data:null,error:{code:'P0001',message:'Deadline not found for owner'}};
    row={...old,...patch,version:Number(old.version)+1,updated_at:at};
    if(operation==='complete')row.status='done';
    if(operation==='reopen'||operation==='restore')row.status='open';
    if(operation==='cancel')row.status='cancelled';
    const index=state.deadlines.indexOf(old);
    if(operation==='delete')state.deadlines.splice(index,1);
    else state.deadlines[index]=row;
   }
   reply={data:{status:'ok',changed:[{id:row.id,version:row.version}],
    actionNo:state.serverReceipts.size+1},error:null};
   state.serverReceipts.set(opId,reply);
  }
  if(state.uncertain>0){
   state.uncertain--;
   throw new TypeError('Failed to fetch after commit');
  }
  return reply;
 });
 return state;
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{
 fake=harness();
 vi.mocked(liveClient).mockReturnValue(fake.client as never);
 sessionStorage.clear();
});
afterEach(()=>{
 setDeadlineApiForTests(null);sessionStorage.clear();
 window.history.replaceState({},'','/lemma/');
 vi.clearAllMocks();
});

describe('N56.2 owner-scoped deadline live adapter',()=>{
 it('reads civil deadlines, instants and dynamic read-only projections through RLS',async()=>{
  fake.deadlines[1]=deadline(2,{due_kind:'instant',due_date:null,
   due_at:'2026-12-02T18:15:00+05:30'});
  const api=createLiveDeadlineApi();
  const list=await api.listDeadlines();
  expect(list.total).toBe(4);
  expect(list.items).toHaveLength(4);
  expect(list.items.find(x=>x.id===id(1))?.due)
   .toEqual({kind:'date',date:'2026-12-01'});
  expect(list.items.find(x=>x.id===id(2))?.due)
   .toEqual({kind:'instant',at:'2026-12-02T12:45:00.000Z'});
  expect(list.items.map(x=>x.origin)).toContain('project_target');
  expect(list.items.map(x=>x.origin)).toContain('checkpoint_due');
  expect((await api.getDeadline('project-target:'+id(400)))?.title)
   .toBe('Projected project');
  expect((await api.getDeadline('checkpoint-due:'+id(500)))?.origin)
   .toBe('checkpoint_due');
  expect((await api.listDeadlines({includeProjections:false})).total).toBe(2);
  expect((await api.listDeadlines({statuses:['done']})).items).toEqual([]);
  expect((await api.getDeadline(id(1)))?.origin).toBe('owner');
  expect(await api.getDeadline(id(999))).toBeNull();
  expect(fake.reads.every(r=>r.fields.every(f=>f[1]!=='user_id'))).toBe(true);
  expect(fake.reads.filter(x=>x.columns.includes('created_at'))
   .every(x=>x.fields.filter(f=>f[0]==='in')
    .every(f=>(f[2] as string[]).length<=50))).toBe(true);
 });
 it('paginates >50 rows, exact totals and filter-bound stable keyset cursors',async()=>{
  fake.deadlines=Array.from({length:57},(_,i)=>deadline(i+1,
   {due_date:'2026-12-'+String(1+Math.floor(i/5)).padStart(2,'0')}));
  const api=createLiveDeadlineApi(),seen:string[]=[];
  let cursor:string|null=null;
  for(let i=0;i<15;i++){
   const result=await api.listDeadlines({limit:8,cursor});
   expect(result.total).toBe(59);
   seen.push(...result.items.map(x=>x.id));
   cursor=result.nextCursor;
   if(!cursor)break;
  }
  expect(seen).toHaveLength(59);
  expect(new Set(seen).size).toBe(59);
  const calls=fake.client.rpc.mock.calls.filter(x=>x[0]==='deadline_feed');
  expect(calls.some(x=>(x[1] as Row).p_offset===50)).toBe(true);
  expect(calls.every(x=>(x[1] as Row).p_limit===50)).toBe(true);
  const first=await api.listDeadlines({limit:1});
  await expect(api.listDeadlines({cursor:first.nextCursor,includeProjections:false}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({cursor:'bad!'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({limit:51}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({userId:'forged'} as never))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('commands every lifecycle transition through RPC, expectedVersion and action receipts',async()=>{
  const api=createLiveDeadlineApi();
  const created=await api.createDeadline({title:' Final exam ',kind:'exam',
   due:{kind:'date',date:'2026-12-20'},remainingMinutes:30});
  expect(created.record).toMatchObject({version:1,origin:'owner',
   title:'Final exam',estimateSource:'owner'});
  expect(created.actionNo).toBe(1);
  const key=created.record.id;
  const changed=await api.updateDeadline(key,1,{
   due:{kind:'instant',at:'2026-12-20T10:30:00+05:30'}});
  expect(changed.record.due).toEqual({kind:'instant',at:'2026-12-20T05:00:00.000Z'});
  const done=await api.completeDeadline(key,2);
  expect(done.record.status).toBe('done');
  const reopened=await api.reopenDeadline(key,3);
  expect(reopened.record.status).toBe('open');
  const cancelled=await api.cancelDeadline(key,4);
  expect(cancelled.record.status).toBe('cancelled');
  const restored=await api.restoreDeadline(key,5);
  expect(restored.record.status).toBe('open');
  const deleted=await api.deleteDeadline(key,6);
  expect(deleted).toEqual({record:{id:key},actionNo:7});
  expect(await api.getDeadline(key)).toBeNull();
  expect(fake.envelopes.map(x=>x.operation))
   .toEqual(['create','update','complete','reopen','cancel','restore','delete']);
  expect(fake.envelopes.map(x=>x.expectedVersion))
   .toEqual([undefined,1,2,3,4,5,6]);
  expect(fake.envelopes.map(x=>x.schemaVersion)).toEqual(Array(7).fill(1));
  expect(new Set(fake.envelopes.map(x=>x.operationId)).size).toBe(7);
  expect(fake.envelopes.every(x=>x.resource==='deadlines'&&
   !('user_id' in x)&&!('source' in x))).toBe(true);
  const update=fake.envelopes[1].patch as Row;
  expect(update).toMatchObject({due_kind:'instant',due_date:null,
   due_at:'2026-12-20T05:00:00.000Z'});
  expect(fake.client.insert).not.toHaveBeenCalled();
  expect(fake.client.update).not.toHaveBeenCalled();
  expect(fake.client.delete).not.toHaveBeenCalled();
 });
 it('replays byte-identical envelopes after uncertain post-commit responses',async()=>{
  const api=createLiveDeadlineApi();
  const input={title:'Uncertain result',kind:'exam' as const,
   due:{kind:'date' as const,date:'2026-12-15'}};
  fake.uncertain=2;
  await expect(api.createDeadline(input)).rejects.toMatchObject({code:'server'});
  const before=fake.envelopes.slice();
  const completed=await api.createDeadline(input);
  expect(completed.record.title).toBe('Uncertain result');
  expect(fake.deadlines.filter(x=>x.title==='Uncertain result')).toHaveLength(1);
  expect(fake.envelopes.slice(0,3)).toEqual([before[0],before[0],before[0]]);
  const after=await api.createDeadline({...input,title:'Different action'});
  expect(after.record.id).not.toBe(completed.record.id);
  expect(fake.envelopes.at(-1)?.operationId).not.toBe(before[0].operationId);
 });
 it('maps server conflicts and refuses direct/projection mutations and absent RPC',async()=>{
  const api=createLiveDeadlineApi();
  for(const key of ['project-target:'+id(400),'checkpoint-due:'+id(500)]){
   await expect(api.completeDeadline(key,1)).rejects.toMatchObject({code:'invalid'});
   await expect(api.deleteDeadline(key,1)).rejects.toMatchObject({code:'invalid'});
  }
  await expect(api.createDeadline({title:'Bad',kind:'exam',
   due:{kind:'date',date:'2026-02-30'}})).rejects.toMatchObject({code:'invalid'});
  await expect(api.createDeadline({...{title:'Okay',kind:'exam',
   due:{kind:'date',date:'2026-11-30'}},user_id:'forged'} as never))
   .rejects.toMatchObject({code:'invalid'});
  expect(fake.envelopes).toHaveLength(0);
  fake.conflict=true;
  await expect(api.updateDeadline(id(1),1,{title:'Stale'}))
   .rejects.toMatchObject({code:'conflict',message:expect.stringContaining('14')});
  fake.conflict=false;
  fake.missing=true;
  await expect(api.completeDeadline(id(1),1)).rejects.toMatchObject({code:'server'});
  await expect(api.listDeadlines()).rejects.toMatchObject({code:'server'});
  expect(fake.client.insert).not.toHaveBeenCalled();
 });
 it('exposes a stable, mode-aware facade with test-only injection',()=>{
  setDeadlineApiForTests(null);
  window.history.replaceState({},'','/lemma/?demo=1');
  const demo=getDeadlineApi();
  expect(demo.mode).toBe('demo');
  expect(getDeadlineApi()).toBe(demo);
  window.history.replaceState({},'','/lemma/?demo=0');
  const live=getDeadlineApi();
  expect(live.mode).toBe('live');
  expect(getDeadlineApi()).toBe(live);
  const injected=createLiveDeadlineApi();
  setDeadlineApiForTests(injected);
  expect(getDeadlineApi()).toBe(injected);
 });
});
