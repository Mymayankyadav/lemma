import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {createLiveStudyEventApi} from '../../../src/data/study-events/live';
import {getStudyEventApi,setStudyEventApiForTests} from '../../../src/data/study-events';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));

type Row=Record<string,unknown>;
type Result={data:Row|Row[]|null;error:{code?:string;message?:string}|null};
type Filter={op:string;column:string;value:unknown};
type Read={table:string;filters:Filter[]};
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const at='2026-11-07T08:00:00.000Z';
const owner=uuid(999);
const entry=uuid(1000);
function row(n:number,extra:Row={}):Row{
 return {
  id:uuid(n),user_id:owner,entry_id:entry,kind:'notice',
  occurred_at:new Date(Date.parse(at)+n*60_000).toISOString(),
  duration_minutes:null,note:'Noticed question '+n,
  related_kind:null,related_id:null,voided_at:null,
  version:1,source:'app',created_at:at,updated_at:at,...extra,
 };
}
class Query implements PromiseLike<Result>{
 private filters:Filter[]=[];
 private single=false;
 constructor(private table:string,private state:{data:Record<string,Row[]>;reads:Read[]}){}
 select(_columns:string){return this}
 eq(column:string,value:unknown){this.filters.push({op:'eq',column,value});return this}
 in(column:string,value:unknown[]){this.filters.push({op:'in',column,value});return this}
 is(column:string,value:unknown){this.filters.push({op:'is',column,value});return this}
 order(column:string,value:unknown){this.filters.push({op:'order',column,value});return this}
 range(start:number,end:number){this.filters.push({op:'range',column:'',value:[start,end]});return this}
 maybeSingle(){this.single=true;return this}
 then<TResult1=Result,TResult2=never>(
  ok?:((value:Result)=>TResult1|PromiseLike<TResult1>)|null,
  no?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null
 ):Promise<TResult1|TResult2>{
  this.state.reads.push({table:this.table,filters:this.filters});
  const matching=(this.state.data[this.table]??[]).filter(r=>
   this.filters.every(f=>f.op==='eq'?r[f.column]===f.value:
    f.op==='in'?(f.value as unknown[]).includes(r[f.column]):
    f.op==='is'?r[f.column]===f.value:true));
  matching.sort((a,b)=>String(a.occurred_at??a.id).localeCompare(
   String(b.occurred_at??b.id))||String(a.id).localeCompare(String(b.id)));
  const range=this.filters.find(f=>f.op==='range');
  const selected=range?matching.slice((range.value as number[])[0],
   (range.value as number[])[1]+1):matching;
  const response:Result={data:this.single?(selected[0]??null):selected,error:null};
  return Promise.resolve(response).then(ok,no);
 }
}
function harness(){
 const data:Record<string,Row[]>={study_events:[row(1),row(2),row(3)]};
 const state={data,reads:[] as Read[]};
 const client={from:vi.fn((table:string)=>new Query(table,state)),
  rpc:vi.fn(),insert:vi.fn(),update:vi.fn(),delete:vi.fn()};
 return {...state,client};
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{
 sessionStorage.clear();
 fake=harness();
 vi.mocked(liveClient).mockReturnValue(fake.client as never);
});
afterEach(()=>{setStudyEventApiForTests(null);sessionStorage.clear()});

