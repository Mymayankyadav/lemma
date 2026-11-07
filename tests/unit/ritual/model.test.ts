import {describe,expect,it} from 'vitest';
import {ownerCivilDate,canCloseOwnerDay} from '../../../src/features/ritual/model';

describe('N69 owner-civil closure boundaries',()=>{
 it('uses the plan time zone, never the browser host clock date',()=>{
  const sameInstant=new Date('2026-11-07T00:30:00.000Z');
  expect(ownerCivilDate(sameInstant,'Asia/Kolkata')).toBe('2026-11-07');
  expect(ownerCivilDate(sameInstant,'America/Los_Angeles')).toBe('2026-11-06');
  expect(canCloseOwnerDay('2026-11-07',sameInstant,'Asia/Kolkata')).toBe(true);
  expect(canCloseOwnerDay('2026-11-07',sameInstant,'America/Los_Angeles')).toBe(false);
 });
 it('rejects future days but allows past dates including DST transitions',()=>{
  const now=new Date('2026-11-07T23:00:00.000Z');
  expect(canCloseOwnerDay('2026-11-06',now,'America/New_York')).toBe(true);
  expect(canCloseOwnerDay('2026-11-09',now,'America/New_York')).toBe(false);
  expect(canCloseOwnerDay('2026-03-08',now,'America/New_York')).toBe(true);
 });
 it('rejects invalid civil dates, zones and missing instants',()=>{
  for(const invalid of ['2026-02-30','2026-11-7','nonsense'])
   expect(()=>canCloseOwnerDay(invalid,new Date(),'UTC')).toThrow();
  expect(()=>ownerCivilDate(new Date('invalid'),'UTC')).toThrow();
  expect(()=>canCloseOwnerDay('2026-11-07',new Date(),'Mars/Phobos')).toThrow();
 });
});

import {normalizeCarryOverChoices} from '../../../src/features/ritual/model';
describe('N69 persisted carry-over choices',()=>{
 it('keeps explicit unfinished selections and a first task',()=>{
  expect(normalizeCarryOverChoices(['a','b'],new Set(['b']),'a')).toEqual({
   carryOverTaskIds:['b'],tomorrowFirstTaskId:'a'});
  expect(normalizeCarryOverChoices([],new Set(),'')).toEqual({
   carryOverTaskIds:[],tomorrowFirstTaskId:null});
 });
 it('refuses stale or duplicated task IDs',()=>{
  expect(()=>normalizeCarryOverChoices(['a'],new Set(['b']),'')) .toThrow('Stale carry-over');
  expect(()=>normalizeCarryOverChoices(['a','a'],new Set(),'')).toThrow('Invalid unfinished');
  expect(()=>normalizeCarryOverChoices(['a'],new Set(),'deleted')).toThrow('no longer unfinished');
 });
});
