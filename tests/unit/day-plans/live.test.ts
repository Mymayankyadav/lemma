import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveDayPlanApi} from '../../../src/data/day-plans/live';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));

type Row=Record<string,unknown>;
type Reply={data:unknown;error:{code?:string;message?:string}|null};
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const at='2026-11-07T10:00:00Z';
const base=(n:number,extra:Row={}):Row=>({
 id:uuid(n),user_id:uuid(900),plan_date:new Date(Date.UTC(2026,10,7+n)).toISOString().slice(0,10),
 time_zone:'Asia/Kolkata',intention:'Learn a theorem',capacity_minutes:90,
 availability:{sources:[]},status:'draft',closed_at:null,tomorrow_first_task_id:null,
 ritual:{},version:1,source:'app',created_at:at,updated_at:at,...extra
});
const item=(n:number,plan=uuid(1),extra:Row={}):Row=>({
 id:uuid(200+n),user_id:uuid(900),plan_id:plan,task_id:uuid(100+n),
 calendar_block_id:null,disposition:'unplaced',reason:'no_capacity',
 position:n,version:1,source:'app',...extra
});
class Query implements PromiseLike<Reply>{
 private filters:Array<[string,unknown]>=[];
 private single=false;
 constructor(private table:string,private state:{
  rows:Record<string,Row[]>;reads:Array<{table:string;fields:Array<[string,unknown]>}>}){}
 select(_fields:string){return this}
 eq(field:string,value:unknown){this.filters.push([field,value]);return this}
 maybeSingle(){this.single=true;return this}
 range(start:number,end:number){this.filters.push(['range',[start,end]]);return this}
 then<T=Reply,U=never>(done?:((value:Reply)=>T|PromiseLike<T>)|null,
  fail?:((e:unknown)=>U|PromiseLike<U>)|null):Promise<T|U>{
  this.state.reads.push({table:this.table,fields:[...this.filters]});
  const selected=(this.state.rows[this.table]??[]).filter(row=>this.filters.every(([f,v])=>
   f==='range'||row[f]===v));
  const range=this.filters.find(([f])=>f==='range');
  const cut=range?selected.slice((range[1] as number[])[0],(range[1] as number[])[1]+1):selected;
  return Promise.resolve({data:this.single?(cut[0]??null):cut,error:null}).then(done,fail);
 }
}
function fake(){
 const state={rows:{day_plans:[base(1),base(2)],day_plan_items:[item(0)]} as Record<string,Row[]>,
  reads:[] as Array<{table:string;fields:Array<[string,unknown]>}>};
 const rpc=vi.fn(async(_name:string,args:{p:Row}):Promise<Reply>=>{
  const env=args.p,operation=env.operation as string;
  const target=(env.target as Row|undefined)?.id as string|undefined;
  let row=state.rows.day_plans.find(r=>r.id===target);
  if(!row)row=state.rows.day_plans[0];
  const next={...row,version:operation==='create'?1:Number(row.version)+1,
   status:operation==='preview'?'previewed':operation==='commit'?'committed':
    operation==='close'?'closed':operation==='reopen'?'committed':row.status,
   closed_at:operation==='close'?at:operation==='reopen'?null:row.closed_at,
   ritual:operation==='close'?(env.patch as Row).ritual??row.ritual:row.ritual};
  state.rows.day_plans=state.rows.day_plans.map(x=>x.id===next.id?next:x);
  return {data:{status:'ok',actionNo:4,
   changed:[{resource:'day_plans',id:next.id,version:next.version}],plan:next},error:null};
 });
 const client={from:vi.fn((table:string)=>new Query(table,state)),rpc};
 return {...state,rpc,client};
}
let harness:ReturnType<typeof fake>;
beforeEach(()=>{harness=fake();vi.mocked(liveClient).mockReturnValue(harness.client as never)});
describe('N60.2 owner-RLS day plans and atomic RPC',()=>{
 it('reads >50 bounded owner pages, exact totals, ordered items and filter-bound cursors',async()=>{
  harness.rows.day_plans=Array.from({length:57},(_,i)=>base(i+1));
  harness.rows.day_plan_items=Array.from({length:57},(_,i)=>item(i,uuid(1)));
  const api=createLiveDayPlanApi(),ids:string[]=[];
  let cursor:string|null=null;
  for(let i=0;i<12;i++){
   const p=await api.listPlans({limit:7,cursor});
   expect(p.total).toBe(57);
   ids.push(...p.items.map(r=>r.id));cursor=p.nextCursor;if(!cursor)break;
  }
  expect(new Set(ids).size).toBe(57);
  expect(ids).toHaveLength(57);
  const one=await api.listPlans({limit:1});
  await expect(api.listPlans({status:['closed'],cursor:one.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  expect((await api.getPlan(uuid(1)))?.id).toBe(uuid(1));
  expect(await api.getPlan(uuid(999))).toBeNull();
  const items=await api.listItems(uuid(1),{limit:50});
  expect(items.total).toBe(57);expect(items.items).toHaveLength(50);
  const second=await api.listItems(uuid(1),{limit:50,cursor:items.nextCursor});
  expect(second.items).toHaveLength(7);
  expect(second.items.every(i=>i.disposition==='unplaced'&&i.reason==='no_capacity')).toBe(true);
  await expect(api.listItems(uuid(2),{cursor:items.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  expect(harness.reads.every(r=>r.fields.every(([k])=>k!=='user_id'))).toBe(true);
  expect(harness.reads.filter(r=>r.fields.some(([f])=>f==='range')).every(r=>
   r.fields.filter(([f])=>f==='range').every(([,bounds])=>
    (bounds as number[])[1]-(bounds as number[])[0]+1<=50))).toBe(true);
  expect(harness.rpc).not.toHaveBeenCalled();
 });
 it('sends exact six operation envelopes without owner fields and retains dispositions',async()=>{
  const api=createLiveDayPlanApi(),id=uuid(1),task=uuid(103),block=uuid(400);
  const source={sources:[{resource:'tasks',id:task,version:3},
   {resource:'calendar_blocks',id:block,version:7}]};
  await api.createPlan({planDate:'2026-11-08',timeZone:'Asia/Kolkata'});
  await api.updatePlan(id,1,{intention:'A changed plan'});
  await api.previewPlan(id,2,[{taskId:task,blockId:block,
   disposition:'placed',position:0},{taskId:task,
   disposition:'carried_over',reason:'No capacity',position:1}],source as never);
  await api.commitPlan(id,3);
  await api.closePlan(id,4,{reflection:'Finished'});
  await api.reopenPlan(id,5);
  const envelopes=harness.rpc.mock.calls.map(([name,params])=>{
   expect(name).toBe('day_plans_command');
   return params.p;
  });
  expect(envelopes.map(x=>x.operation)).toEqual([
   'create','update','preview','commit','close','reopen']);
  expect(envelopes.map(x=>x.expectedVersion)).toEqual([undefined,1,2,3,4,5]);
  expect(envelopes.map(x=>(x.target as Row|undefined)?.id)).toEqual([
   undefined,id,id,id,id,id]);
  expect(envelopes[2].patch).toMatchObject({availability:source,
   items:[{task_id:task,calendar_block_id:block,position:0},
    {task_id:task,disposition:'carried_over',reason:'No capacity',position:1}]});
  for(const p of envelopes){
   expect(p.resource).toBe('day_plans');expect(p.schemaVersion).toBe(1);
   expect(p.operationId).toMatch(/^[0-9a-f-]{36}$/i);
   expect(JSON.stringify(p)).not.toMatch(/user_id|ownerId|owner_id|userId/);
  }
  expect(new Set(envelopes.map(p=>p.operationId)).size).toBe(6);
  expect((await api.getPlan(id))?.closedAt).toBeNull();
  expect((await api.getPlan(id))?.status).toBe('committed');
 });
 it('reuses operationId after ambiguous network failure and generates a new ID on success',async()=>{
  const api=createLiveDayPlanApi();
  const baseRpc=harness.rpc.getMockImplementation()!;
  let once=true;
  harness.rpc.mockImplementation(async(...args)=>{
   if(once){once=false;throw Error('network disappeared after commit')}
   return baseRpc(...args);
  });
  await expect(api.updatePlan(uuid(1),1,{intention:'retry'})).rejects.toThrow('network disappeared');
  const first=harness.rpc.mock.calls[0][1].p.operationId;
  await api.updatePlan(uuid(1),1,{intention:'retry'});
  expect(harness.rpc.mock.calls[1][1].p.operationId).toBe(first);
  await api.updatePlan(uuid(1),2,{intention:'retry again'});
  expect(harness.rpc.mock.calls[2][1].p.operationId).not.toBe(first);
 });
 it('maps server conflicts, invalid source snapshots and forbids caller owner metadata',async()=>{
  const api=createLiveDayPlanApi();
  harness.rpc.mockResolvedValueOnce({data:{status:'conflict',
   conflict:{currentVersion:5},changed:[],actionNo:null},error:null});
  await expect(api.commitPlan(uuid(1),1)).rejects.toMatchObject({code:'conflict'});
  expect(harness.rpc).toHaveBeenCalledTimes(1);
  await expect(api.createPlan({planDate:'2026-11-08',timeZone:'UTC',
   user_id:'forged'} as never)).rejects.toMatchObject({code:'invalid'});
  await expect(api.previewPlan(uuid(1),1,[{taskId:uuid(77),
   disposition:'unplaced',reason:'No capacity',position:0}],{sources:[]}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listPlans({ownerId:'forged'} as never)).rejects.toMatchObject({code:'invalid'});
  harness.rpc.mockResolvedValueOnce({data:null,error:{code:'23505',message:'duplicate day'}} as Reply);
  await expect(api.createPlan({planDate:'2026-11-09',timeZone:'UTC'}))
   .rejects.toMatchObject({code:'conflict'});
 });
});
