import {describe,expect,it,vi,beforeEach} from 'vitest';
import {normalizeDayCloseTransition} from '../../../src/data/day-plans/model';
import {createLiveDayPlanApi} from '../../../src/data/day-plans/live';
const ID='11111111-1111-4111-8111-111111111111';
const TASK='22222222-2222-4222-8222-222222222222';
const ROW={id:ID,plan_date:'2020-11-07',time_zone:'UTC',intention:'',
 capacity_minutes:30,availability:{sources:[]},status:'committed',
 closed_at:null,tomorrow_first_task_id:null,ritual:{},version:2,
 created_at:'2020-11-07T00:00:00Z',updated_at:'2020-11-07T00:00:00Z'};
let rpc=vi.fn();
let stored:Record<string,unknown>={...ROW};
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({rpc:(...args:[string,unknown])=>rpc(...args),
  from:()=>{const chain={select:()=>chain,eq:()=>chain,
   maybeSingle:async()=>({data:stored,error:null})};return chain;}})
}));
beforeEach(()=>{
 stored={...ROW,status:'closed',closed_at:'2020-11-07T15:00:00Z',
  tomorrow_first_task_id:TASK,version:3};
 rpc=vi.fn(async()=>({data:{status:'ok',actionNo:21,changed:[
  {resource:'day_plans',id:ID,version:3},
  {resource:'day_plan_items',id:TASK,version:2}],
  plan:stored},error:null}));
});
describe('N108 canonical day-close transition',()=>{
 it('normalizes task IDs with explicit reasons and rejects duplicates/forged fields',()=>{
  expect(normalizeDayCloseTransition({tomorrowFirstTaskId:TASK,
   carryOver:[TASK,{taskId:ID,reason:'Finish this tomorrow'}]})).toEqual({
    tomorrowFirstTaskId:TASK,carryOver:[
     {taskId:TASK,reason:'Carried over to tomorrow'},
     {taskId:ID,reason:'Finish this tomorrow'}]});
  for(const invalid of [
   {carryOver:[TASK,TASK]}, {carryOver:[{taskId:TASK,reason:'  '}]},
   {carryOver:[{taskId:TASK,reason:'ok',owner_id:'other'}]},
   {ownerId:'foreign'},{carryOver:'not-array'}
  ])expect(()=>normalizeDayCloseTransition(invalid as never)).toThrow();
 });
 it('forwards the canonical fields in a single version-checked owner-free close RPC',async()=>{
  const result=await createLiveDayPlanApi().closePlan(ID,2,{reviewed:true},
   {tomorrowFirstTaskId:TASK,carryOver:[{taskId:TASK,reason:'Next session'}]});
  expect(result).toMatchObject({actionNo:21,record:{status:'closed',
   tomorrowFirstTaskId:TASK}});
  expect(rpc).toHaveBeenCalledTimes(1);
  const [name,args]=rpc.mock.calls[0] as [string,{p:Record<string,unknown>}];
  expect(name).toBe('day_plans_command');
  expect(args.p).toMatchObject({resource:'day_plans',operation:'close',
   expectedVersion:2,target:{id:ID},patch:{
    ritual:{reviewed:true},tomorrow_first_task_id:TASK,
    carry_over:[{task_id:TASK,reason:'Next session'}]}});
  expect(JSON.stringify(args.p)).not.toMatch(/user_id|ownerId/);
 });
});
