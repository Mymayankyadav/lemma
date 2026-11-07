import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveDayPlanApi} from '../../../src/data/day-plans/live';
import {getDayPlanApi,setDayPlanApiForTests} from '../../../src/data/day-plans';

const ID='11111111-1111-4111-8111-111111111111';
const row={id:ID,plan_date:'2026-01-01',time_zone:'UTC',intention:'Work',
 capacity_minutes:90,availability:{sources:[]},status:'draft',
 closed_at:null,tomorrow_first_task_id:null,ritual:{},
 version:1,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
const writes:Record<string,unknown>[]=[];
let failNext=false;
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({
  rpc:vi.fn(async(_name:string,params:{p:Record<string,unknown>})=>{
   writes.push(params.p);
   if(failNext){failNext=false;return {data:null,error:{code:'08006',message:'network unknown'}};}
   return {data:{status:'ok',actionNo:20,changed:[{id:ID,version:1}]},error:null};
  }),
  from:()=>({
   select:()=>({
    eq:()=>({maybeSingle:async()=>({data:row,error:null})}),
   }),
  }),
 }),
}));
beforeEach(()=>{writes.length=0;failNext=false;setDayPlanApiForTests(null)});
describe('N60.2 owner-RLS day-plan live command envelope',()=>{
 it('uses one command RPC with owner-free input and authoritative readback',async()=>{
  const api=createLiveDayPlanApi();
  const result=await api.createPlan({planDate:'2026-01-01',timeZone:'UTC',intention:'Work',
   capacityMinutes:90});
  expect(result.record.id).toBe(ID);
  expect(result.actionNo).toBe(20);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({schemaVersion:1,resource:'day_plans',operation:'create',
   patch:{plan_date:'2026-01-01',time_zone:'UTC',intention:'Work'}});
  expect(JSON.stringify(writes)).not.toMatch(/user_id|userId|owner_id|ownerId/);
 });
 it('reuses exactly the same operationId and payload on unknown server outcome',async()=>{
  const api=createLiveDayPlanApi();
  const input={planDate:'2026-01-02',timeZone:'UTC'};
  failNext=true;
  await expect(api.createPlan(input)).rejects.toThrow();
  await api.createPlan(input);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
 });
 it('previews snapshot and placements through one atomic registered command',async()=>{
  const api=createLiveDayPlanApi();
  const availability={sources:[{resource:'tasks' as const,id:ID,version:1}]};
  await api.previewPlan(ID,1,[{taskId:ID,position:0,disposition:'unplaced',reason:'No capacity'}],availability);
  expect(writes[0]).toMatchObject({operation:'preview',target:{id:ID},expectedVersion:1,
   patch:{availability,items:[{task_id:ID,disposition:'unplaced',reason:'No capacity'}]}});
 });
 it('exposes the correct demo/live facade injection without faking API writes',async()=>{
  const api=createLiveDayPlanApi();
  setDayPlanApiForTests(api);
  expect(getDayPlanApi()).toBe(api);
 });
});
