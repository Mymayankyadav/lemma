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

import {startVerifiedPlannedBlock} from '../../../src/features/home/V6TodayPlan';
describe('N70 verified focus Start does not trust stale owner preview',()=>{
 const planApi=(record:DayPlanRecord=plan,placed:DayPlanItem=item)=>({
  mode:'live',listPlans:vi.fn(async()=>({items:[record],total:1,nextCursor:null})),
  listItems:vi.fn(async()=>({items:[placed],total:1,nextCursor:null})),
 }) as unknown as DayPlanApi;
 const studyApi=(current:CalendarBlockRecord=block)=>({
  mode:'live',listCalendarBlocks:vi.fn(async()=>[current]),
  activeStudyEntry:vi.fn(async()=>null),
  startStudyEntry:vi.fn(async(input:unknown)=>({record:{intent:'Study',input},actionNo:1})),
 }) as unknown as StudyApi;
 const at='2026-11-07T11:00:00Z';
 it('starts once with real subject links when the plan and block still match',async()=>{
  const day=planApi(),study=studyApi();
  setDayPlanApiForTests(day);setStudyApiForTests(study);
  try{
   await startVerifiedPlannedBlock('2026-11-07','UTC',plan,block,at);
   expect(study.startStudyEntry).toHaveBeenCalledTimes(1);
   expect(study.startStudyEntry).toHaveBeenCalledWith(expect.objectContaining({
    subjectId:'owner-subject',source:'timer',intent:'Study',startedAt:at,
   }));
   expect((study.startStudyEntry as ReturnType<typeof vi.fn>).mock.calls[0][0])
    .not.toHaveProperty('calendarBlockId');
  }finally{setDayPlanApiForTests(null);setStudyApiForTests(null)}
 });
 it('refuses replaced and cancelled blocks, changed plans and active sessions',async()=>{
  const day=planApi(),study=studyApi({...block,version:2});
  setDayPlanApiForTests(day);setStudyApiForTests(study);
  try{
   await expect(startVerifiedPlannedBlock('2026-11-07','UTC',plan,block,at))
    .rejects.toThrow(/Planned block changed/);
   expect(study.startStudyEntry).not.toHaveBeenCalled();
   (study.listCalendarBlocks as ReturnType<typeof vi.fn>)
    .mockResolvedValue([{...block,status:'cancelled'}]);
   await expect(startVerifiedPlannedBlock('2026-11-07','UTC',plan,block,at))
    .rejects.toThrow(/Planned block changed/);
   (day.listPlans as ReturnType<typeof vi.fn>)
    .mockResolvedValue({items:[{...plan,version:2}],total:1,nextCursor:null});
   await expect(startVerifiedPlannedBlock('2026-11-07','UTC',plan,block,at))
    .rejects.toThrow(/Day plan changed/);
   (study.activeStudyEntry as ReturnType<typeof vi.fn>)
    .mockResolvedValue({id:'running'});
   await expect(startVerifiedPlannedBlock('2026-11-07','UTC',plan,block,at))
    .rejects.toThrow(/active focus session/);
   expect(study.startStudyEntry).not.toHaveBeenCalled();
  }finally{setDayPlanApiForTests(null);setStudyApiForTests(null)}
 });
});
