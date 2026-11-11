import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it} from 'vitest';
import type {TaskRecord} from '../../../src/data/tasks/contract';
import type {DeadlineRecord} from '../../../src/data/deadlines/contract';
import type {PracticeTopicRecord} from '../../../src/data/practice-topics/contract';
import {formatClock,formatLongDate,formatShortDate,formatTimeLeft} from '../../../src/lib/format';
import {overdueSummary} from '../../../src/features/calendar/v7/overdue';
import {groupTodo,isOverdue} from '../../../src/features/tasks/v7/tasksModel';
import {stripHours,stripSegment,stripWindow,todayBriefing} from '../../../src/features/home/v7/todayModel';
import {unplacedLine} from '../../../src/features/planner/V7PlannerSheet';
import {Chart} from '../../../src/ui/v7/Chart';
import {subjectFromClass} from '../../../src/ui/v7/Subject';

// Regression tests for the v7 Night critique (v2, 11 Nov 2026). The ids are the critique's.
const zone='Asia/Kolkata',now=new Date('2026-11-09T13:43:00+05:30');
let n=0;
const task=(patch:Partial<TaskRecord>):TaskRecord=>({id:'t'+(++n),title:'Task '+n,body:'',estimateMinutes:null,priority:'normal',due:{kind:'none'},position:n,status:'backlog',
 completedAt:null,version:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...patch});
const deadline=(patch:Partial<DeadlineRecord>):DeadlineRecord=>({id:'d'+(++n),title:'Deadline '+n,kind:'assignment',due:{kind:'date',date:'2026-11-15'},remainingMinutes:60,estimateSource:'owner',
 status:'open',origin:'owner',version:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...patch} as DeadlineRecord);
const topic=(patch:Partial<PracticeTopicRecord>):PracticeTopicRecord=>({id:'p'+(++n),title:'Topic '+n,subjectId:null,conceptId:null,checkpointId:null,nextDueDate:null,
 cadence:{kind:'adaptive'},lastPracticedAt:null,archivedAt:null,version:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...patch} as PracticeTopicRecord);

describe('B2 · time left on a deadline comes from its full due date and time',()=>{
 const left=(due:Parameters<typeof formatTimeLeft>[0])=>formatTimeLeft(due,{zone,now,clock24h:true});
 it('reads a deadline due in one hour',()=>expect(left({kind:'instant',at:'2026-11-09T14:43:00+05:30'})).toBe('Due in 1 h'));
 it('reads a deadline later today with its clock time',()=>expect(left({kind:'instant',at:'2026-11-09T21:30:00+05:30'})).toBe('Due today · 21:30'));
 it('reads a deadline due tomorrow',()=>expect(left({kind:'date',date:'2026-11-10'})).toBe('Due tomorrow'));
 it('reads a deadline due in four days',()=>expect(left({kind:'date',date:'2026-11-13'})).toBe('Due in 4 days'));
 it('reads a deadline due in twelve days as its date, never "1 h left"',()=>{
  expect(left({kind:'date',date:'2026-11-21'})).toBe('Due Sat 21 Nov');
  expect(left({kind:'instant',at:'2026-11-23T10:00:00+05:30'})).toBe('Due Mon 23 Nov');
 });
 it('reads an overdue deadline with its day',()=>expect(left({kind:'date',date:'2026-11-07'})).toBe('Overdue · Sat 7 Nov'));
});

describe('B7 · one short date, one long date and one clock',()=>{
 it('formats dates and times one way',()=>{
  expect(formatShortDate('2026-11-11',{zone,now})).toBe('Wed 11 Nov');
  expect(formatShortDate('2027-01-04',{zone,now})).toBe('Mon 4 Jan 2027');
  expect(formatLongDate('2026-11-11',{zone})).toBe('Wednesday 11 November');
  expect(formatClock('2026-11-09T03:00:00Z',{zone})).toBe('08:30');
 });
});

