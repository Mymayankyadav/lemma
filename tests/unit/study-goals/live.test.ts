import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveGoalApi} from '../../../src/data/study-goals/live';
import {getGoalApi,setGoalApiForTests} from '../../../src/data/study-goals';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
const owner='11111111-1111-4111-8111-111111111111';
const key='22222222-2222-4222-8222-222222222222';
const row=(n=1)=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0'),user_id:owner,
 period:'week',start_date:'2026-11-01',end_date:'2026-11-30',time_zone:'Asia/Kolkata',
 target_minutes:60,subject_id:null,project_id:null,archived_at:null,version:1,
 created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z'});
function fake(rows=[row()],results:Array<{data:unknown;error:{message:string;code?:string}|null}>=[]){
 const reads:Array<{table:string;chain:Array<[string,string,unknown]>}>=[];
 const sent:Array<Record<string,unknown>>=[];
 class Query implements PromiseLike<{data:unknown;error:null;count:number}>{
  chain:Array<[string,string,unknown]>=[];
  constructor(readonly table:string){}
  select(_:string,opts?:unknown){this.chain.push(['select','',opts]);return this}
  eq(a:string,b:string){this.chain.push(['eq',a,b]);return this}
  is(a:string,b:null){this.chain.push(['is',a,b]);return this}
  order(a:string){this.chain.push(['order',a,null]);return this}
  or(a:string){this.chain.push(['or','',a]);return this}
  range(a:number,b:number){this.chain.push(['range','',[a,b]]);return this}
  maybeSingle(){this.chain.push(['single','',null]);return this}
  then<TResult1={data:unknown;error:null;count:number},TResult2=never>(
   good?:((v:{data:unknown;error:null;count:number})=>TResult1|PromiseLike<TResult1>)|null,
   bad?:((e:unknown)=>TResult2|PromiseLike<TResult2>)|null,
  ):Promise<TResult1|TResult2>{
   reads.push({table:this.table,chain:this.chain.slice()});
   let x=rows.filter(r=>this.chain.every(([k,a,v])=>k==='eq'?r[a as keyof typeof r]===v:
    k==='is'?r[a as keyof typeof r]===null:true));
   const after=this.chain.find(([k])=>k==='or')?.[2] as string|undefined;
   if(after){const s=after.match(/start_date\.gt\.(\d{4}-\d\d-\d\d)/)?.[1];
    if(s)x=x.filter(r=>r.start_date>s);}
   const count=x.length;const range=this.chain.find(([k])=>k==='range')?.[2] as number[]|undefined;
   if(range)x=x.slice(range[0],range[1]+1);
   const head=this.chain.some(([k,_,v])=>k==='select'&&(v as {head?:boolean}|undefined)?.head);
   const one=this.chain.some(([k])=>k==='single');
   return Promise.resolve({data:head?null:one?(x[0]??null):x,error:null,count}).then(good,bad);
  }
 }
 const client={from:vi.fn((table:string)=>new Query(table)),
  rpc:vi.fn(async(_:string,args:{p:Record<string,unknown>})=>{
   sent.push(args.p);
   return results.shift()??{data:{status:'ok',changed:[{id:row().id,version:2}],
    actionNo:42,goal:row()},error:null};
  })};
 vi.mocked(liveClient).mockReturnValue(client as never);
 return {reads,sent,client};
}
const input={period:'week' as const,startDate:'2026-11-01',endDate:'2026-11-30',
 timeZone:'Asia/Kolkata',targetMinutes:300,subjectId:owner,projectId:null};
