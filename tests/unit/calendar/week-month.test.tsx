import {describe,it,expect} from 'vitest';
import {calendarRange,dayCapacity,weekGrid} from '../../../src/features/calendar/model';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../src/data/study/contract';
const entry=(start:string,end:string):StudyEntryRecord=>({
 id:'entry',intent:'Proof',status:'saved',source:'manual',version:1,
 subjectId:null,projectId:null,checkpointId:null,sessionId:null,
 reflection:null,rating:null,createdAt:start,updatedAt:end,savedAt:end,
 intervals:[{id:'focus',kind:'focus',start,end}],
});
const block=(id:string,start:string,end:string,kind:'busy'|'study'='busy'):CalendarBlockRecord=>({
 id,title:id,kind,startsAt:start,endsAt:end,timeZone:'UTC',status:'planned',
 version:1,subjectId:null,projectId:null,checkpointId:null,sessionId:null,
});
describe('N26.1 DST-safe Week model',()=>{
 it('uses the chosen week start and seven consecutive civil dates',()=>{
  const monday=weekGrid('2026-11-06','UTC',[],[]);
  expect(monday.first).toBe('2026-11-02');
  expect(monday.days.map(d=>d.day)).toEqual([
   '2026-11-02','2026-11-03','2026-11-04','2026-11-05',
   '2026-11-06','2026-11-07','2026-11-08',
  ]);
  expect(weekGrid('2026-11-06','UTC',[],[],0).first).toBe('2026-11-01');
  expect(()=>weekGrid('2026-99-99','UTC',[],[])).toThrow(/Invalid/);
  expect(()=>weekGrid('2026-11-06','UTC',[],[],7)).toThrow(/Invalid/);
 });
 it('matches Day capacity exactly and stacks overlapping blocks rather than hiding them',()=>{
  const focus=entry('2026-11-06T08:00:00Z','2026-11-06T09:00:00Z');
  const blocks=[
   block('a','2026-11-06T08:00:00Z','2026-11-06T10:00:00Z'),
   block('b','2026-11-06T08:30:00Z','2026-11-06T09:30:00Z'),
   block('c','2026-11-06T10:00:00Z','2026-11-06T11:00:00Z','study'),
  ];
  const week=weekGrid('2026-11-06','UTC',[focus],blocks);
  const friday=week.days.find(x=>x.day==='2026-11-06')!;
  expect(friday.capacity).toEqual(dayCapacity('2026-11-06','UTC',[focus],blocks));
  expect(friday.capacity.logged).toBe(60);
  expect(friday.blocks.map(x=>x.block.id)).toEqual(['a','b','c']);
  expect(friday.blocks[0].lane).not.toBe(friday.blocks[1].lane);
  expect(friday.blocks[2].lane).toBe(friday.blocks[0].lane);
  expect(friday.saved).toHaveLength(1);
 });
 it('loads bounded real instants across spring DST without a fabricated 24-hour day',()=>{
  const date='2026-03-29',zone='Europe/London';
  const w=weekGrid(date,zone,[],[]);
  const sunday=w.days.find(x=>x.day===date)!;
  expect(sunday.range).toEqual(calendarRange(date,zone));
  expect(sunday.capacity.free).toBe(23*60);
  expect(w.days).toHaveLength(7);
 });
});
