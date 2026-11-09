import {describe,it,expect} from 'vitest';
import {canonicalZone,formatDay,formatTime,formatTimeRange,formatDateTime,formatDuration,formatInterval} from '../../../src/lib/format';
describe('N121 v6 human formatting',()=>{
 it('canonicalizes legacy IANA zone spellings without changing instants',()=>{
  expect(canonicalZone('Asia/Calcutta')).toBe('Asia/Kolkata');
  expect(canonicalZone('Europe/Kiev')).toBe('Europe/Kyiv');
 });
 it('uses owner civil dates at midnight regardless of device zone',()=>{
  const opts={zone:'Asia/Kolkata',now:'2026-11-09T18:35:00Z'};
  expect(formatDay('2026-11-09',opts)).toBe('Yesterday');
  expect(formatDay('2026-11-10',opts)).toBe('Today');
  expect(formatDay('2026-11-11',opts)).toBe('Tomorrow');
  expect(formatDay('2026-11-15',opts)).toBe('Sun');
 });
 it('keeps 24h and 12h times consistent with owner preference',()=>{
  const iso='2026-11-09T14:00:00Z';
  expect(formatTime(iso,{zone:'Asia/Kolkata',clock24h:true})).toBe('19:30');
  expect(formatTime(iso,{zone:'Asia/Kolkata',clock24h:false})).toBe('7:30 pm');
  expect(formatTimeRange(iso,'2026-11-09T15:00:00Z',{zone:'Asia/Kolkata',clock24h:true})).toBe('19:30–20:30');
  expect(formatDateTime(iso,{zone:'Asia/Kolkata',now:'2026-11-09T10:00:00Z',clock24h:true})).toBe('Today · 19:30');
 });
 it('uses readable lengths, never machine abbreviations',()=>{
  expect(formatDuration(2940)).toBe('49 h');
  expect(formatDuration(90)).toBe('1 h 30 min');
  expect(formatInterval(30)).toBe('30 days');
  expect(formatInterval(61)).toBe('2 months');
  expect(formatInterval(548)).toBe('1.5 years');
  expect(formatInterval(10/1440)).toBe('10 min');
 });
 it('does not convert civil times through a DST gap for headings',()=>{
  expect(formatDay('2026-03-08',{zone:'America/New_York',now:'2026-03-08T17:00:00Z'})).toBe('Today');
 });
});