beforeEach(()=>{vi.clearAllMocks();setGoalApiForTests(null)});
describe('N59.2 owner RLS live goals',()=>{
 it('chooses live facade and reads without owner query fields',async()=>{
  const h=fake();
  expect(getGoalApi().mode).toBe('live');
  expect((await getGoalApi().listGoals()).total).toBe(1);
  expect((await getGoalApi().getGoal(key))).toBeNull();
  expect(h.reads.every(r=>r.table==='study_goals'&&!r.chain.some(c=>c[1]==='user_id'))).toBe(true);
  expect(h.reads[0].chain).toContainEqual(['is','archived_at',null]);
 });
 it('sends full lifecycle envelopes, optimistic versions, and no owner ID',async()=>{
  const h=fake(),api=createLiveGoalApi();
  expect((await api.createGoal(input)).actionNo).toBe(42);
  await api.updateGoal(row().id,1,{targetMinutes:400,startDate:'2026-11-02'});
  await api.archiveGoal(row().id,2);await api.restoreGoal(row().id,3);
  expect(await api.deleteGoal(row().id,4)).toEqual({record:{id:row().id},actionNo:42});
  expect(h.sent.map(p=>p.operation)).toEqual(['create','update','archive','restore','delete']);
  expect(h.sent[0]).toMatchObject({schemaVersion:1,resource:'study_goals',
   patch:{period:'week',start_date:'2026-11-01',end_date:'2026-11-30',
    time_zone:'Asia/Kolkata',target_minutes:300,subject_id:owner,project_id:null}});
  expect(h.sent[1]).toMatchObject({target:{id:row().id},expectedVersion:1,
   patch:{target_minutes:400,start_date:'2026-11-02'}});
  expect(h.sent.every(p=>!('userId' in p)&&!('user_id' in p))).toBe(true);
  expect(new Set(h.sent.map(p=>p.operationId)).size).toBe(5);
 });
 it('reuses exactly one operationId on uncertain transport retry',async()=>{
  const h=fake([],[
   {data:null,error:{message:'Failed to fetch'}},
   {data:{status:'ok',changed:[{id:row().id,version:1}],actionNo:17,goal:row()},error:null},
  ]);
  expect((await createLiveGoalApi().createGoal(input)).actionNo).toBe(17);
  expect(h.sent).toHaveLength(2);expect(h.sent[0]).toEqual(h.sent[1]);
 });
 it('maps RPC conflict, overlap, and missing goal to typed errors',async()=>{
  fake([],[
   {data:{status:'conflict',changed:[],conflict:{reason:'changed payload'}},error:null},
   {data:null,error:{message:'Overlapping active goal',code:'23514'}},
   {data:null,error:{message:'Study goal not found',code:'P0001'}},
  ]);
  const api=createLiveGoalApi();
  await expect(api.updateGoal(row().id,1,{targetMinutes:70})).rejects.toMatchObject({code:'conflict'});
  await expect(api.restoreGoal(row().id,2)).rejects.toMatchObject({code:'conflict'});
  await expect(api.archiveGoal(row().id,2)).rejects.toMatchObject({code:'not_found'});
 });
 it('rejects bad civil range, timezone, scope, version, limits and cursor filters',async()=>{
  const h=fake(),api=createLiveGoalApi();
  for(const bad of [{...input,startDate:'2026-02-30'},
   {...input,startDate:'2026-12-03'}, {...input,timeZone:'Mars/Olympus'},
   {...input,targetMinutes:0},{...input,subjectId:'name not UUID'}])
   await expect(api.createGoal(bad)).rejects.toMatchObject({code:'invalid'});
  await expect(api.updateGoal(row().id,0,{targetMinutes:1})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listGoals({limit:51})).rejects.toMatchObject({code:'invalid'});
  const page=await api.listGoals({limit:1});
  await expect(api.listGoals({cursor:page.nextCursor,includeArchived:true}))
   .resolves.toBeDefined();
  await expect(api.listGoals({cursor:'??bad'})).rejects.toMatchObject({code:'invalid'});
  expect(h.sent).toHaveLength(0);
 });
 it('returns exact count and bounded DB keysets, preserving nullable scope filters',async()=>{
  const h=fake([row(1),row(2),row(3)]),api=createLiveGoalApi();
  const page=await api.listGoals({limit:2,subjectId:null,projectId:null});
  expect(page.total).toBe(3);expect(page.items).toHaveLength(2);
  expect(page.nextCursor).not.toBeNull();
  expect(h.reads[1].chain).toContainEqual(['range','',[0,2]]);
  expect(h.reads[1].chain).toContainEqual(['is','subject_id',null]);
  await expect(api.listGoals({limit:2,cursor:page.nextCursor,includeArchived:true}))
   .rejects.toMatchObject({code:'invalid'});
  expect(h.reads.every(q=>!q.chain.some(c=>c[1]==='user_id'))).toBe(true);
 });
});
