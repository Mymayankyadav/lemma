import {describe,expect,it,vi} from 'vitest';
import {createDemoDayPlanApi} from '../../../src/data/day-plans/demo';
import type {DayPlanApi} from '../../../src/data/day-plans';
import {blockTomorrow,closeDayRecord} from '../../../src/features/ritual/v7/closeModel';
import {groupTodo,reorderedTasks} from '../../../src/features/tasks/v7/tasksModel';
import type {TaskRecord} from '../../../src/data/tasks/contract';

const task=(id:string,position:number,date:string):TaskRecord=>({id,title:id,position,status:'backlog',due:{kind:'date',date},version:1,body:'',priority:'normal',estimateMinutes:null,completedAt:null,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'});

describe('PA11: the P3 Done-when checks',()=>{
 it('keeps overdue first and respects persistent manual positions inside each group',()=>{
  const rows=[task('b',2048,'2026-11-01'),task('a',1024,'2026-11-08'),task('c',0,'2026-11-20')];
  const groups=groupTodo(rows,new Date('2026-11-09T12:00Z'),'UTC');
  expect(groups.map(group=>group.key)).toEqual(['overdue','later']);
  expect(groups[0].items.map(row=>row.id)).toEqual(['a','b']);
  expect(reorderedTasks(groups[0].items,'a','b').map(row=>row.id)).toEqual(['b','a']);
  expect(reorderedTasks(groups[0].items,'missing','b')).toEqual(groups[0].items);
 });
 it('closes an unplanned day durably and restores its aim after recreating the adapter',async()=>{
  sessionStorage.clear();
  const date='2026-11-08',api=createDemoDayPlanApi(async snapshot=>snapshot);
  const closed=await closeDayRecord(api,{plan:null,date,zone:'UTC',aim:'Prove compactness',first:'',taskIds:[]});
  expect(closed.status).toBe('closed');
  const reloaded=createDemoDayPlanApi(async snapshot=>snapshot);
  const saved=await reloaded.getPlan(closed.id);
  expect(saved?.ritual.tomorrowAim).toBe('Prove compactness');
  expect(saved?.closedAt).toBeTruthy();
  expect((await reloaded.listItems(closed.id)).items).toEqual([]);
 });
 it('resumes a ritual-only draft after a failed preview without creating a second plan',async()=>{
  sessionStorage.clear();
  const api=createDemoDayPlanApi(async snapshot=>snapshot),preview=vi.spyOn(api,'previewPlan');
  preview.mockRejectedValueOnce(Error('Network unavailable'));
  const input={plan:null,date:'2026-11-07',zone:'UTC',aim:'Limits',first:'',taskIds:[]};
  await expect(closeDayRecord(api,input)).rejects.toThrow('Network unavailable');
  const page=await api.listPlans({from:input.date,through:input.date});
  expect(page.items).toHaveLength(1);
  const closed=await closeDayRecord(api,{...input,plan:page.items[0]});
  expect(closed.status).toBe('closed');
  expect((await api.listPlans({from:input.date,through:input.date})).total).toBe(1);
 });
 it('refuses a future close before issuing any write',async()=>{
  const createPlan=vi.fn();
  await expect(closeDayRecord({createPlan} as unknown as DayPlanApi,{plan:null,date:'2099-11-09',zone:'UTC',aim:'',first:'',taskIds:[]})).rejects.toThrow('once it has started');
  expect(createPlan).not.toHaveBeenCalled();
 });
 it('preserves local block times across the autumn and spring DST changes',()=>{
  expect(blockTomorrow({startsAt:'2026-10-31T13:00:00Z',endsAt:'2026-10-31T14:00:00Z'},'America/New_York')).toEqual({startsAt:'2026-11-01T14:00:00.000Z',endsAt:'2026-11-01T15:00:00.000Z'});
  expect(blockTomorrow({startsAt:'2026-03-07T14:00:00Z',endsAt:'2026-03-07T15:00:00Z'},'America/New_York')).toEqual({startsAt:'2026-03-08T13:00:00.000Z',endsAt:'2026-03-08T14:00:00.000Z'});
 });
});
