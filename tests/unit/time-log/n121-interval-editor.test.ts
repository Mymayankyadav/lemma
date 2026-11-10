import {describe,expect,it} from 'vitest';
import {intervalRows,intervalsFromRows} from '../../../src/features/time-log/interval-editor';

describe('owner-local interval editor',()=>{
 const zone='Asia/Kolkata';
 it('round-trips focus and break intervals without exposing ISO timestamps',()=>{
  const source=[
   {kind:'focus' as const,start:'2026-11-09T03:30:00.000Z',end:'2026-11-09T04:00:00.000Z'},
   {kind:'break' as const,start:'2026-11-09T04:00:00.000Z',end:'2026-11-09T04:10:00.000Z'},
  ];
  const rows=intervalRows(source,zone);
  expect(rows).toEqual([
   {kind:'focus',startDay:'2026-11-09',startTime:'09:00',endDay:'2026-11-09',endTime:'09:30'},
   {kind:'break',startDay:'2026-11-09',startTime:'09:30',endDay:'2026-11-09',endTime:'09:40'},
  ]);
  expect(intervalsFromRows(rows,zone)).toEqual({intervals:source,errors:[null,null]});
 });
 it('returns row-local errors for missing or reversed intervals',()=>{
  const rows=[
   {kind:'focus' as const,startDay:'2026-11-09',startTime:'10:00',endDay:'2026-11-09',endTime:'09:00'},
   {kind:'break' as const,startDay:'2026-11-09',startTime:'11:00',endDay:'2026-11-09',endTime:'11:10'},
  ];
  const result=intervalsFromRows(rows,zone);
  expect(result.intervals).toEqual([]);
  expect(result.errors).toEqual(['End must follow start.',null]);
 });
 it('rejects an empty interval editor',()=>{
  expect(intervalsFromRows([],zone)).toEqual({intervals:[],errors:['Add at least one interval']});
 });
 it('rejects nonexistent daylight-saving wall times',()=>{
  const result=intervalsFromRows([{
   kind:'focus',startDay:'2026-03-08',startTime:'02:30',endDay:'2026-03-08',endTime:'03:30',
  }],'America/New_York');
  expect(result.intervals).toEqual([]);
  expect(result.errors[0]).toContain('valid local');
 });
});
