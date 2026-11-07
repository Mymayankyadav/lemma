import {describe,expect,it,vi} from 'vitest';
import {ownerToday,nextPlannedBlock,readTodayPlan} from '../../../src/features/home/V6TodayPlan';
import {setDayPlanApiForTests} from '../../../src/data/day-plans';
import {setStudyApiForTests} from '../../../src/data/study';
import type {DayPlanApi,DayPlanRecord,DayPlanItem} from '../../../src/data/day-plans/contract';
import type {StudyApi,CalendarBlockRecord} from '../../../src/data/study/contract';

const plan:DayPlanRecord={id:'plan-1',planDate:'2026-11-07',timeZone:'UTC',
 intention:'Read the proof',capacityMinutes:30,availability:{sources:[]},
 status:'committed',closedAt:null,tomorrowFirstTaskId:null,ritual:{},version:1,
 createdAt:'2026-11-07T00:00:00Z',updatedAt:'2026-11-07T00:00:00Z'};
const item:DayPlanItem={id:'item-1',planId:plan.id,taskId:'task-1',
 blockId:'block-1',disposition:'placed',reason:null,position:0,version:1};
const block:CalendarBlockRecord={id:'block-1',kind:'study',title:'Study',
 startsAt:'2026-11-07T12:00:00Z',endsAt:'2026-11-07T13:00:00Z',
 status:'planned',timeZone:'UTC',version:1,subjectId:'owner-subject'};
describe('N70 owner-bound Today plan and honest empty data',()=>{
 it('uses the real owner timezone to find the civil day',()=>{
  expect(ownerToday('Pacific/Honolulu',new Date('2026-11-07T03:00:00Z'))).toBe('2026-11-06');
 });
 it('starts only upcoming placed committed study blocks, never a cancelled one',()=>{
  expect(nextPlannedBlock(plan,[item],[block],'2026-11-07T11:00:00Z')?.id).toBe('block-1');
  expect(nextPlannedBlock({...plan,status:'draft'},[item],[block],'2026-11-07T11:00:00Z')).toBeNull();
  expect(nextPlannedBlock(plan,[item],[{...block,status:'cancelled'}],'2026-11-07T11:00:00Z')).toBeNull();
  expect(nextPlannedBlock(plan,[item],[block],'2026-11-07T13:00:00Z')).toBeNull();
 });
 it('uses bounded owner pages and refuses cursor loops without inventing a plan',async()=>{
  setDayPlanApiForTests({mode:'live',listPlans:vi.fn(async()=>({items:[],total:0,nextCursor:null}))} as unknown as DayPlanApi);
  setStudyApiForTests({mode:'live',listCalendarBlocks:vi.fn(async()=>[])} as unknown as StudyApi);
  try{
   const empty=await readTodayPlan('2026-11-07','UTC');
   expect(empty).toEqual({plan:null,items:[],blocks:[]});
   setDayPlanApiForTests({mode:'live',listPlans:vi.fn(async()=>({
    items:[plan],total:2,nextCursor:'same',
   }))} as unknown as DayPlanApi);
   await expect(readTodayPlan('2026-11-07','UTC')).rejects.toThrow(/Repeated day-plan cursor/);
  }finally{setDayPlanApiForTests(null);setStudyApiForTests(null)}
 });
});
