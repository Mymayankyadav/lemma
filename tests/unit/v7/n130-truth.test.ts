import {describe,expect,it} from 'vitest';
import type {PracticeTopicRecord} from '../../../src/data/practice-topics/contract';
import {stripTicks,stripWindow} from '../../../src/features/home/v7/todayModel';
import {QUICK_NO_TIMER,presetLine,targetRows} from '../../../src/features/home/v7/needsModel';
import {meters} from '../../../src/features/ritual/v7/closeModel';
import {practiceProgress} from '../../../src/features/practice/progress';

// N130 · v7 UX audit r3, phase U0 (truth). The ids are the audit's (docs/v7/ux-audit-2026-11-12/01_AUDIT_RELEASED_V7.md).
const zone='Asia/Kolkata';

describe('V02 · the Today strip prints each hour where that hour is',()=>{
 it('for 08:00–22:00, "14" sits at 14:00 and the last label is the window end',()=>{
  const ticks=stripTicks([480,1320]);
  const fourteen=ticks.find(tick=>tick.label==='14');
  expect(fourteen).toBeDefined();
  // 14:00 is 6 of the window's 14 hours in. On a 358 px strip, 2 px is about 0.56%.
  expect(Math.abs(fourteen!.left-6/14*100)).toBeLessThan(0.56);
  expect(ticks[0]).toEqual({label:'08',left:0});
  expect(ticks[ticks.length-1]).toEqual({label:'22',left:100});
 });
 it('every label sits at its own share of the window, for any window the strip can have',()=>{
  for(let from=0;from<=21*60;from+=60)for(let to=from+180;to<=1440;to+=60){
   const ticks=stripTicks([from,to]);
   expect(ticks.length).toBeGreaterThanOrEqual(2);
   expect(ticks.length).toBeLessThanOrEqual(8);
   for(const tick of ticks)expect(tick.left).toBeCloseTo((Number(tick.label)*60-from)/(to-from)*100,6);
   expect(ticks[ticks.length-1].label).toBe(String(to/60).padStart(2,'0'));
  }
 });
 it('the default window 06:00–24:00 reads every three hours',()=>{
  expect(stripTicks(stripWindow({blocks:[],now:600})).map(tick=>tick.label)).toEqual(['06','09','12','15','18','21','24']);
 });
});

describe('V03 · Today and Close the day count practice the same way',()=>{
 let n=0;
 const topic=(patch:Partial<PracticeTopicRecord>):PracticeTopicRecord=>({id:'p'+(++n),title:'Topic '+n,subjectId:null,conceptId:null,checkpointId:null,
  nextDueDate:null,cadence:{kind:'days',every:3},lastPracticedAt:null,archivedAt:null,version:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...patch} as PracticeTopicRecord);
 const day='2026-11-12';
 const topics=[
  topic({nextDueDate:'2026-11-12'}), // due today
  topic({nextDueDate:'2026-11-10'}), // overdue: still owed today
  topic({nextDueDate:'2026-11-15',lastPracticedAt:'2026-11-12T04:00:00Z'}), // practised today (09:30 IST)
  topic({nextDueDate:'2026-11-20'}), // not due
  topic({nextDueDate:'2026-11-11',archivedAt:'2026-11-11T00:00:00Z'}), // archived
 ];
 it('practised today is done; due today or earlier and not practised is owed',()=>{
  expect(practiceProgress(topics,day,zone)).toEqual({done:1,due:2});
 });
 it('reads "practised today" in the owner\'s zone, not UTC',()=>{
  // 20:00 UTC on the 11th is 01:30 on the 12th in Kolkata.
  expect(practiceProgress([topic({nextDueDate:'2026-11-12',lastPracticedAt:'2026-11-11T20:00:00Z'})],day,zone)).toEqual({done:1,due:0});
 });
 it('Today\'s Practice target and Close the day\'s Practice meter print the same "n of m"',()=>{
  const progress=practiceProgress(topics,day,zone);
  const today=targetRows({focus:0,focusGoal:0,answered:0,reviewsDue:0,practiceDone:progress.done,practiceDue:progress.due}).find(row=>row.key==='practice');
  const close=meters({focus:0,focusGoal:0,reviewsDone:null,reviewsDue:0,practiceDone:progress.done,practiceDue:progress.due}).find(row=>row.key==='practice');
  expect(today).toBeDefined();
  expect([today!.value,today!.max]).toEqual([close!.value,close!.max]);
  expect([today!.value,today!.max]).toEqual([1,3]);
 });
});

describe('V24 · Quick focus has no two options with the same name',()=>{
 it('the built-in choice is not called like any preset mode',()=>{
  const lines=(['open','flowtime','pomodoro'] as const).map(mode=>presetLine({mode,focusMinutes:25,breakMinutes:5,cycles:4}));
  expect(lines).not.toContain(QUICK_NO_TIMER.line);
  expect(QUICK_NO_TIMER.line).not.toMatch(/^Open\b/);
 });
});
