import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveDayPlanApi} from '../../../src/data/day-plans/live';
import {liveClient} from '../../../src/data/live/client';
import type {NewDayPlan} from '../../../src/data/day-plans/contract';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
type Row=Record<string,unknown>;
type Err={code?:string;message?:string};
type Result={data:unknown;error:Err|null;count?:number|null};
type Read={table:string;columns:string;options:unknown;filters:Array<[string,string,unknown]>};
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const at='2026-11-06T09:00:00Z';
const row=(n:number,values:Row={}):Row=>({
 id:uuid(n),user_id:'owner-only-from-rls',plan_date:'2026-11-06',time_zone:'Asia/Kolkata',
 intention:'Prove a theorem',capacity_minutes:90,availability:{windows:[],sources:[]},
 status:'draft',closed_at:null,tomorrow_first_task_id:null,
 ritual:{choice:null,completedSteps:[],reflection:null},source:'app',
 version:1,created_at:at,updated_at:at,...values,
});
const child=(plan:number,n:number):Row=>({
 id:uuid(n),day_plan_id:uuid(plan),task_id:uuid(42+n),calendar_block_id:null,
 disposition:'carried_over',reason:'Not done yet',position:0,
});
const input:NewDayPlan={planDate:'2026-11-06',timeZone:'Asia/Kolkata',
 intention:'Proof effort',capacityMinutes:90,
 availability:{windows:[{start:'2026-11-06T08:00:00+05:30',end:'2026-11-06T10:00:00+05:30'}],
 sources:[{kind:'task',id:uuid(7),version:2}]},
 items:[{taskId:uuid(7),calendarBlockId:null,disposition:'unplaced',reason:'No time',position:0}],
 ritual:{choice:'focus',completedSteps:['plan'],reflection:null},
};
type FakeState={rows:Row[];children:Row[];pages:Row[][];reads:Read[];
 readError:Err|null;rpcQueue:Array<Result|Error>;
 calls:Array<{fn:string;payload:Record<string,unknown>}>};
