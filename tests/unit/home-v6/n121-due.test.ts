import {describe,expect,it} from 'vitest';
import {groupTodayDue} from '../../../src/features/home/TodayDue';
import type {CalendarDues} from '../../../src/features/calendar/deadlines/DueDayItems';
import type {TaskRecord} from '../../../src/data/tasks/contract';
const today='2026-11-09';
const tasks=[
 {id:'t1',title:'Algebra',status:'backlog',due:{kind:'date',date:today}},
 {id:'t2',title:'Geometry',status:'completed',due:{kind:'date',date:today}},
 {id:'t3',title:'Topology',status:'in_progress',due:{kind:'instant',at:'2026-11-08T20:00:00Z'}},
 {id:'t4',title:'No due',status:'backlog',due:{kind:'none'}},
] as unknown as TaskRecord[];
const dues={deadlines:[
 {id:'d1',status:'open',title:'Proofs',due:{kind:'date',date:'2026-11-05'}},
 {id:'d2',status:'done',title:'Done deadline',due:{kind:'date',date:today}},
],topics:[
 {id:'p1',title:'Practice',archivedAt:null,nextDueDate:today},
 {id:'p2',title:'Archived',archivedAt:'2026-11-01T00:00:00Z',nextDueDate:today},
]} as unknown as CalendarDues;
describe('N121 Today due item groups',()=>{
 it('treats local-day instants, civil dates, status and archive correctly',()=>{
  const result=groupTodayDue(today,'Asia/Kolkata',tasks,dues);
  expect(result.today.map(x=>x.title)).toEqual(['Algebra','Topology','Practice']);
  expect(result.overdue.map(x=>x.title)).toEqual(['Proofs']);
  expect(result.today[1].to).toBe('/tasks');
  expect(result.today[2].to).toBe('/practice');
 });
 it('does not mark a future deadline overdue just because a viewed Calendar page is later',()=>{
  const later={...dues,topics:[],deadlines:[{...dues.deadlines[0],due:{kind:'date' as const,date:'2026-11-16'}}]};
  const result=groupTodayDue(today,'Asia/Kolkata',[],later);
  expect(result.overdue).toEqual([]);
  expect(result.today).toEqual([]);
 });
});
