import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DayPlanError} from '../../../src/data/day-plans/contract';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';
import {createLiveDayPlanApi} from '../../../src/data/day-plans/live';
import {createDemoStudyApi} from '../../../src/data/study/demo';
import {normalizeCommitPlacements,type CommitPlacementsInput}
 from '../../../src/data/day-plans/placements';

const source={resource:'tasks' as const,id:'task-1',version:7};
const placement={taskId:'task-1',title:'Read theorem',startsAt:'2028-01-01T08:00:00Z',
 endsAt:'2028-01-01T08:30:00Z',position:0};
const request=():CommitPlacementsInput=>({days:[{
 planDate:'2028-01-01',timeZone:'UTC',
 sources:[{...source},{resource:'calendar_blocks',id:'busy-1',version:3},
  {resource:'study_entries',id:'saved-1',version:2}],
 placements:[{...placement}],unplaced:[],
}]});
const bad=(change:(input:CommitPlacementsInput)=>void,pattern:RegExp)=>{
 const input=request();change(input);
 expect(()=>normalizeCommitPlacements(input)).toThrowError(pattern);
};
describe('N107 atomic placement request validation',()=>{
 it('preserves every owner source version and produces an immutable serializable envelope',()=>{
  const input=request(),copy=structuredClone(input);
  const result=normalizeCommitPlacements(input);
  expect(result.days[0].sources).toEqual(copy.days[0].sources);
  expect(result.days[0].placements[0].startsAt).toBe('2028-01-01T08:00:00.000Z');
  expect(input).toEqual(copy);
  expect(result).not.toBe(input);
 });
 it('accepts two distinct owner days and exact preview plan versions',()=>{
  const input=request();
  input.days.push({...structuredClone(input.days[0]),planDate:'2028-01-02',
   planId:'draft-2',expectedVersion:4,
   placements:[{...placement,startsAt:'2028-01-02T08:00:00Z',
    endsAt:'2028-01-02T08:30:00Z'}]});
  expect(normalizeCommitPlacements(input).days[1].expectedVersion).toBe(4);
 });
 it('refuses a placement without its captured task version',()=>{
  bad(i=>{i.days[0].sources=[]},/missing its preview version/);
 });
 it('refuses duplicate days, duplicate snapshots and duplicate positions',()=>{
  bad(i=>{i.days.push(structuredClone(i.days[0]))},/Duplicate atomic placement day/);
  bad(i=>{i.days[0].sources.push(source)},/Duplicate placement source version/);
  bad(i=>{i.days[0].unplaced=[{taskId:'task-1',position:0,reason:'No room'}]},
   /Duplicate plan item position/);
 });
 it('refuses invalid periods, overlaps, timezone misalignment and partial plan CAS',()=>{
  bad(i=>{i.days[0].placements[0].endsAt='2028-01-01T07:30:00Z'},
   /Invalid planned block interval/);
  bad(i=>{i.days[0].placements.push({...placement,position:1})},
   /New placements overlap/);
  bad(i=>{i.days[0].planDate='2028-01-02'},
   /outside its owner plan date/);
  bad(i=>{i.days[0].planId='draft-1'},/both ID and version/);
 });
 it('rejects unknown fields and synthetic client snapshots',()=>{
  bad(i=>{(i.days[0] as unknown as Record<string,unknown>).owner_id='forged'},
   /Unknown placement field/);
  bad(i=>{i.days[0].sources[0].version=0},/positive int4/);
  bad(i=>{i.days[0].unplaced=[{taskId:'task-1',position:1,reason:' '}]},
   /requires a reason/);
 });
 it('uses a typed owner validation error instead of silently dropping bad selections',()=>{
  try{normalizeCommitPlacements({days:[]});throw Error('No validation error')}
  catch(e){expect(e).toBeInstanceOf(DayPlanError);}
 });
});


