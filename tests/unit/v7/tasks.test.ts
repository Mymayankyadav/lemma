import {describe,expect,it} from 'vitest';
import type {TaskRecord} from '../../../src/data/tasks/contract';
import {applyFilter,bucketOf,dayWord,dueChip,estimateText,groupTodo,isOverdue,noFilter,segmentOf,swipeIntent} from '../../../src/features/tasks/v7/tasksModel';
import {v7ScreenFor} from '../../../src/app/v7Kit';

const now=new Date('2026-11-11T08:00:00Z'),zone='UTC';
let n=0;
const task=(patch:Partial<TaskRecord>):TaskRecord=>({id:'t'+(++n),title:'Task '+n,body:'',estimateMinutes:null,priority:'normal',due:{kind:'none'},position:n,status:'backlog',
 completedAt:null,version:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...patch});

describe('v7 tasks model',()=>{
 it('maps statuses onto the three segments',()=>{
  expect(segmentOf('backlog')).toBe('To do');
  expect(segmentOf('in_progress')).toBe('Doing');
  expect(segmentOf('completed')).toBe('Done');
  expect(segmentOf('cancelled')).toBe('Done');
 });
 it('buckets by civil day in the owner zone and puts a passed instant in Overdue',()=>{
  expect(bucketOf(task({due:{kind:'date',date:'2026-11-10'}}),now,zone)).toBe('overdue');
  expect(bucketOf(task({due:{kind:'date',date:'2026-11-11'}}),now,zone)).toBe('today');
  expect(bucketOf(task({due:{kind:'date',date:'2026-11-17'}}),now,zone)).toBe('week');
  expect(bucketOf(task({due:{kind:'date',date:'2026-11-18'}}),now,zone)).toBe('later');
  expect(bucketOf(task({}),now,zone)).toBe('none');
  expect(bucketOf(task({due:{kind:'instant',at:'2026-11-11T07:00:00Z'}}),now,zone)).toBe('overdue');
  // 23:30 UTC on the 11th is already the 12th in Asia/Kolkata.
  expect(bucketOf(task({due:{kind:'instant',at:'2026-11-11T23:30:00Z'}}),now,'Asia/Kolkata')).toBe('week');
 });
 it('never calls a done or cancelled task overdue',()=>{
  expect(isOverdue(task({status:'completed',due:{kind:'date',date:'2026-11-01'}}),now,zone)).toBe(false);
  expect(isOverdue(task({status:'cancelled',due:{kind:'date',date:'2026-11-01'}}),now,zone)).toBe(false);
 });
 it('groups To do with Overdue first, skips empty groups and only lists backlog',()=>{
  const groups=groupTodo([task({due:{kind:'date',date:'2026-11-20'}}),task({due:{kind:'date',date:'2026-11-09'}}),task({status:'in_progress'}),task({due:{kind:'date',date:'2026-11-08'}})],now,zone);
  expect(groups.map(group=>group.key)).toEqual(['overdue','later']);
  expect(groups[0].items.map(item=>item.due.kind==='date'?item.due.date:'')).toEqual(['2026-11-08','2026-11-09']);
 });
 it('filters by path, high priority and overdue together',()=>{
  const items=[task({projectId:'a',priority:'high',due:{kind:'date',date:'2026-11-01'}}),task({projectId:'a'}),task({projectId:'b',priority:'high'})];
  expect(applyFilter(items,{...noFilter,projectId:'a'},now,zone)).toHaveLength(2);
  expect(applyFilter(items,{projectId:'a',highOnly:true,overdueOnly:true},now,zone)).toHaveLength(1);
  expect(applyFilter(items,noFilter,now,zone)).toHaveLength(3);
 });
 it('words due dates day-first and warns on overdue',()=>{
  expect(dayWord('2026-11-11',now,zone)).toBe('Today');
  expect(dayWord('2026-11-12',now,zone)).toBe('Tomorrow');
  expect(dayWord('2026-11-14',now,zone)).toBe('Sat');
  expect(dayWord('2026-11-27',now,zone)).toBe('Fri 27 Nov');
  expect(dueChip(task({due:{kind:'date',date:'2026-11-07'}}),now,zone)).toEqual({text:'Overdue · Sat',tone:'overdue'});
  expect(dueChip(task({}),now,zone)).toBeNull();
 });
 it('reads a swipe as complete, reveal or nothing',()=>{
  expect(swipeIntent(120,10)).toBe('complete');
  expect(swipeIntent(-120,-10)).toBe('reveal');
  expect(swipeIntent(60,0)).toBeNull();
  expect(swipeIntent(120,200)).toBeNull();
 });
 it('formats estimates and routes /tasks',()=>{
  expect(estimateText(45)).toBe('45 min');
  expect(estimateText(90)).toBe('1 h 30 min');
  expect(estimateText(60)).toBe('1 h');
  expect(estimateText(null)).toBeNull();
  expect(v7ScreenFor('/tasks')).toBe('tasks');
 });
});
