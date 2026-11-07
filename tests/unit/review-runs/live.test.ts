import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveReviewRunApi} from '../../../src/data/review-runs/live';
import {getReviewRunApi,setReviewRunApiForTests} from '../../../src/data/review-runs';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
type Row=Record<string,unknown>;
type Response={data:Row|Row[]|null;error:{code?:string;message?:string}|null};
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const at='2026-11-07T08:00:00.000Z';
function run(n:number,rest:Row={}):Row{
 return {id:uuid(n),user_id:uuid(900),filters:{kind:'due'},
  selected_deck_ids:['project:analysis'],card_budget:20,minute_budget:20,
  scheduler_version:'fsrs-5',settings_version:1,status:'running',
  position:0,revealed:false,started_at:at,paused_at:null,ended_at:null,
  version:1,source:'app',created_at:new Date(Date.parse(at)+n*60_000).toISOString(),
  updated_at:at,...rest};
}
function item(n:number,runId=uuid(1),rest:Row={}):Row{
 return {id:uuid(n+1000),run_id:runId,position:n,card_id:uuid(n+2000),
  expected_card_version:1,state:'pending',review_id:null,stale_reason:null,
  version:1,source:'app',created_at:at,updated_at:at,...rest};
}
type Read={table:string;fields:Array<[string,unknown]>};
class Query implements PromiseLike<Response>{
 private fields:Array<[string,unknown]>=[];
 private single=false;
 constructor(private table:string,private state:{
  data:Record<string,Row[]>;reads:Read[]}){}
 select(_fields:string){return this}
 eq(k:string,value:unknown){this.fields.push([k,value]);return this}
 range(from:number,to:number){this.fields.push(['range',[from,to]]);return this}
 maybeSingle(){this.single=true;return this}
 then<TResult1=Response,TResult2=never>(
  ok?:((value:Response)=>TResult1|PromiseLike<TResult1>)|null,
  no?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null
 ):Promise<TResult1|TResult2>{
  this.state.reads.push({table:this.table,fields:this.fields});
  const rows=(this.state.data[this.table]??[]).filter(row=>
   this.fields.every(([k,v])=>k==='range'||row[k]===v));
  const r=this.fields.find(f=>f[0]==='range');
  const selected=r?rows.slice((r[1] as number[])[0],(r[1] as number[])[1]+1):rows;
  return Promise.resolve({data:this.single?(selected[0]??null):selected,error:null}
    as Response).then(ok,no);
 }
}
function harness(){
 const data:Record<string,Row[]>={
  review_runs:[run(1),run(2,{status:'paused',paused_at:at})],
  review_run_items:[item(0)],
 };
 const state={data,reads:[] as Read[]};
 const client={from:vi.fn((table:string)=>new Query(table,state)),
  rpc:vi.fn(),insert:vi.fn(),update:vi.fn(),delete:vi.fn()};
 return {...state,client};
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{sessionStorage.clear();fake=harness();
 vi.mocked(liveClient).mockReturnValue(fake.client as never)});
