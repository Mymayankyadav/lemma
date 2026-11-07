import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';
import {getDayPlanApi,setDayPlanApiForTests} from '../../../src/data/day-plans';
import {setTaskApiForTests} from '../../../src/data/tasks';
import {setStudyApiForTests} from '../../../src/data/study';
import type {DayPlanApi,NewDayPlan} from '../../../src/data/day-plans/contract';
import type {TaskApi} from '../../../src/data/tasks/contract';
import type {StudyApi} from '../../../src/data/study/contract';
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));

const TASK='11111111-1111-4111-8111-111111111111';
const BLOCK='22222222-2222-4222-8222-222222222222';
const at='2026-11-07T10:00:00Z';
const base:NewDayPlan={planDate:'2026-11-07',timeZone:'Asia/Kolkata',
 intention:'Read proof carefully',capacityMinutes:80};
const sources={sources:[{resource:'tasks' as const,id:TASK,version:1},
 {resource:'calendar_blocks' as const,id:BLOCK,version:1}]};
const placements=[
 {taskId:TASK,blockId:BLOCK,disposition:'placed' as const,position:0},
 {taskId:TASK,disposition:'unplaced' as const,reason:'no_capacity',position:1},
 {taskId:TASK,disposition:'carried_over' as const,reason:'Move to tomorrow',position:2},
];
let taskVersion=1,blockVersion=1;
beforeEach(()=>{
 sessionStorage.clear();taskVersion=1;blockVersion=1;
 setDayPlanApiForTests(null);
 setTaskApiForTests({mode:'demo',getTask:vi.fn(async(id)=>
  id===TASK?{id,version:taskVersion}:null)} as unknown as TaskApi);
 setStudyApiForTests({mode:'demo',listCalendarBlocks:vi.fn(async()=>[
  {id:BLOCK,version:blockVersion}])} as unknown as StudyApi);
 vi.useFakeTimers();vi.setSystemTime(new Date(at));
});
afterEach(()=>{setDayPlanApiForTests(null);setTaskApiForTests(null);
 setStudyApiForTests(null);sessionStorage.clear();vi.useRealTimers();});

describe('N60.2 isolated demo day plan persistence and lifecycle',()=>{
 it('rejects duplicate owner civil dates and preserves independent days and closure',async()=>{
  const api=createDemoDayPlanApi();
  const first=(await api.createPlan(base)).record;
  const tomorrow=(await api.createPlan({...base,planDate:'2026-11-08'})).record;
  await expect(api.createPlan(base)).rejects.toMatchObject({code:'conflict'});
  await api.previewPlan(first.id,1,[],{sources:[]});
  await api.commitPlan(first.id,2);
  const closed=await api.closePlan(first.id,3,{reflection:'One theorem learned'});
  expect(closed.record.status).toBe('closed');
  expect(closed.record.closedAt).toBe(at.replace('Z','.000Z'));
  expect(closed.record.ritual).toEqual({reflection:'One theorem learned'});
  const fresh=createDemoDayPlanApi();
  expect((await fresh.getPlan(first.id))?.status).toBe('closed');
  expect((await fresh.getPlan(tomorrow.id))?.status).toBe('draft');
  expect((await fresh.getPlan(tomorrow.id))?.closedAt).toBeNull();
  const reopened=await fresh.reopenPlan(first.id,4);
  expect(reopened.record).toMatchObject({status:'committed',closedAt:null});
  expect((await api.getPlan(tomorrow.id))?.version).toBe(1);
  await expect(fresh.closePlan(tomorrow.id,1)).rejects.toMatchObject({code:'conflict'});
 });
 it('preserves work dispositions and refuses stale task or block sources on commit',async()=>{
  const api=createDemoDayPlanApi();
  const plan=(await api.createPlan(base)).record;
  const preview=await api.previewPlan(plan.id,1,placements,sources);
  expect(preview.record.status).toBe('previewed');
  const page=await api.listItems(plan.id);
  expect(page.items.map(x=>x.disposition)).toEqual(['placed','unplaced','carried_over']);
  expect(page.items[1]).toMatchObject({reason:'no_capacity',blockId:null});
  expect((await createDemoDayPlanApi().listItems(plan.id)).items).toEqual(page.items);
  taskVersion=2;
  await expect(api.commitPlan(plan.id,2)).rejects.toMatchObject({code:'conflict'});
  expect((await api.getPlan(plan.id))?.status).toBe('previewed');
  taskVersion=1;blockVersion=2;
  await expect(api.commitPlan(plan.id,2)).rejects.toMatchObject({code:'conflict'});
  blockVersion=1;
  const done=await api.commitPlan(plan.id,2);
  expect(done.record).toMatchObject({status:'committed',version:3});
  expect((await api.listItems(plan.id)).total).toBe(3);
 });
 it('refuses unknown source rows, stale updates and invalid previews without dropping work',async()=>{
  const api=createDemoDayPlanApi(),p=(await api.createPlan(base)).record;
  await expect(api.previewPlan(p.id,1,placements,{sources:[]}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.previewPlan(p.id,1,placements,{sources:[
   {...sources.sources[0],version:2},sources.sources[1]]}))
   .rejects.toMatchObject({code:'conflict'});
  expect((await api.listItems(p.id)).total).toBe(0);
  const updated=await api.updatePlan(p.id,1,{intention:'Try counterexample'});
  expect(updated.record).toMatchObject({version:2,intention:'Try counterexample',status:'draft'});
  await expect(api.updatePlan(p.id,1,{intention:'overwrite'}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.updatePlan(p.id,2,{ownerId:'forged'} as never))
   .rejects.toMatchObject({code:'invalid'});
  expect((await api.getPlan(p.id))?.intention).toBe('Try counterexample');
 });
 it('has exact totals and filter-bound opaque 1–50 keyset pages on both collections',async()=>{
  const api=createDemoDayPlanApi();
  for(let i=1;i<=55;i++){
   const d=new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10);
   await api.createPlan({...base,planDate:d});
  }
  const all:string[]=[];let cursor:string|null=null;
  for(let k=0;k<12;k++){
   const p=await api.listPlans({limit:7,cursor});
   expect(p.total).toBe(55);all.push(...p.items.map(r=>r.id));
   cursor=p.nextCursor;if(!cursor)break;
  }
  expect(all).toHaveLength(55);expect(new Set(all).size).toBe(55);
  const first=await api.listPlans({limit:1});
  await expect(api.listPlans({from:'2026-11-10',cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listPlans({cursor:'bad'})).rejects.toMatchObject({code:'invalid'});
  const p=await api.getPlan(all[0]);expect(p).not.toBeNull();
  await api.previewPlan(p!.id,1,placements,sources);
  const one=await api.listItems(p!.id,{limit:1});
  expect(one.total).toBe(3);expect(one.nextCursor).not.toBeNull();
  const next=await api.listItems(p!.id,{limit:1,cursor:one.nextCursor});
  expect(next.items[0].id).not.toBe(one.items[0].id);
  await expect(api.listItems(all[1],{cursor:one.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('uses facade mode injection and never leaks receipt mutation into storage',async()=>{
  const api=createDemoDayPlanApi(),plan=await api.createPlan(base);
  setDayPlanApiForTests(api as DayPlanApi);
  expect(getDayPlanApi()).toBe(api);
  plan.record.intention='client mutated';
  expect((await api.getPlan(plan.record.id))?.intention).toBe(base.intention);
 });
});