class Builder implements PromiseLike<Result>{
 private filters:Array<[string,string,unknown]>=[];
 private columns='';
 private options:unknown;
 private single=false;
 constructor(private table:string,private fake:FakeState){}
 select(columns:string,options?:unknown){this.columns=columns;this.options=options;return this;}
 eq(c:string,v:unknown){this.filters.push(['eq',c,v]);return this;}
 gte(c:string,v:string){this.filters.push(['gte',c,v]);return this;}
 lte(c:string,v:string){this.filters.push(['lte',c,v]);return this;}
 in(c:string,v:string[]){this.filters.push(['in',c,v]);return this;}
 or(v:string){this.filters.push(['or','',v]);return this;}
 order(c:string,v:unknown){this.filters.push(['order',c,v]);return this;}
 limit(n:number){this.filters.push(['limit','',n]);return this;}
 maybeSingle(){this.single=true;return this;}
 then<A=Result,B=never>(resolve?:((value:Result)=>A|PromiseLike<A>)|null,
  reject?:((reason:unknown)=>B|PromiseLike<B>)|null):Promise<A|B>{
  this.fake.reads.push({table:this.table,columns:this.columns,options:this.options,filters:this.filters});
  const source=this.table==='day_plans'?this.fake.rows:this.fake.children;
  let rows=source.filter(row=>this.filters.every(([op,key,val])=>
   op==='eq'?row[key]===val:
   op==='gte'?String(row[key])>=String(val):
   op==='lte'?String(row[key])<=String(val):
   op==='in'?Array.isArray(val)&&val.includes(row[key]):true));
  const count=rows.length;
  if(this.table==='day_plans'&&!this.single&&this.columns==='*'&&this.fake.pages.length)
   rows=this.fake.pages.shift()!;
  const limit=this.filters.find(([op])=>op==='limit');
  if(limit)rows=rows.slice(0,Number(limit[2]));
  const result:Result=this.fake.readError?{data:null,error:this.fake.readError}:
   this.single?{data:rows[0]??null,error:null}:
   {data:(this.options as {head?:boolean}|undefined)?.head?null:rows,count,error:null};
  return Promise.resolve(result).then(resolve,reject);
 }
}
function harness(){
 const state={
  rows:[row(1)] as Row[],children:[child(1,2)] as Row[],
  pages:[] as Row[][],reads:[] as Read[],
  readError:null as Err|null,rpcQueue:[] as Array<Result|Error>,
  calls:[] as Array<{fn:string;payload:Record<string,unknown>}>,
 };
 const client={
  from:vi.fn((table:string)=>new Builder(table,state as ReturnType<typeof harness>)),
  rpc:vi.fn(async(fn:string,args:{p:Record<string,unknown>}):Promise<Result>=>{
   state.calls.push({fn,payload:args.p});
   const queued=state.rpcQueue.shift();
   if(queued instanceof Error)throw queued;
   if(queued)return queued;
   const expected=Number(args.p.expectedVersion??0),v=expected+1;
   if(state.rows.length)state.rows[0].version=v;
   return {data:{status:'ok',changed:[{id:uuid(1),version:v}],actionNo:14},error:null};
  })
 };
 return Object.assign(state,{client});
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{
 fake=harness();
 vi.mocked(liveClient).mockReturnValue(fake.client as never);
});
function envelope(index:number,operation:string):Record<string,unknown>{
 const {fn,payload}=fake.calls[index];
 expect(fn).toBe('day_plans_command');
 expect(payload).toMatchObject({schemaVersion:1,resource:'day_plans',operation});
 expect(payload.operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
 expect(JSON.stringify(payload)).not.toMatch(/user_id|userId|p_user|ownerId/);
 return payload;
}
describe('N60 live day plan RPC and owner-bound reads',()=>{
 it('reads exact owner counts, stable keyset pages, date and status filters and child placements',async()=>{
  fake.rows=[row(1,{plan_date:'2026-11-05'}),row(2,{plan_date:'2026-11-06'}),
   row(3,{plan_date:'2026-11-07',status:'closed'})];
  fake.children=[child(1,11),child(2,12)];
  fake.pages=[[fake.rows[0],fake.rows[1]],[fake.rows[1]]];
  const api=createLiveDayPlanApi();
  const first=await api.listDayPlans({limit:1});
  expect(first).toMatchObject({total:3,items:[{id:uuid(1),items:[{taskId:uuid(53)}]}]});
  expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  const second=await api.listDayPlans({limit:1,cursor:first.nextCursor});
  expect(second).toMatchObject({total:3,items:[{id:uuid(2)}],nextCursor:null});
  expect(fake.reads.filter(x=>x.table==='day_plans'&&x.columns==='*')[0].filters
   .filter(([op])=>op==='order').map(x=>x[1])).toEqual(['plan_date','id']);
  expect(fake.reads.some(x=>x.table==='day_plan_items'&&x.filters.some(([op])=>op==='in'))).toBe(true);
  const closed=await api.listDayPlans({status:'closed'});
  expect(closed).toMatchObject({total:1,items:[{id:uuid(3)}]});
  const dated=await api.listDayPlans({fromDate:'2026-11-06',toDate:'2026-11-07'});
  expect(dated.total).toBe(2);
  expect(fake.reads.every(r=>r.filters.every(([,key])=>key!=='user_id'))).toBe(true);
 });

 it('rejects bad cursors, dates, status, page sizes and plan UUID before any SDK call',async()=>{
  const api=createLiveDayPlanApi();
  await expect(api.listDayPlans({limit:0})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({fromDate:'2026-02-30'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({status:'unknown' as never})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDayPlans({cursor:'%%'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.getDayPlan('bad-id')).rejects.toMatchObject({code:'invalid'});
  await expect(api.commitDayPlan('bad-id',1)).rejects.toMatchObject({code:'invalid'});
  expect(fake.client.from).not.toHaveBeenCalled();
  expect(fake.client.rpc).not.toHaveBeenCalled();
  fake.pages=[[row(1),row(2)]];
  const page=await api.listDayPlans({limit:1});
  await expect(api.listDayPlans({status:'draft',limit:1,cursor:page.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
 });

 it('creates a dated plan and placement snapshot without a caller owner field',async()=>{
  const api=createLiveDayPlanApi();
  const created=await api.createDayPlan(input);
  expect(created).toMatchObject({actionNo:14,record:{id:uuid(1),version:1,items:[{id:uuid(2)}]}});
  const p=envelope(0,'create');
  expect(p).not.toHaveProperty('expectedVersion');
  expect(p).toMatchObject({patch:{
   plan_date:'2026-11-06',time_zone:'Asia/Kolkata',capacity_minutes:90,
   availability:{sources:[{kind:'task',id:uuid(7),version:2}]},
   items:[{task_id:uuid(7),calendar_block_id:null,disposition:'unplaced',reason:'No time',position:0}]
  }});
  expect(JSON.stringify(p)).not.toContain('owner-only-from-rls');
 });

 it('submits all lifecycle operations with expectedVersion, and never fabricates task versions',async()=>{
  const api=createLiveDayPlanApi();
  await api.updateDayPlan(uuid(1),1,{status:'previewed',intention:'Changed'});
  expect(envelope(0,'update')).toMatchObject({target:{id:uuid(1)},expectedVersion:1,
   patch:{status:'previewed',intention:'Changed'}});
  await api.commitDayPlan(uuid(1),2);
  const commit=envelope(1,'commit');
  expect(commit).toMatchObject({target:{id:uuid(1)},expectedVersion:2,patch:{}});
  expect(commit).not.toHaveProperty('currentVersions');
  await api.closeDayPlan(uuid(1),3,{tomorrowFirstTaskId:uuid(5),
   ritual:{choice:'finish',completedSteps:['close'],reflection:'Review tomorrow'}});
  expect(envelope(2,'close')).toMatchObject({target:{id:uuid(1)},expectedVersion:3,
   patch:{tomorrow_first_task_id:uuid(5),ritual:{choice:'finish'}}});
  await api.reopenDayPlan(uuid(1),4);
  expect(envelope(3,'reopen')).toMatchObject({target:{id:uuid(1)},expectedVersion:4,patch:{}});
  expect(fake.calls).toHaveLength(4);
 });

 it('reuses an operationId after a lost transport reply and clears it after success',async()=>{
  const api=createLiveDayPlanApi();
  fake.rpcQueue=[new Error('connection reset')];
  await expect(api.createDayPlan(input)).rejects.toThrow('connection reset');
  const first=envelope(0,'create');
  await api.createDayPlan(input);
  expect(envelope(1,'create').operationId).toBe(first.operationId);
  await api.createDayPlan(input);
  expect(envelope(2,'create').operationId).not.toBe(first.operationId);
 });

 it('maps stale version, SQL constraints and insufficient privilege to typed errors',async()=>{
  const api=createLiveDayPlanApi();
  fake.rpcQueue=[{data:{status:'conflict',changed:[],conflict:{currentVersion:8}},error:null}];
  await expect(api.updateDayPlan(uuid(1),1,{intention:'Stale'}))
   .rejects.toMatchObject({code:'conflict'});
  expect(envelope(0,'update').expectedVersion).toBe(1);
  await expect(api.updateDayPlan(uuid(1),0,{intention:'Bad'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.updateDayPlan(uuid(1),1,{})).rejects.toMatchObject({code:'invalid'});
  await expect(api.createDayPlan({...input,user_id:'another-user'} as never))
   .rejects.toMatchObject({code:'invalid'});
  fake.rpcQueue=[{data:null,error:{code:'23514',message:'constraint violated'}}];
  await expect(api.commitDayPlan(uuid(1),1)).rejects.toMatchObject({code:'invalid'});
  fake.rpcQueue=[{data:null,error:{code:'42501',message:'permission denied'}}];
  await expect(api.commitDayPlan(uuid(1),1)).rejects.toMatchObject({code:'auth'});
  expect(fake.client.rpc).toHaveBeenCalledTimes(3);
 });

 it('does not invent a record on a failed owner read after the command',async()=>{
  const api=createLiveDayPlanApi();
  fake.readError={code:'500',message:'Read timeout'};
  await expect(api.commitDayPlan(uuid(1),1)).rejects.toMatchObject({code:'server'});
  const first=envelope(0,'commit');
  fake.readError=null;
  await api.commitDayPlan(uuid(1),1);
  expect(envelope(1,'commit').operationId).toBe(first.operationId);
  fake.rows=[];
  await expect(api.closeDayPlan(uuid(1),2))
   .rejects.toMatchObject({code:'not_found'});
 });

 it('refuses incorrect receipt versions and malformed receipts',async()=>{
  const api=createLiveDayPlanApi();
  fake.rpcQueue=[{data:{status:'ok',changed:[],actionNo:1},error:null}];
  await expect(api.updateDayPlan(uuid(1),1,{intention:'Lost'}))
   .rejects.toMatchObject({code:'server'});
  fake.rpcQueue=[{data:{status:'ok',changed:[{id:uuid(1),version:100}],actionNo:2},error:null}];
  await expect(api.updateDayPlan(uuid(1),1,{intention:'Conflict'}))
   .rejects.toMatchObject({code:'server'});
 });
});