describe('N64.2 owner-RLS study event live reads',()=>{
 it('maps only owner-visible records and filters by entry, kind and voided state',async()=>{
  const api=createLiveStudyEventApi();
  expect(api.mode).toBe('live');
  const all=await api.listEvents();
  expect(all).toMatchObject({total:3,nextCursor:null});
  expect(all.items.map(r=>r.id)).toEqual([uuid(1),uuid(2),uuid(3)]);
  expect(all.items[0]).toMatchObject({entryId:entry,kind:'notice',
   version:1,source:'app',voidedAt:null,relatedKind:null,relatedId:null});
  expect(all.items[0]).not.toHaveProperty('user_id');
  expect((await api.getEvent(uuid(2)))?.id).toBe(uuid(2));
  expect(await api.getEvent(uuid(888))).toBeNull();
  expect(fake.client.rpc).not.toHaveBeenCalled();
  fake.data.study_events[1]=row(2,{kind:'drift',duration_minutes:7,
   related_kind:'task',related_id:uuid(77)});
  fake.data.study_events[2]=row(3,{voided_at:at});
  expect((await api.listEvents()).total).toBe(2);
  expect((await api.listEvents({kind:['drift']})).items[0])
   .toMatchObject({kind:'drift',durationMinutes:7,relatedKind:'task',
    relatedId:uuid(77)});
  expect((await api.listEvents({includeVoided:true})).total).toBe(3);
  expect((await api.listEvents({entryId:uuid(999),includeVoided:true})).total).toBe(0);
  expect(fake.reads.every(x=>x.filters.every(f=>f.column!=='user_id'))).toBe(true);
  expect(fake.reads.some(x=>x.filters.some(f=>f.op==='is'&&f.column==='voided_at')))
   .toBe(true);
 });
 it('scans 57 owner-RLS rows in <=50 record batches and returns exact filter-bound cursor pages',async()=>{
  const api=createLiveStudyEventApi();
  fake.data.study_events=Array.from({length:57},(_,i)=>row(i+1));
  const ids:string[]=[];let cursor:string|null=null;
  for(let i=0;i<20;i++){
   const page=await api.listEvents({limit:8,cursor});
   expect(page.total).toBe(57);
   ids.push(...page.items.map(r=>r.id));
   cursor=page.nextCursor;
   if(cursor===null)break;
  }
  expect(ids).toHaveLength(57);
  expect(new Set(ids).size).toBe(57);
  const ranges=fake.reads.flatMap(x=>x.filters.filter(f=>f.op==='range'));
  expect(ranges.length).toBeGreaterThan(2);
  expect(ranges.every(f=>(f.value as number[])[1]-(f.value as number[])[0]+1<=50))
   .toBe(true);
  const first=await api.listEvents({limit:2});
  await expect(api.listEvents({limit:2,kind:['notice'],
   cursor:first.nextCursor})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listEvents({includeVoided:true,limit:2,
   cursor:first.nextCursor})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listEvents({userId:owner} as never))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listEvents({cursor:'bad/cursor'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listEvents({limit:51}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('rejects malformed database provenance, invalid instants and drift duration',async()=>{
  const api=createLiveStudyEventApi();
  fake.data.study_events=[row(1,{source:'forged'})];
  await expect(api.getEvent(uuid(1))).rejects.toMatchObject({code:'server'});
  fake.data.study_events=[row(1,{occurred_at:'2026-11-07T08:00:00'})];
  await expect(api.getEvent(uuid(1))).rejects.toMatchObject({code:'invalid'});
  fake.data.study_events=[row(1,{kind:'urge',duration_minutes:3})];
  await expect(api.getEvent(uuid(1))).rejects.toMatchObject({code:'invalid'});
 });
});
describe('N64.2 audited study event write command lifecycle',()=>{
 it('records a normalized event through one owner-free RPC and confirms a journal receipt',async()=>{
  const api=createLiveStudyEventApi();
  fake.client.rpc.mockImplementation(async(name:string,args:{p:Row})=>{
   expect(name).toBe('study_events_command');
   const p=args.p;
   expect(p).toMatchObject({schemaVersion:1,resource:'study_events',
    operation:'record',patch:{entry_id:entry,kind:'notice',
     occurred_at:'2026-11-07T08:00:00.000Z',note:'Insight'}});
   expect(p).not.toHaveProperty('user_id');
   expect(p).not.toHaveProperty('p_user');
   expect(p.patch).not.toHaveProperty('source');
   expect(p.patch).not.toHaveProperty('voided_at');
   fake.data.study_events.push(row(9,{occurred_at:'2026-11-07T08:00:00.000Z',
    note:'Insight'}));
   return {data:{status:'ok',changed:[{resource:'study_events',
    id:uuid(9),version:1}],actionNo:71},error:null};
  });
  const saved=await api.recordEvent({entryId:entry,kind:'notice',
   occurredAt:'2026-11-07T13:30:00+05:30',note:'Insight'});
  expect(saved).toMatchObject({actionNo:71,record:{
   id:uuid(9),version:1,source:'app',note:'Insight',voidedAt:null}});
  expect(fake.client.rpc).toHaveBeenCalledTimes(1);
  expect(fake.client.insert).not.toHaveBeenCalled();
  expect(fake.client.update).not.toHaveBeenCalled();
  expect(fake.client.delete).not.toHaveBeenCalled();
  expect(fake.reads.every(x=>x.filters.every(f=>f.column!=='user_id'))).toBe(true);
 });
 it('edits a drift safely, revalidates changed kind and rejects forged caller metadata',async()=>{
  const api=createLiveStudyEventApi();
  fake.data.study_events=[row(1,{kind:'drift',duration_minutes:12})];
  await expect(api.editEvent(uuid(1),1,{kind:'urge'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.editEvent(uuid(1),1,{source:'mcp'} as never))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.editEvent(uuid(1),0,{note:'Invalid'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordEvent({entryId:entry,kind:'notice',user_id:owner} as never))
   .rejects.toMatchObject({code:'invalid'});
  expect(fake.client.rpc).not.toHaveBeenCalled();
  fake.client.rpc.mockImplementation(async(_name:string,args:{p:Row})=>{
   expect(args.p).toMatchObject({operation:'edit',
    target:{id:uuid(1)},expectedVersion:1,
    patch:{kind:'urge',duration_minutes:null,note:'Reclassified'}});
   fake.data.study_events[0]=row(1,{kind:'urge',duration_minutes:null,
    note:'Reclassified',version:2});
   return {data:{status:'ok',changed:[{id:uuid(1),version:2}],actionNo:72},
    error:null};
  });
  const result=await api.editEvent(uuid(1),1,
   {kind:'urge',durationMinutes:null,note:'Reclassified'});
  expect(result).toMatchObject({actionNo:72,record:{
   kind:'urge',version:2,durationMinutes:null,note:'Reclassified'}});
 });
 it('voids and restores without browser-controlled voidedAt or direct DML',async()=>{
  const api=createLiveStudyEventApi();
  fake.client.rpc.mockImplementation(async(_name:string,args:{p:Row})=>{
   expect(args.p).not.toHaveProperty('user_id');
   expect(args.p.patch).toEqual({});
   const op=args.p.operation;
   fake.data.study_events[0]=row(1,{version:op==='void'?2:3,
    voided_at:op==='void'?at:null});
   return {data:{status:'ok',changed:[{resource:'study_events',id:uuid(1),
    version:op==='void'?2:3}],actionNo:op==='void'?81:82},error:null};
  });
  expect((await api.voidEvent(uuid(1),1)).record)
   .toMatchObject({version:2,voidedAt:at});
  expect((await api.restoreEvent(uuid(1),2)).record)
   .toMatchObject({version:3,voidedAt:null});
  expect(fake.client.rpc.mock.calls.map(x=>(x[1] as {p:Row}).p.operation))
   .toEqual(['void','restore']);
  expect(fake.client.update).not.toHaveBeenCalled();
  expect(fake.client.insert).not.toHaveBeenCalled();
 });
 it('reuses a byte-identical operation ID after RPC uncertainty and post-receipt read failure',async()=>{
  const api=createLiveStudyEventApi();
  let n=0;
  fake.client.rpc.mockImplementation(async()=>{
   n++;
   if(n===1)return {data:null,error:{message:'Connection closed'}};
   if(n===3)fake.data.study_events.push(row(55));
   return {data:{status:'ok',changed:[{id:uuid(55),version:1}],actionNo:92},
    error:null};
  });
  const input={entryId:entry,kind:'notice' as const,note:'Retry me'};
  await expect(api.recordEvent(input)).rejects.toThrow(/Connection closed/);
  await expect(api.recordEvent(input)).rejects.toThrow(/not visible/);
  const successful=await api.recordEvent(input);
  expect(successful.record.id).toBe(uuid(55));
  const envelopes=fake.client.rpc.mock.calls.map(x=>JSON.stringify(x[1]));
  expect(new Set(envelopes).size).toBe(1);
  await api.recordEvent(input);
  const fourth=(fake.client.rpc.mock.calls[3][1] as {p:Row}).p;
  const first=(fake.client.rpc.mock.calls[0][1] as {p:Row}).p;
  expect(fourth.operationId).not.toBe(first.operationId);
 });
 it('maps optimistic and operation-ID conflicts and fails closed on undeployed commands',async()=>{
  const api=createLiveStudyEventApi();
  fake.client.rpc.mockResolvedValueOnce({data:{status:'conflict',
   conflict:{currentVersion:7},changed:[],actionNo:null},error:null});
  await expect(api.voidEvent(uuid(1),1)).rejects.toMatchObject({code:'conflict'});
  fake.client.rpc.mockResolvedValueOnce({data:null,error:{
   code:'23505',message:'operationId changed payload conflict'}});
  await expect(api.voidEvent(uuid(1),1)).rejects.toMatchObject({code:'conflict'});
  fake.client.rpc.mockResolvedValueOnce({data:null,error:{
   code:'PGRST202',message:'Could not find function study_events_command'}});
  await expect(api.voidEvent(uuid(1),1)).rejects.toThrow(/not deployed/);
  fake.client.rpc.mockResolvedValueOnce({data:{
   status:'ok',changed:[{id:uuid(1),version:2}],actionNo:null},error:null});
  await expect(api.voidEvent(uuid(1),1)).rejects.toThrow(/unaudited/);
  expect(fake.client.insert).not.toHaveBeenCalled();
  expect(fake.client.update).not.toHaveBeenCalled();
  expect(fake.client.delete).not.toHaveBeenCalled();
 });
 it('selects demo/live modes and supports injection without importing the SDK in demo mode',()=>{
  const old=window.location.href;
  try{
   window.history.replaceState({},'','?demo=1');
   setStudyEventApiForTests(null);
   const demo=getStudyEventApi();
   expect(demo.mode).toBe('demo');
   expect(getStudyEventApi()).toBe(demo);
   window.history.replaceState({},'','?demo=0');
   expect(getStudyEventApi().mode).toBe('live');
   setStudyEventApiForTests(demo);
   window.history.replaceState({},'','?demo=1');
   expect(getStudyEventApi()).toBe(demo);
   expect(fake.client.rpc).not.toHaveBeenCalled();
  }finally{
   setStudyEventApiForTests(null);
   sessionStorage.clear();
   window.history.replaceState({},'',old);
  }
 });
});
