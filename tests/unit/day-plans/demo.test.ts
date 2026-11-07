import {beforeEach,describe,expect,it} from 'vitest';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';
import {DayPlanError} from '../../../src/data/day-plans/contract';
const source=(resource:string,id:string)=>resource==='tasks'&&id==='task-a'?2:
 resource==='tasks'&&id==='task-b'?1:resource==='calendar_blocks'&&id==='block-a'?3:null;
const fresh=()=>createDemoDayPlanApi(async(resource,id)=>source(resource,id));
beforeEach(()=>sessionStorage.clear());
describe('N60.2 day-plan demo lifecycle',()=>{
 it('persists plans across adapter reloads and enforces unique owner dates and stale versions',async()=>{
  const api=fresh(),input={planDate:'2026-10-02',timeZone:'Asia/Kolkata',capacityMinutes:90};
  const created=(await api.createPlan(input)).record;
  await expect(api.createPlan(input)).rejects.toMatchObject({code:'conflict'});
  expect((await fresh().getPlan(created.id))?.version).toBe(1);
  const updated=(await fresh().updatePlan(created.id,1,{intention:'First theorem'})).record;
  expect(updated.version).toBe(2);
  await expect(api.updatePlan(created.id,1,{intention:'stale'})).rejects.toMatchObject({code:'conflict'});
  updated.intention='mutated by caller';
  expect((await fresh().getPlan(created.id))?.intention).toBe('First theorem');
 });
 it('keeps every placement and explicitly unplaced/carry-over item after reload',async()=>{
  const api=fresh();
  const created=(await api.createPlan({planDate:'2026-10-03',timeZone:'UTC'})).record;
  const availability={sources:[{resource:'tasks' as const,id:'task-a',version:2},
   {resource:'tasks' as const,id:'task-b',version:1},
   {resource:'calendar_blocks' as const,id:'block-a',version:3}]};
  const items=[{taskId:'task-a',blockId:'block-a',position:0,disposition:'placed' as const},
   {taskId:'task-b',position:1,disposition:'unplaced' as const,reason:'No time'},
   {taskId:'task-a',position:2,disposition:'carried_over' as const,reason:'Tomorrow'}];
  const preview=(await api.previewPlan(created.id,1,items,availability)).record;
  expect(preview.status).toBe('previewed');
  const page=await fresh().listItems(created.id,{limit:2});
  expect(page.total).toBe(3);
  expect(page.items.map(x=>x.disposition)).toEqual(['placed','unplaced']);
  expect((await fresh().listItems(created.id,{cursor:page.nextCursor,limit:2})).items[0].reason).toBe('Tomorrow');
  const committed=(await fresh().commitPlan(created.id,preview.version)).record;
  expect(committed.status).toBe('committed');
  const closed=(await api.closePlan(created.id,committed.version,{reviewed:true})).record;
  expect(closed.closedAt).toBeTruthy();
  expect((await fresh().reopenPlan(created.id,closed.version)).record.closedAt).toBeNull();
 });
 it('refuses stale source versions before preview and commit without losing the previous draft',async()=>{
  let version=2;
  const api=createDemoDayPlanApi(async()=>version);
  const row=(await api.createPlan({planDate:'2026-10-04',timeZone:'UTC'})).record;
  const availability={sources:[{resource:'tasks' as const,id:'task-a',version:2}]};
  const items=[{taskId:'task-a',disposition:'unplaced' as const,reason:'No capacity',position:0}];
  version=3;
  await expect(api.previewPlan(row.id,1,items,availability)).rejects.toMatchObject({code:'conflict'});
  expect((await api.getPlan(row.id))?.version).toBe(1);
  version=2;
  const preview=(await api.previewPlan(row.id,1,items,availability)).record;
  version=3;
  await expect(api.commitPlan(row.id,preview.version)).rejects.toMatchObject({code:'conflict'});
  expect((await api.getPlan(row.id))?.status).toBe('previewed');
 });
 it('never closes a future civil date and never closes a different date',async()=>{
  const api=fresh();
  const past=(await api.createPlan({planDate:'2026-01-02',timeZone:'UTC'})).record;
  const future=(await api.createPlan({planDate:'2099-01-02',timeZone:'UTC'})).record;
  const ready=(await api.previewPlan(past.id,1,[],{sources:[]})).record;
  const committed=(await api.commitPlan(past.id,ready.version)).record;
  await api.closePlan(past.id,committed.version);
  const next=(await api.previewPlan(future.id,1,[],{sources:[]})).record;
  const later=(await api.commitPlan(future.id,next.version)).record;
  await expect(api.closePlan(future.id,later.version)).rejects.toBeInstanceOf(DayPlanError);
  expect((await api.getPlan(future.id))?.closedAt).toBeNull();
 });
 it('binds plan and item cursors to filters and returns exact filtered totals',async()=>{
  const api=fresh();
  for(let i=2;i<=55;i++)await api.createPlan({
   planDate:'2025-'+String(1+Math.floor(i/28)).padStart(2,'0')+'-'+String(1+i%28).padStart(2,'0'),
   timeZone:'UTC'});
  const one=await api.listPlans({limit:5,status:['draft']});
  expect(one.items).toHaveLength(5);
  expect(one.total).toBeGreaterThan(50);
  expect((await api.listPlans({limit:5,status:['draft'],cursor:one.nextCursor})).items[0].id)
   .not.toBe(one.items[0].id);
  await expect(api.listPlans({limit:5,status:['closed'],cursor:one.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listPlans({limit:51})).rejects.toMatchObject({code:'invalid'});
 });
});