describe('N62.2 authenticated review-run live adapter',()=>{
 it('scans 50-row RLS batches, gives exact keyset totals and excludes owner data',async()=>{
  const api=createLiveReviewRunApi();
  fake.data.review_runs=Array.from({length:57},(_,i)=>run(i+1));
  const ids:string[]=[];let cursor:string|null=null;
  for(let n=0;n<20;n++){
   const p=await api.listRuns({limit:7,cursor});
   expect(p.total).toBe(57);
   ids.push(...p.items.map(x=>x.id));
   cursor=p.nextCursor;
   if(!cursor)break;
  }
  expect(ids).toHaveLength(57);
  expect(new Set(ids).size).toBe(57);
  expect((await api.listRuns({status:['paused']})).total).toBe(0);
  const reads=fake.reads.filter(x=>x.table==='review_runs'&&
   x.fields.some(f=>f[0]==='range'));
  expect(reads.every(x=>x.fields.filter(f=>f[0]==='range').every(f=>
   ((f[1] as number[])[1]-(f[1] as number[])[0]+1)<=50))).toBe(true);
  expect(fake.reads.every(r=>r.fields.every(f=>f[0]!=='user_id'))).toBe(true);
  expect((await api.getRun(uuid(1)))?.filters).toEqual({kind:'due'});
  expect(await api.getRun(uuid(99))).toBeNull();
  await expect(api.listRuns({userId:uuid(900)} as never))
   .rejects.toMatchObject({code:'invalid'});
  expect(fake.client.rpc).not.toHaveBeenCalled();
 });
 it('keeps >50 item pages bound to their run and preserves bigint review IDs',async()=>{
  const api=createLiveReviewRunApi();
  fake.data.review_run_items=Array.from({length:57},(_,i)=>item(i));
  fake.data.review_run_items[55]=item(55,uuid(1),{
   state:'graded',review_id:'9223372036854775807'});
  const first=await api.listRunItems(uuid(1),{limit:50});
  expect(first.total).toBe(57);
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).not.toBeNull();
  const second=await api.listRunItems(uuid(1),{limit:50,cursor:first.nextCursor});
  expect(second.items).toHaveLength(7);
  expect(second.items.find(x=>x.position===55)?.reviewId)
   .toBe('9223372036854775807');
  await expect(api.listRunItems(uuid(2),{cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  fake.data.review_run_items[55]=item(55,uuid(1),{
   state:'graded',review_id:Number.MAX_SAFE_INTEGER+3});
  await expect(api.listRunItems(uuid(1))).rejects.toThrow(/Lossy/);
  await expect(api.listRunItems(uuid(1),{limit:51}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('writes pause and resume with owner-free expected versions and readbacks',async()=>{
  const api=createLiveReviewRunApi();
  fake.client.rpc.mockImplementation(async(_:string,call:{p:Record<string,unknown>})=>{
   const env=call.p;
   expect(env).not.toHaveProperty('user_id');
   const action=env.operation;
   fake.data.review_runs[0]={...fake.data.review_runs[0],
    status:action==='pause'?'paused':'running',
    paused_at:action==='pause'?at:null,
    version:action==='pause'?2:3};
   return {data:{status:'ok',changed:[{resource:'review_runs',id:uuid(1),
    version:action==='pause'?2:3}],actionNo:action==='pause'?51:52},error:null};
  });
  expect((await api.pauseRun(uuid(1),1)).record).toMatchObject({
   status:'paused',version:2});
  expect((await api.resumeRun(uuid(1),2)).record).toMatchObject({
   status:'running',version:3});
  expect(fake.client.rpc.mock.calls.map(x=>(x[1] as {p:Row}).p.operation))
   .toEqual(['pause','resume']);
  expect(fake.client.rpc.mock.calls[0][1]).toMatchObject({p:{
   schemaVersion:1,resource:'review_runs',target:{id:uuid(1)},
   expectedVersion:1,patch:{}}});
  expect(fake.client.insert).not.toHaveBeenCalled();
  expect(fake.client.update).not.toHaveBeenCalled();
  expect(fake.client.delete).not.toHaveBeenCalled();
 });
 it('replays an identical envelope after network uncertainty and readback failure',async()=>{
  const api=createLiveReviewRunApi();
  let calls=0;
  fake.client.rpc.mockImplementation(async()=>{
   calls++;
   if(calls===1)return {data:null,error:{message:'Network unavailable'}};
   if(calls===2)return {data:{status:'ok',changed:[{resource:'review_runs',
    id:uuid(1),version:2}],actionNo:10},error:null};
   fake.data.review_runs[0]={...fake.data.review_runs[0],
    status:'paused',paused_at:at,version:2};
   return {data:{status:'ok',changed:[{resource:'review_runs',
    id:uuid(1),version:2}],actionNo:10},error:null};
  });
  await expect(api.pauseRun(uuid(1),1)).rejects.toThrow(/Network unavailable/);
  await expect(api.pauseRun(uuid(1),1)).rejects.toThrow(/not visible/);
  await expect(api.pauseRun(uuid(1),1)).resolves.toMatchObject({
   record:{status:'paused',version:2},actionNo:10});
  const env=fake.client.rpc.mock.calls.map(x=>JSON.stringify(x[1]));
  expect(new Set(env).size).toBe(1);
 });
 it('rejects stale versions, missing server RPC and invalid owner-injected drafts',async()=>{
  const api=createLiveReviewRunApi();
  await expect(api.pauseRun(uuid(1),0)).rejects.toMatchObject({code:'invalid'});
  await expect(api.startRun({settingsVersion:1,schedulerVersion:'fsrs-5',
   user_id:uuid(900)} as never)).rejects.toMatchObject({code:'invalid'});
  expect(fake.client.rpc).not.toHaveBeenCalled();
  fake.client.rpc.mockResolvedValueOnce({data:{status:'conflict',
   conflict:{currentVersion:6},changed:[],actionNo:null},error:null});
  await expect(api.pauseRun(uuid(1),1)).rejects.toMatchObject({code:'conflict'});
  fake.client.rpc.mockResolvedValueOnce({data:null,error:{
   code:'PGRST202',message:'Could not find the function review_runs_command'}});
  await expect(api.pauseRun(uuid(1),1)).rejects.toThrow(/not deployed/);
  expect(fake.client.insert).not.toHaveBeenCalled();
  expect(fake.client.delete).not.toHaveBeenCalled();
 });
 it('chooses and injects the correct mode-aware facade',()=>{
  const old=window.location.href;
  try{
   window.history.replaceState({},'','?demo=1');
   setReviewRunApiForTests(null);
   const demo=getReviewRunApi();
   expect(demo.mode).toBe('demo');
   window.history.replaceState({},'','?demo=0');
   expect(getReviewRunApi().mode).toBe('live');
   window.history.replaceState({},'','?demo=1');
   setReviewRunApiForTests(demo);
   expect(getReviewRunApi()).toBe(demo);
  }finally{
   setReviewRunApiForTests(null);
   sessionStorage.clear();
   window.history.replaceState({},'',old);
  }
 });
});
