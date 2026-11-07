import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveDayPlanApi} from '../../../src/data/day-plans/live';

const ID='11111111-1111-4111-8111-111111111111';
const ROW={
 id:ID,user_id:'owner-is-server-derived',
 plan_date:'2020-11-07',time_zone:'Asia/Kolkata',intention:'Review the proof',
 capacity_minutes:90,availability:{sources:[]},status:'draft',
 closed_at:null,tomorrow_first_task_id:null,ritual:{},version:1,
 created_at:'2026-11-07T09:00:00Z',updated_at:'2026-11-07T09:00:00Z',
};
type Reply={data:unknown;error:{code?:string;message?:string}|null};
let persisted:Record<string,unknown>|null={...ROW};
let rpc=vi.fn(async (_name:string,_args:unknown):Promise<Reply>=>({
 data:{status:'ok',actionNo:14,
  changed:[{resource:'day_plans',id:ID,version:1}],plan:{...ROW}},error:null,
}));
let reads=0;
function query(){
 const chain={
  select:(_columns:string)=>chain,
  eq:(_column:string,_value:unknown)=>chain,
  maybeSingle:async()=>{reads++;return {data:persisted,error:null}},
 };
 return chain;
}
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({from:()=>query(),rpc:(...args:[string,unknown])=>rpc(...args)}),
}));
beforeEach(()=>{
 reads=0;persisted={...ROW};
 rpc=vi.fn(async (_name:string,_args:unknown):Promise<Reply>=>({
  data:{status:'ok',actionNo:14,
   changed:[{resource:'day_plans',id:ID,version:1}],plan:{...ROW}},error:null,
 }));
});
describe('N60.2 journalled owner-bound live day plan mutations',()=>{
 it('creates via one owner-free N46.2 RPC and verifies authoritative row and receipt',async()=>{
  const api=createLiveDayPlanApi();
  const result=await api.createPlan({planDate:'2020-11-07',timeZone:'Asia/Kolkata',
   intention:'Review the proof',capacityMinutes:90});
  expect(result).toMatchObject({actionNo:14,record:{id:ID,status:'draft',version:1}});
  expect(reads).toBe(1);
  const [resource,args]=rpc.mock.calls[0] as [string,{p:Record<string,unknown>}];
  expect(resource).toBe('day_plans_command');
  expect(args.p).toMatchObject({resource:'day_plans',schemaVersion:1,
   operation:'create',patch:{plan_date:'2020-11-07',time_zone:'Asia/Kolkata',
    capacity_minutes:90}});
  expect(args.p.operationId).toMatch(/^[0-9a-f]{8}-/i);
  expect(JSON.stringify(args.p)).not.toMatch(/ownerId|user_id|userId/);
  expect(args.p).not.toHaveProperty('expectedVersion');
 });
 it('retries an uncertain network outcome with the exact same operation ID',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST000',message:'Network timeout'}});
  const result=await createLiveDayPlanApi().createPlan({
   planDate:'2020-11-07',timeZone:'Asia/Kolkata'});
  expect(result.actionNo).toBe(14);
  expect(rpc).toHaveBeenCalledTimes(2);
  const a=(rpc.mock.calls[0][1] as {p:Record<string,unknown>}).p;
  const b=(rpc.mock.calls[1][1] as {p:Record<string,unknown>}).p;
  expect(a).toEqual(b);
  expect(a.operationId).toBe(b.operationId);
 });
 it('fails closed on conflicting versions and malformed or unjournalled receipts',async()=>{
  rpc.mockResolvedValueOnce({data:{
   status:'conflict',conflict:{currentVersion:5},changed:[],actionNo:null},error:null});
  await expect(createLiveDayPlanApi().commitPlan(ID,4))
   .rejects.toMatchObject({code:'conflict'});
  rpc.mockResolvedValue({data:{status:'ok',actionNo:null,
   changed:[{resource:'day_plans',id:ID,version:1}]},error:null});
  await expect(createLiveDayPlanApi().createPlan({
   planDate:'2020-11-07',timeZone:'Asia/Kolkata'}))
   .rejects.toThrow(/unaudited/i);
 });
 it('validates an explicit closure ritual without sending read-only metadata',async()=>{
  persisted={...ROW,status:'closed',closed_at:'2026-11-07T15:00:00Z',
   ritual:{reviewed:true},version:3};
  rpc.mockResolvedValue({data:{status:'ok',actionNo:16,
   changed:[{resource:'day_plans',id:ID,version:3}],
   plan:persisted},error:null});
  const api=createLiveDayPlanApi();
  const closed=await api.closePlan(ID,2,{reviewed:true});
  expect(closed).toMatchObject({actionNo:16,record:{status:'closed',
   ritual:{reviewed:true},version:3}});
  const args=rpc.mock.calls[0][1] as {p:Record<string,unknown>};
  expect(args.p).toMatchObject({resource:'day_plans',operation:'close',
   target:{id:ID},expectedVersion:2,patch:{ritual:{reviewed:true}}});
  expect(JSON.stringify(args.p)).not.toMatch(/user_id|ownerId|createdAt|updatedAt/);
 });
 it('refuses future-day closure and foreign or missing owner reads before writing',async()=>{
  persisted={...ROW,plan_date:'2099-11-07',status:'committed',version:2};
  const api=createLiveDayPlanApi();
  await expect(api.closePlan(ID,2)).rejects.toMatchObject({code:'invalid'});
  expect(rpc).not.toHaveBeenCalled();
  persisted=null;
  await expect(api.updatePlan(ID,1,{intention:'No owner row'}))
   .rejects.toMatchObject({code:'not_found'});
  expect(rpc).not.toHaveBeenCalled();
 });
});
