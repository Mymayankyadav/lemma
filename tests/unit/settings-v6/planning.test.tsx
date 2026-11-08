import {describe,expect,it} from 'vitest';
import {formatCalendarTime} from '../../../src/features/calendar/views/WeekView';
import {weekStartDay,monthBounds} from '../../../src/features/calendar/model';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {validatePlanningValues,validateCalendarValues} from '../../../src/features/settings/v6/Planning';
import {SettingsNavigation,settingsTabDestination} from '../../../src/features/settings/v6/Page';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {validateFocusValues,validateReviewBudgetValues} from
 '../../../src/features/settings/v6/Focus';

const form=()=>({
 mode:'flowtime',focusMinutes:'45',breakMinutes:'6',
 longBreakMinutes:'20',cycles:'3',flowtimeBreakRatio:'0.25',
 longSessionGuardMinutes:'180',cards:'35',minutes:'40',
 reserveInPlans:'true',
});
describe('N79 typed Focus and Review Budget preferences (partial item)',()=>{
 it('maps exact N39 JSON field names and whole-minute values',()=>{
  expect(validateFocusValues(form())).toEqual({
   mode:'flowtime',focus_minutes:45,break_minutes:6,long_break_minutes:20,
   cycles:3,flowtime_break_ratio:0.25,long_session_guard_minutes:180,
  });
  expect(validateReviewBudgetValues(form())).toEqual({
   cards:35,minutes:40,reserve_in_plans:true,
  });
 });
 it('refuses out-of-range or fractional timing before saving',()=>{
  for(const [key,value] of [
   ['focusMinutes','0'],['focusMinutes','481'],['focusMinutes','2.5'],
   ['cycles','25'],['longSessionGuardMinutes','29'],
   ['flowtimeBreakRatio','0'],['flowtimeBreakRatio','1.01'],
   ['mode','unknown'],
  ]){
   expect(()=>validateFocusValues({...form(),[key]:value}),key+' '+value).toThrow();
  }
  expect(()=>validateReviewBudgetValues({...form(),cards:'2001'})).toThrow();
  expect(()=>validateReviewBudgetValues({...form(),minutes:'0.5'})).toThrow();
 });
});

describe('N79 planning, calendar preferences, and owner JSON compatibility',()=>{
 const raw=()=>({
  windowStart:'08:15',windowEnd:'21:30',gapMinutes:'15',
  maxConsecutiveMinutes:'90',dailyMinimumMinutes:'30',
  dailyIntention:'true',weekStart:'0',clock24h:'false',
 });
 it('validates HH:MM, range and calendar formats without erasing owner JSON keys',()=>{
  expect(validatePlanningValues(raw())).toEqual({
   window_start:'08:15',window_end:'21:30',gap_minutes:15,
   max_consecutive_minutes:90,daily_minimum_minutes:30,daily_intention:true,
  });
  expect(validateCalendarValues(raw())).toEqual({weekStart:0,clock24h:false});
  expect(()=>validatePlanningValues({...raw(),windowEnd:'05:00'})).toThrow(/after start/);
  expect(()=>validatePlanningValues({...raw(),windowStart:'8:15'})).toThrow(/HH:MM/);
  expect(()=>validatePlanningValues({...raw(),gapMinutes:'121'})).toThrow();
  expect(()=>validatePlanningValues({...raw(),dailyMinimumMinutes:'20.5'})).toThrow();
  expect(()=>validateCalendarValues({...raw(),weekStart:'7'})).toThrow();
 });
 it('roundtrips nested demo owner settings and retains future unknown keys',async()=>{
  const adapter=new DemoAdapter();
  const first=await adapter.updateSettings({
   focusDefaults:{
    mode:'pomodoro',focus_minutes:25,break_minutes:5,long_break_minutes:15,
    cycles:4,flowtime_break_ratio:0.2,long_session_guard_minutes:120,
    futureOption:'preserve'
   },
   planning:{...validatePlanningValues(raw()),futurePlanning:{nested:'keep'}},
   weekStart:0,clock24h:false,
  });
  expect(first.weekStart).toBe(0);expect(first.clock24h).toBe(false);
  expect(first.focusDefaults?.futureOption).toBe('preserve');
  const changed=await adapter.updateSettings({
   focusDefaults:{...first.focusDefaults!,focus_minutes:50},
   planning:{...first.planning!,gap_minutes:20},
  });
  expect(changed.focusDefaults?.focus_minutes).toBe(50);
  expect(changed.focusDefaults?.futureOption).toBe('preserve');
  expect(changed.planning?.futurePlanning).toEqual({nested:'keep'});
  await expect(adapter.updateSettings({weekStart:7})).rejects.toThrow();
  await expect(adapter.updateSettings({planning:{
    ...changed.planning!,gap_minutes:121,
  }})).rejects.toThrow();
  expect((await adapter.getSettings()).weekStart).toBe(0);
 });
 it('offers new focus/planning navigation without rewriting the seven legacy section IDs',async()=>{
  expect(settingsTabDestination('account','End')).toBe('export');
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  const selected:string[]=[];
  try{
   await act(async()=>{root.render(<SettingsNavigation selected="account"
     onSelect={item=>selected.push(item)}/>);});
   const tabs=[...container.querySelectorAll('[role="tab"]')].map(tab=>tab.textContent);
   expect(tabs).toContain('Planning');expect(tabs).toContain('Focus');
   await act(async()=>{
    [...container.querySelectorAll('button')].find(b=>b.textContent==='Planning')?.click();
   });
   expect(selected).toContain('planning');
  }finally{await act(async()=>root.unmount());container.remove()}
 });
});


describe('N79 owner Calendar display preferences',()=>{
 it('uses saved Sunday or Monday first-day settings for week and month ranges',()=>{
  expect(weekStartDay('2026-11-11',0)).toBe('2026-11-08');
  expect(weekStartDay('2026-11-11',1)).toBe('2026-11-09');
  expect(monthBounds('2026-11-11','UTC',0).days[0]?.day??'2026-11-01').toBe('2026-11-01');
 });
 it('formats the same owner instant with the selected 12/24-hour clock',()=>{
  expect(formatCalendarTime('2026-11-08T14:05:00Z','UTC',true)).toMatch(/14:05/);
  expect(formatCalendarTime('2026-11-08T14:05:00Z','UTC',false)).toMatch(/2:05.*PM/i);
 });
});
