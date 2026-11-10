import {describe,expect,it} from 'vitest';
import {planTaskPlacements} from '../../../src/features/planner/model';
const task={id:'proofs',estimateMinutes:30,priority:'normal' as const,due:{kind:'none' as const},status:'backlog' as const};
describe('N121 planner skips elapsed availability',()=>{
 it('rounds today up to the next five-minute instant in UTC',()=>{
  const result=planTaskPlacements({from:'2026-11-09',through:'2026-11-09',timeZone:'UTC',
   tasks:[task],now:'2026-11-09T13:43:00Z'});
  expect(result.placements[0].start).toBe('2026-11-09T13:45:00.000Z');
  expect(result.placements[0].minutes).toBe(30);
 });
 it('never places on a day that has already elapsed; it uses the next free day',()=>{
  const result=planTaskPlacements({from:'2026-11-08',through:'2026-11-10',timeZone:'UTC',
   tasks:[task],now:'2026-11-09T22:30:00Z'});
  expect(result.placements[0].date).toBe('2026-11-10');
  expect(result.days[0].remainingMinutes).toBe(0);
  expect(result.days[1].remainingMinutes).toBe(0);
 });
 it('handles owner time zones and repeated autumn hours as absolute instants',()=>{
  const result=planTaskPlacements({from:'2026-11-01',through:'2026-11-01',timeZone:'America/New_York',
   tasks:[task],now:'2026-11-01T06:11:00Z',
   planning:{window_start:'01:00',window_end:'03:00',gap_minutes:0}});
  expect(Date.parse(result.placements[0].start)).toBeGreaterThanOrEqual(Date.parse('2026-11-01T06:15:00Z'));
 });
 it('preserves the original deterministic start when no now is supplied',()=>{
  const result=planTaskPlacements({from:'2026-11-09',through:'2026-11-09',timeZone:'UTC',tasks:[task]});
  expect(result.placements[0].start).toBe('2026-11-09T08:00:00.000Z');
 });
});
