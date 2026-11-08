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

import {savedFocusTouchesOwnerDay} from '../../../src/features/ritual/model';
import type {StudyEntryRecord} from '../../../src/data/study';
describe('N69 saved focus attribution across owner-midnight',()=>{
 const focus=(start:string,end:string|null,kind:'focus'|'break'='focus')=>({
  id:'interval',kind,start,end,
 });
 const entry=(intervals:StudyEntryRecord['intervals'],status:StudyEntryRecord['status']='saved')=>
  ({status,intervals});
 it('shows a saved focus interval on both owner dates when it spans midnight',()=>{
  const e=entry([focus('2026-11-07T09:30:00Z','2026-11-07T10:30:00Z')]);
  expect(savedFocusTouchesOwnerDay(e,'2026-11-07','Pacific/Kiritimati')).toBe(true);
  expect(savedFocusTouchesOwnerDay(e,'2026-11-08','Pacific/Kiritimati')).toBe(true);
  expect(savedFocusTouchesOwnerDay(e,'2026-11-09','Pacific/Kiritimati')).toBe(false);
 });
 it('treats an exact local midnight end as exclusive and excludes break-only work',()=>{
  const e=entry([focus('2026-11-07T09:30:00Z','2026-11-07T10:00:00Z')]);
  expect(savedFocusTouchesOwnerDay(e,'2026-11-08','Pacific/Kiritimati')).toBe(false);
  expect(savedFocusTouchesOwnerDay(e,'2026-11-07','Pacific/Kiritimati')).toBe(true);
  expect(savedFocusTouchesOwnerDay(entry([
   focus('2026-11-07T09:30:00Z','2026-11-07T11:00:00Z','break')
  ]),'2026-11-08','Pacific/Kiritimati')).toBe(false);
 });
 it('ignores unsaved, open, reversed and invalid focus intervals',()=>{
  const from='2026-11-07T09:30:00Z',to='2026-11-07T10:30:00Z';
  expect(savedFocusTouchesOwnerDay(entry([focus(from,to)],'draft'),
   '2026-11-08','Pacific/Kiritimati')).toBe(false);
  for(const bad of [focus(from,null),focus(to,from),focus('invalid',to)]){
   expect(savedFocusTouchesOwnerDay(entry([bad]),'2026-11-08',
    'Pacific/Kiritimati')).toBe(false);
  }
 });
});