const OWNER='11111111-1111-4111-8111-111111111111';
const BLOCK='22222222-2222-4222-8222-222222222222';
const ITEM='33333333-3333-4333-8333-333333333333';
const ROW={
 id:OWNER,user_id:'owner-set-by-server',plan_date:'2028-01-01',
 time_zone:'UTC',intention:'',capacity_minutes:0,availability:{sources:[
  {resource:'tasks',id:OWNER,version:4},
  {resource:'study_entries',id:ITEM,version:2}]},status:'committed',
 closed_at:null,tomorrow_first_task_id:null,ritual:{},version:1,
 created_at:'2028-01-01T00:00:00Z',updated_at:'2028-01-01T00:00:00Z'
};
type Reply={data:unknown;error:{code?:string;message?:string}|null};
let rpc=vi.fn(async (_name:string,_args:unknown):Promise<Reply>=>({data:null,error:null}));
let ownerRow:Record<string,unknown>|null={...ROW};
function fromOwner(){
 const chain={select:()=>chain,eq:()=>chain,
  maybeSingle:async()=>({data:ownerRow,error:null})};
 return chain;
}
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({from:()=>fromOwner(),rpc:(name:string,args:unknown)=>rpc(name,args),
  auth:{getUser:async()=>({data:{user:{id:OWNER}},error:null})}})
}));
beforeEach(()=>{
 sessionStorage.clear();
 ownerRow=structuredClone(ROW);
 rpc=vi.fn(async (_name:string,_args:unknown):Promise<Reply>=>({data:null,error:null}));
});
describe('N107 one-action placement adapters',()=>{
 it('live sends one owner-free atomic envelope and verifies every receipt change',async()=>{
  const result={
   status:'ok',actionNo:31,changed:[
    {resource:'day_plans',id:OWNER,version:1},
    {resource:'calendar_blocks',id:BLOCK,version:1},
    {resource:'day_plan_items',id:ITEM,version:1}
   ],plans:[structuredClone(ROW)],blockIds:[BLOCK]
  };
  rpc.mockResolvedValue({data:result,error:null});
  const input:CommitPlacementsInput={days:[{
   planDate:'2028-01-01',timeZone:'UTC',
   sources:[{resource:'tasks',id:OWNER,version:4},
    {resource:'study_entries',id:ITEM,version:2}],
   placements:[{taskId:OWNER,title:'Read proof',position:0,
    startsAt:'2028-01-01T08:00:00Z',endsAt:'2028-01-01T09:00:00Z'}]
  }]};
  const receipt=await createLiveDayPlanApi().commitPlacements(input);
  expect(receipt).toMatchObject({actionNo:31,record:{
   blockIds:[BLOCK],plans:[{id:OWNER,status:'committed',version:1}]}});
  const args=rpc.mock.calls[0][1] as {p:Record<string,unknown>};
  expect(args.p).toMatchObject({schemaVersion:1,resource:'day_plans',
   operation:'commit_placements',patch:{days:[{
    plan_date:'2028-01-01',time_zone:'UTC',
    sources:[{resource:'tasks',id:OWNER,version:4},
     {resource:'study_entries',id:ITEM,version:2}],
    placements:[{task_id:OWNER,title:'Read proof',position:0}]
   }]}});
  expect(JSON.stringify(args.p)).not.toMatch(/user_id|ownerId|userId/);
  expect(args.p.operationId).toMatch(/^[0-9a-f]{8}-/);
 });
 it('live retries an uncertain result with the same operationId, refuses partial writes',async()=>{
  const input:CommitPlacementsInput={days:[{
   planDate:'2028-01-01',timeZone:'UTC',sources:[],placements:[]}]};
  rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST000',message:'Network timeout'}});
  rpc.mockResolvedValueOnce({data:{status:'conflict',changed:[],actionNo:null,
   conflict:{reason:'Stale owner task'}},error:null});
  await expect(createLiveDayPlanApi().commitPlacements(input))
   .rejects.toMatchObject({code:'conflict'});
  const a=(rpc.mock.calls[0][1] as {p:Record<string,unknown>}).p;
  const b=(rpc.mock.calls[1][1] as {p:Record<string,unknown>}).p;
  expect(a).toEqual(b);
  rpc.mockResolvedValue({data:{status:'ok',actionNo:8,changed:[],plans:[],blockIds:[]},
   error:null});
  await expect(createLiveDayPlanApi().commitPlacements(input))
   .rejects.toThrow(/unaudited/i);
 });
 it('demo atomically publishes two plans and linked study blocks, replays after reload',async()=>{
  const api=createDemoDayPlanApi(async expected=>structuredClone(expected));
  const input=request();
  input.operationId='77777777-7777-4777-8777-777777777777';
  input.days[0].sources=[{...source}];
  input.days.push({...structuredClone(input.days[0]),planDate:'2028-01-02',
   placements:[{...placement,startsAt:'2028-01-02T08:00:00Z',
    endsAt:'2028-01-02T08:30:00Z'}]});
  const result=await api.commitPlacements(input);
  expect(result.record.plans).toHaveLength(2);
  expect(result.record.plans.map(x=>x.status)).toEqual(['committed','committed']);
  expect(result.record.blockIds).toHaveLength(2);
  expect((await createDemoDayPlanApi().listPlans()).total).toBe(2);
  expect((await api.listItems(result.record.plans[0].id)).items[0].blockId)
   .toBe(result.record.blockIds[0]);
  const study=createDemoStudyApi();
  expect((await study.listCalendarBlocks({start:'2028-01-01T00:00:00Z',
   end:'2028-01-03T00:00:00Z'})).map(b=>b.taskId))
   .toEqual(['task-1','task-1']);
  expect(await createDemoDayPlanApi().commitPlacements(input)).toEqual(result);
  const altered=structuredClone(input);
  altered.days[0].placements[0].title='Tampered retry';
  await expect(api.commitPlacements(altered)).rejects.toMatchObject({code:'conflict'});
 });
 it('demo checks all source versions before any plan or calendar mutation',async()=>{
  const api=createDemoDayPlanApi(async expected=>({sources:expected.sources.map(
   s=>({...s,version:s.version+1}))}));
  await expect(api.commitPlacements(request())).rejects.toMatchObject({code:'conflict'});
  expect((await api.listPlans()).total).toBe(0);
  expect(await createDemoStudyApi().listCalendarBlocks({
   start:'2028-01-01T00:00:00Z',end:'2028-01-02T00:00:00Z'})).toEqual([]);
 });
});

describe('N107 single Undo for an atomic placement action',()=>{
 it('live undoes the whole action through undo_action for the signed-in owner, without force',async()=>{
  await createLiveDayPlanApi().undoPlacements(41);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('undo_action',{p_user:OWNER,p_no:41});
 });
 it('live reports a newer owner write as a typed conflict and never retries with force',async()=>{
  rpc=vi.fn(async()=>({data:null,error:{message:'Undo A42 first'}}));
  await expect(createLiveDayPlanApi().undoPlacements(41)).rejects.toMatchObject({code:'conflict'});
  expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('refuses an invalid action number before any request, and demo has no journal to undo',async()=>{
  await expect(createLiveDayPlanApi().undoPlacements(0)).rejects.toBeInstanceOf(DayPlanError);
  expect(rpc).not.toHaveBeenCalled();
  await expect(createDemoDayPlanApi().undoPlacements(1)).rejects.toMatchObject({code:'conflict'});
 });
});
