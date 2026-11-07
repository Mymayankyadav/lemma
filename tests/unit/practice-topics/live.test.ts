import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLivePracticeTopicApi} from '../../../src/data/practice-topics/live';
import {getPracticeTopicApi,setPracticeTopicApiForTests} from '../../../src/data/practice-topics';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
type Row=Record<string,unknown>;
type R={data:unknown;error:{code?:string;message?:string}|null;count?:number|null};
type Read={table:string;columns:string;opts:unknown;filters:Array<[string,string,unknown]>};
const at='2026-11-07T10:00:00Z';
const id=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const topic=(n:number,extra:Row={}):Row=>({id:id(n),user_id:'owned-by-rls',
 title:'Topic '+n,subject_id:null,concept_id:null,checkpoint_id:null,
 cadence:{kind:'fixed_days',days:7},next_due_date:'2026-11-15',
 last_practiced_at:null,archived_at:null,version:1,created_at:at,updated_at:at,...extra});
const event=(n:number,extra:Row={}):Row=>({id:id(n),user_id:'owned-by-rls',
 topic_id:id(1),occurred_at:at,rating:2,response:null,minutes:null,
 voided_at:null,version:1,created_at:at,updated_at:at,...extra});
class Query implements PromiseLike<R>{
 private filters:Array<[string,string,unknown]>=[];
 private columns='';private opts:unknown;private single=false;
 constructor(private table:string,private state:{
  data:Record<string,Row[]>;reads:Read[];batches:Record<string,Row[][]>}){}
 select(c:string,o?:unknown){this.columns=c;this.opts=o;return this}
 eq(c:string,v:string){this.filters.push(['eq',c,v]);return this}
 is(c:string,v:null){this.filters.push(['is',c,v]);return this}
 not(c:string,o:string,v:null){this.filters.push(['not',c,o+' '+v]);return this}
 or(x:string){this.filters.push(['or','',x]);return this}
 order(c:string,o:unknown){this.filters.push(['order',c,o]);return this}
 limit(n:number){this.filters.push(['limit','',n]);return this}
 maybeSingle(){this.single=true;return this}
 then<TResult1=R,TResult2=never>(
  onfulfilled?:((value:R)=>TResult1|PromiseLike<TResult1>)|null,
  onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null
 ):Promise<TResult1|TResult2>{
  this.state.reads.push({table:this.table,columns:this.columns,opts:this.opts,
   filters:this.filters});
  let rows=(this.state.data[this.table]||[]).filter(x=>this.filters.every(([op,k,v])=>
   op==='eq'?x[k]===v:op==='is'?x[k]===null:op==='not'?x[k]!==null:true));
  const total=rows.length;
  if(this.columns==='*'&&!this.single&&(this.state.batches[this.table]||[]).length)
   rows=this.state.batches[this.table].shift()!;
  const limit=this.filters.find(x=>x[0]==='limit');
  if(limit)rows=rows.slice(0,Number(limit[2]));
  const r:R={data:(this.opts as {head?:boolean}|undefined)?.head?null:
   this.single?(rows[0]??null):rows,error:null,count:total};
  return Promise.resolve(r).then(onfulfilled,onrejected);
 }
}
function harness(){
 const data={practice_topics:[topic(1)] as Row[],practice_events:[event(4)] as Row[]};
 const state={data,reads:[] as Read[],
  batches:{practice_topics:[] as Row[][],practice_events:[] as Row[][]},
  calls:[] as Array<{fn:string;p:Row}>,responses:[] as Array<R|Error>};
 const client={
  from:vi.fn((t:string)=>new Query(t,state)),
  rpc:vi.fn(async(fn:string,args:{p:Row})=>{
   state.calls.push({fn,p:args.p});
   const r=state.responses.shift();
   if(r instanceof Error)throw r;
   return r??{data:{status:'ok',changed:[{id:id(1),version:2},
    {id:id(4),version:2}],actionNo:23},error:null};
  })
 };
 return {...state,client};
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{fake=harness();vi.mocked(liveClient).mockReturnValue(fake.client as never);
 setPracticeTopicApiForTests(null)});
