import {describe,expect,it} from 'vitest';
import type {CalendarBlockRecord} from '../../../src/data/study/contract';
import type {TaskRecord} from '../../../src/data/tasks/contract';
import type {ParkedThought} from '../../../src/data/parked-thoughts';
import {blockTomorrow,focusMinutes,looseEnds,meters,nextDay} from '../../../src/features/ritual/v7/closeModel';
import {v7ScreenFor} from '../../../src/app/v7Kit';

const block=(patch:Partial<CalendarBlockRecord>)=>({id:'b',title:'Card review',startsAt:'2026-11-11T16:30:00Z',endsAt:'2026-11-11T17:00:00Z',status:'planned',version:1,...patch}) as CalendarBlockRecord;
const task=(patch:Partial<TaskRecord>)=>({id:'t',title:'Problem set',status:'backlog',due:{kind:'date',date:'2026-11-11'},version:1,position:1,...patch}) as TaskRecord;
const thought=(patch:Partial<ParkedThought>)=>({id:'h',text:'Is every compact set closed?',status:'open',version:1,...patch}) as ParkedThought;

describe('v7 close the day model',()=>{
 it('adds up focus minutes from finished focus intervals only',()=>{
  expect(focusMinutes({intervals:[{kind:'focus',start:'2026-11-11T09:00:00Z',end:'2026-11-11T09:45:00Z'},{kind:'break',start:'2026-11-11T09:45:00Z',end:'2026-11-11T09:55:00Z'},{kind:'focus',start:'2026-11-11T10:00:00Z',end:null}]} as never)).toBe(45);
 });
 it('lists only the targets that exist',()=>{
  expect(meters({focus:130,focusGoal:120,reviewsDone:30,reviewsDue:10,practiceDone:null,practiceDue:0}).map(row=>[row.key,row.value,row.max])).toEqual([['focus',130,120],['reviews',30,40]]);
  expect(meters({focus:10,focusGoal:0,reviewsDone:0,reviewsDue:0,practiceDone:0,practiceDue:0})).toEqual([]);
 });
 it('collects planned blocks of the day, open tasks due that day and open thoughts',()=>{
  const ends=looseEnds({date:'2026-11-11',zone:'UTC',
   blocks:[block({}),block({id:'done',status:'done' as never}),block({id:'other',startsAt:'2026-11-12T16:00:00Z',endsAt:'2026-11-12T16:30:00Z'})],
   tasks:[task({}),task({id:'later',due:{kind:'date',date:'2026-11-12'}}),task({id:'closed',status:'completed'})],thoughts:[thought({})]});
  expect(ends.map(end=>end.kind+':'+end.id)).toEqual(['block:b','task:t','thought:h']);
  expect(ends[0].meta).toBe('16:30–17:00');
 });
 it('moves a block a whole day and finds the next civil day across a month end',()=>{
  expect(blockTomorrow(block({}))).toEqual({startsAt:'2026-11-12T16:30:00.000Z',endsAt:'2026-11-12T17:00:00.000Z'});
  expect(nextDay('2026-11-30')).toBe('2026-12-01');
  expect(nextDay('2026-12-31')).toBe('2027-01-01');
 });
 it('routes /today/close',()=>{expect(v7ScreenFor('/today/close')).toBe('close-day');});
});
