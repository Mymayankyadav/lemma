import {describe,expect,it} from 'vitest';
import {dueForDay, type CalendarDues} from '../../../src/features/calendar/deadlines/DueDayItems';

const example:CalendarDues={
 deadlines:[{id:'d1',title:'Exam',status:'open',origin:'owner',kind:'exam',
  due:{kind:'date',date:'2026-11-15'},remainingMinutes:30,estimateSource:'owner',
  version:1,createdAt:'',updatedAt:''}],topics:[],
} as CalendarDues;

describe('N121 B1 due labels',()=>{
 it('never marks a future due date overdue when the viewed week is later',()=>{
  expect(dueForDay('2026-11-15','2026-11-16','Asia/Kolkata',example,
   new Date('2026-11-09T08:13:00Z'))).toMatchObject([{date:'2026-11-15',overdue:false}]);
 });
 it('does not duplicate the due item on the first date of a future week',()=>{
  expect(dueForDay('2026-11-16','2026-11-16','Asia/Kolkata',example,
   new Date('2026-11-09T08:13:00Z'))).toEqual([]);
 });
 it('marks a past due date overdue relative to today',()=>{
  expect(dueForDay('2026-11-15','2026-11-16','Asia/Kolkata',example,
   new Date('2026-11-20T08:13:00Z'))[0]?.overdue).toBe(true);
 });
});