describe('B3 · one shared overdue count',()=>{
 const tasks=[task({due:{kind:'date',date:'2026-11-07'}}),task({status:'in_progress',due:{kind:'date',date:'2026-11-08'}}),task({due:{kind:'date',date:'2026-11-09'}}),
  task({status:'completed',due:{kind:'date',date:'2026-11-01'}})];
 const dues={deadlines:[deadline({due:{kind:'date',date:'2026-11-08'}}),deadline({due:{kind:'date',date:'2026-11-15'}}),deadline({status:'done' as DeadlineRecord['status'],due:{kind:'date',date:'2026-11-01'}})],
  topics:[topic({nextDueDate:'2026-11-08'}),topic({nextDueDate:'2026-11-09'}),topic({nextDueDate:'2026-11-01',archivedAt:'2026-11-02T00:00:00Z'})]};
 it('counts open tasks, open deadlines and practice topics together',()=>{
  expect(overdueSummary({tasks,dues},zone,now)).toEqual({tasks:2,deadlines:1,topics:1,total:4});
 });
 it('gives the Tasks Overdue group, its filter and the shared count the same task number',()=>{
  const group=groupTodo(tasks,now,zone).find(item=>item.key==='overdue');
  expect(group?.items).toHaveLength(tasks.filter(item=>isOverdue(item,now,zone)).length);
  expect(group?.items).toHaveLength(overdueSummary({tasks,dues:{deadlines:[],topics:[]}},zone,now).total);
 });
});

describe('TD3 · the briefing is short sentences',()=>{
 it('says what is next, then the counts, without repeating the next block',()=>{
  expect(todayBriefing({session:null,nextIn:'in 1 h 55 min',studyBlocksLeft:1,due:23,overdue:1})).toBe('Next block in 1 h 55 min. 23 cards due and 1 thing overdue.');
  expect(todayBriefing({session:null,nextIn:'in 5 min',studyBlocksLeft:3,due:0,overdue:0})).toBe('Next block in 5 min. 2 more study blocks.');
  expect(todayBriefing({session:null,nextIn:null,studyBlocksLeft:0,due:0,overdue:0})).toBe('Nothing scheduled. A good day to get ahead.');
 });
});

describe('PA10 · the day strip shows the planning window',()=>{
 it('covers the window widened to the blocks and now, in whole hours',()=>{
  const window=stripWindow({start:'08:00',end:'22:00',blocks:[[900,950]],now:823});
  expect(window).toEqual([480,1320]);
  expect(stripHours(window)[0]).toBe('08');
  expect(stripSegment(900,950,window).width).toBeGreaterThan(5);
  expect(stripWindow({start:'09:00',end:'17:00',blocks:[[420,480]],now:1200})).toEqual([420,1260]);
 });
});

describe('PL2 · each task the planner could not place says why and offers a fix',()=>{
 it('names the due time and the action',()=>{
  const line=unplacedLine({taskId:'x',reason:'after_due',estimateMinutes:30},task({due:{kind:'date',date:'2026-11-07'}}),null,zone,1);
  expect(line.text).toMatch(/^Overdue · Sat 7 Nov/);
  expect(line.action?.label).toBe('Change due date');
  expect(unplacedLine({taskId:'x',reason:'no_capacity'},undefined,null,zone,1).action).toEqual({label:'Plan 2 days',range:2});
 });
});

describe('KC2 · a subject class maps back to its glyph',()=>{
 it('reads the subject from its class',()=>{
  expect(subjectFromClass('v7-subject-3')).toBe('Topology');
  expect(subjectFromClass('')).toBe('Other');
 });
});

describe('KC3/KC4/KC5 · charts',()=>{
 it('ticks on round numbers, hides a one-series legend and draws a non-subject series in the neutral colour',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>root.render(<Chart title="Due each day" data={[{label:'Mon',values:[23]},{label:'Tue',values:[18]},{label:'Wed',values:[0]}]} series={[{label:'Due'}]}/>));
   const ticks=[...host.querySelectorAll('.v7-chart-text')].map(node=>node.textContent).filter(text=>/^\d+$/.test(text??''));
   expect(ticks).toEqual(['0','10','20','30']);
   expect(host.querySelector('.v7-chart-legend')).toBeNull();
   expect(host.querySelector('path')?.getAttribute('fill')).toBe('var(--v7-role-viz-neutral)');
  }finally{await act(async()=>root.unmount());host.remove();}
 });
});
