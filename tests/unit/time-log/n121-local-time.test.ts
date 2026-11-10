import {describe,expect,it} from 'vitest';
import {localClockInstant,localWallParts,manualFocusInterval} from '../../../src/features/time-log/local-time';

describe('N121 Time log wall-clock inputs',()=>{
 it('converts owner-local times without depending on browser timezone',()=>{
  expect(localClockInstant('2026-11-09','13:30','Asia/Kolkata'))
   .toBe('2026-11-09T08:00:00.000Z');
  expect(localWallParts('2026-11-09T08:00:00Z','Asia/Kolkata'))
   .toEqual({day:'2026-11-09',clock:'13:30'});
 });
 it('rejects impossible dates, invalid zones, and the spring DST gap',()=>{
  expect(localClockInstant('2026-02-30','09:00','UTC')).toBeNull();
  expect(localClockInstant('2026-11-09','24:00','UTC')).toBeNull();
  expect(localClockInstant('2026-03-08','02:30','America/New_York')).toBeNull();
  expect(localClockInstant('2026-11-09','09:00','Mars/Olympus')).toBeNull();
 });
 it('chooses the first occurrence of an ambiguous fall-back hour',()=>{
  expect(localClockInstant('2026-11-01','01:30','America/New_York'))
   .toBe('2026-11-01T05:30:00.000Z');
 });
 it('encodes a real focus interval and refuses reversed times',()=>{
  expect(manualFocusInterval('2026-11-09','13:00','13:50','Asia/Kolkata')).toEqual({
   kind:'focus',start:'2026-11-09T07:30:00.000Z',end:'2026-11-09T08:20:00.000Z',
  });
  expect(()=>manualFocusInterval('2026-11-09','14:00','13:00','UTC')).toThrow('End must follow');
 });
});