const check=(i:number,op:string)=>{
 const call=fake.calls[i];
 expect(call.fn).toBe('practice_topics_command');
 expect(call.p).toMatchObject({schemaVersion:1,resource:'practice_topics',operation:op});
 expect(call.p.operationId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
 expect(JSON.stringify(call.p)).not.toMatch(/user_id|userId|p_user/);
 return call.p;
};
describe('N57.2 practice live RLS RPC adapter',()=>{
 it('uses injectable live facade, owner-scoped reads, exact totals and 1-50 keyset pages',async()=>{
  const api=createLivePracticeTopicApi();
  setPracticeTopicApiForTests(api);
  expect(getPracticeTopicApi()).toBe(api);
  fake.data.practice_topics=[topic(1),topic(2),topic(3),topic(5,{archived_at:at})];
  fake.batches.practice_topics=[[topic(1),topic(2),topic(3)],[topic(3)]];
  const first=await api.listTopics({limit:2});
  expect(first).toMatchObject({total:3});
  expect(first.items).toHaveLength(2);
  expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  const second=await api.listTopics({limit:2,cursor:first.nextCursor});
  expect(second.items.map(x=>x.id)).toEqual([id(3)]);
  expect(second.total).toBe(3);
  const page=fake.reads.filter(x=>x.table==='practice_topics'&&x.columns==='*');
  expect(page.map(x=>x.filters.find(f=>f[0]==='limit')?.[2])).toEqual([3,3]);
  expect(page[1].filters.some(x=>x[0]==='or'&&String(x[2]).includes('next_due_date.eq.2026-11-15'))).toBe(true);
  expect(fake.reads.every(x=>x.filters.every(y=>y[1]!=='user_id'))).toBe(true);
  expect(fake.client.rpc).not.toHaveBeenCalled();
 });
 it('binds topic cursor to archive and subject filters; rejects forged owner fields',async()=>{
  const api=createLivePracticeTopicApi();
  fake.batches.practice_topics=[[topic(1),topic(2)]];
  const first=await api.listTopics({limit:1});
  await expect(api.listTopics({cursor:first.nextCursor,archived:'all'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listTopics({cursor:first.nextCursor,subjectId:id(8)}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listTopics({cursor:'%%%'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listTopics({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.createTopic({title:'A',userId:'forged'} as never))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.createTopic({title:'B',nextDueDate:'2026-02-30'}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('maps typed topics and events through owner-only tables and void filters',async()=>{
  const api=createLivePracticeTopicApi();
  fake.data.practice_topics=[topic(1,{cadence:{kind:'after_rating',daysByRating:[1,3,7,14]}})];
  expect((await api.getTopic(id(1)))?.cadence).toEqual({kind:'after_rating',daysByRating:[1,3,7,14]});
  expect(await api.getTopic(id(2))).toBeNull();
  fake.data.practice_events=[event(4),event(5,{voided_at:at})];
  fake.batches.practice_events=[[event(4),event(5)],[event(5)]];
  const first=await api.listEvents({limit:1,includeVoided:true,topicId:id(1)});
  expect(first.total).toBe(2);
  expect(first.nextCursor).toBeTruthy();
  await expect(api.listEvents({limit:1,cursor:first.nextCursor,topicId:id(2)}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listEvents({limit:1,cursor:first.nextCursor,topicId:id(1)}))
   .rejects.toMatchObject({code:'invalid'});
  const second=await api.listEvents({limit:1,cursor:first.nextCursor,topicId:id(1),
   includeVoided:true});
  expect(second.items[0].voidedAt).toBe(at);
  const active=await api.listEvents({topicId:id(1)});
  expect(active.total).toBe(1);
  expect(fake.reads.some(r=>r.table==='practice_events'&&r.filters.some(x=>x[0]==='is'&&x[1]==='voided_at'))).toBe(true);
 });
 it('sends every topic operation with versions, snake-case patch and isolated UUIDs',async()=>{
  const api=createLivePracticeTopicApi();
  const created=await api.createTopic({title:'  Exercises ',subjectId:id(9),
   cadence:{kind:'fixed_days',days:5},nextDueDate:'2026-11-14'});
  expect(created).toMatchObject({actionNo:23,record:{id:id(1)}});
  expect(check(0,'create')).toMatchObject({patch:{title:'Exercises',subject_id:id(9),
   cadence:{kind:'fixed_days',days:5},next_due_date:'2026-11-14'}});
  await api.updateTopic(id(1),1,{title:'Revisions',checkpointId:null});
  expect(check(1,'update')).toMatchObject({target:{id:id(1)},expectedVersion:1,
   patch:{title:'Revisions',checkpoint_id:null}});
  await api.archiveTopic(id(1),2);check(2,'archive');
  await api.restoreTopic(id(1),3);check(3,'restore');
  await api.deleteTopic(id(1),4);
  expect(check(4,'delete')).toMatchObject({target:{id:id(1)},expectedVersion:4,patch:{}});
  const ids=fake.calls.map(c=>c.p.operationId);
  expect(new Set(ids).size).toBe(5);
 });
 it('records practice and voids event by version using the command, reading both results',async()=>{
  const api=createLivePracticeTopicApi();
  const rec=await api.recordPractice(id(1),1,{rating:2,occurredAt:at,minutes:45,
   response:'Worked through steps'});
  expect(rec.record).toMatchObject({topic:{id:id(1)},event:{id:id(4),rating:2}});
  expect(check(0,'record')).toMatchObject({target:{id:id(1)},expectedVersion:1,patch:{
   rating:2,occurred_at:at,minutes:45,response:'Worked through steps'}});
  const voided=await api.voidPracticeEvent(id(4),1);
  expect(voided.record).toMatchObject({topic:{id:id(1)},event:{id:id(4)}});
  expect(check(1,'void_event')).toMatchObject({target:{id:id(4)},expectedVersion:1,patch:{}});
  await expect(api.recordPractice(id(1),1,{rating:0 as never}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordPractice(id(1),1,{rating:2,occurredAt:'2026-02-30T10:00:00Z'}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('replays an identical envelope after an uncertain outcome, not a changed payload',async()=>{
  const api=createLivePracticeTopicApi();
  fake.responses=[{data:null,error:{message:'fetch failed'}},
   {data:{status:'ok',changed:[{id:id(1),version:2}],actionNo:51},error:null}];
  await expect(api.createTopic({title:'Repeat'})).rejects.toMatchObject({code:'server'});
  const original=check(0,'create');
  expect((await api.createTopic({title:'Repeat'})).actionNo).toBe(51);
  expect(check(1,'create')).toEqual(original);
  await api.createTopic({title:'Repeat'});
  expect(check(2,'create').operationId).not.toBe(original.operationId);
 });
 it('maps optimistic conflicts, post-commit unreadable rows and invalid receipts',async()=>{
  const api=createLivePracticeTopicApi();
  fake.responses=[{data:{status:'conflict',changed:[],conflict:{currentVersion:9}},error:null}];
  await expect(api.updateTopic(id(1),1,{title:'Lost'}))
   .rejects.toMatchObject({code:'conflict'});
  expect(check(0,'update')).toMatchObject({expectedVersion:1});
  await expect(api.updateTopic(id(1),0,{title:'bad'}))
   .rejects.toMatchObject({code:'invalid'});
  fake.responses=[{data:{status:'ok',changed:[],actionNo:4},error:null}];
  await expect(api.archiveTopic(id(1),1)).rejects.toMatchObject({code:'server'});
  fake.responses=[{data:{status:'ok',changed:[{id:id(7),version:1}],actionNo:4},error:null}];
  fake.data.practice_topics=[];
  await expect(api.createTopic({title:'Unseen'}))
   .rejects.toMatchObject({code:'server'});
  const first=check(2,'create');
  fake.data.practice_topics=[topic(7)];
  await api.createTopic({title:'Unseen'});
  expect(check(3,'create')).toEqual(first);
 });
});
