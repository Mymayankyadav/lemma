import {beforeEach,describe,expect,it} from 'vitest';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';
import {DayPlanError} from '../../../src/data/day-plans/contract';

const make=(date:string)=>({planDate:date,timeZone:'Asia/Kolkata',
 intention:'Prove a theorem',capacityMinutes:90});
beforeEach(()=>sessionStorage.clear());

describe('N60.2 persistent day plans',()=>{
 it('enforces one owner-date plan and reloads the same record',async()=>{
  const api=createDemoDayPlanApi();
  const saved=(await api.createPlan(make('2026-11-07'))).record;
  expect(saved.status).toBe('draft');
  await expect(api.createPlan(make('2026-11-07'))).rejects.toMatchObject({
   code:'conflict'} satisfies Partial<DayPlanError>);
  const fromReload=await createDemoDayPlanApi().getPlan(saved.id);
  expect(fromReload).toEqual(saved);
 });
 it('keeps dated preview dispositions and closure independent',async()=>{
  const api=createDemoDayPlanApi();
  const day=(await api.createPlan(make('2026-11-07'))).record;
  const next=(await api.createPlan(make('2026-11-08'))).record;
  const preview=(await api.previewPlan(day.id,day.version,[
   {taskId:'task-a',blockId:'block-a',disposition:'placed',position:0},
   {taskId:'task-b',disposition:'unplaced',reason:'No capacity',position:1},
   {taskId:'task-c',disposition:'carried_over',reason:'Tomorrow',position:2},
  ],{sources:[]})).record;
  const items=(await api.listItems(day.id)).items;
  expect(items.map(x=>x.disposition)).toEqual([
   'placed','unplaced','carried_over']);
  expect(items.map(x=>x.reason)).toEqual([null,'No capacity','Tomorrow']);
  const committed=(await api.commitPlan(day.id,preview.version)).record;
  const closed=(await api.closePlan(day.id,committed.version,{reviewed:true})).record;
  expect(closed.status).toBe('closed');
  expect(closed.closedAt).not.toBeNull();
  expect((await api.getPlan(next.id))?.status).toBe('draft');
  const reopened=(await api.reopenPlan(day.id,closed.version)).record;
  expect(reopened).toMatchObject({status:'committed',closedAt:null});
  expect((await createDemoDayPlanApi().listItems(day.id)).total).toBe(3);
 });
 it('rejects stale version and source drift, and pages with exact totals',async()=>{
  const api=createDemoDayPlanApi();
  const saved=(await api.createPlan(make('2026-11-07'))).record;
  const changed=(await api.updatePlan(saved.id,saved.version,{intention:'New goal'})).record;
  await expect(api.updatePlan(saved.id,saved.version,{intention:'Lost'}))
   .rejects.toMatchObject({code:'conflict'});
  const preview=(await api.previewPlan(changed.id,changed.version,[],
   {sources:[{resource:'tasks',id:'task-1',version:1}]})).record;
  await expect(api.commitPlan(changed.id,preview.version))
   .rejects.toMatchObject({code:'conflict'});
  await api.createPlan(make('2026-11-08'));
  await api.createPlan(make('2026-11-09'));
  const first=await api.listPlans({from:'2026-11-07',limit:2});
  expect(first.total).toBe(3);
  expect(first.items).toHaveLength(2);
  expect(first.nextCursor).not.toBeNull();
  const second=await api.listPlans({from:'2026-11-07',limit:2,cursor:first.nextCursor});
  expect(second.items).toHaveLength(1);
  await expect(api.listPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
 });
});
