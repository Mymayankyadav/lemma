import {describe,expect,it} from 'vitest';
import {timedPhase} from '../../../src/data/study/phase';
import {focusClock} from '../../../src/app/v7/focus';
import {nativeTimerState} from '../../../src/platform/timer';
import type {StudyEntryRecord} from '../../../src/data/study/contract';

// N162: a paused timer kept running after the app was closed and reopened, because the server keeps one phase_ends_at.
const at=(minutes:number)=>new Date(Date.UTC(2026,10,14,16,0,0)+minutes*60_000).toISOString();
const ms=(minutes:number)=>Date.parse(at(minutes));
const entry=(over:Partial<StudyEntryRecord>):StudyEntryRecord=>({
 id:'e1',intent:'Algebra',source:'app',status:'running',reflection:null,rating:null,version:3,createdAt:at(0),updatedAt:at(0),savedAt:null,
 mode:'pomodoro',phase:'focus',cycle:1,config:{focus_minutes:25,break_minutes:5,cycles:4},phaseEndsAt:at(25),
 intervals:[{id:'i1',kind:'focus',start:at(0),end:null}],...over} as StudyEntryRecord);
const paused=(pausedAt:number,over:Partial<StudyEntryRecord>={})=>entry({status:'paused',intervals:[{id:'i1',kind:'focus',start:at(0),end:at(pausedAt)}],...over});

describe('N162 timed phase clock',()=>{
 it('counts down while running',()=>{
  const phase=timedPhase(entry({}),ms(10))!;
  expect(phase).toMatchObject({paused:false,remainingMs:15*60_000,endsAtMs:ms(25)});
 });
 it('freezes a paused phase at what was left, however long ago it was paused, and promises no end time',()=>{
  const row=paused(4);
  for(const now of [ms(4),ms(30),ms(500)]){
   expect(timedPhase(row,now)).toMatchObject({paused:true,remainingMs:21*60_000});
   const clock=focusClock(row,now);
   expect(clock).toMatchObject({seconds:21*60,mode:'remaining',endsAt:null,label:'21:00'});
  }
 });
 it('after a resume, the end moves out by the time it was paused',()=>{
  // Focused 0–4, paused 4–34, running again from 34.
  const row=entry({intervals:[{id:'i1',kind:'focus',start:at(0),end:at(4)},{id:'i2',kind:'focus',start:at(34),end:null}]});
  const phase=timedPhase(row,ms(40))!;
  expect(phase).toMatchObject({paused:false,endsAtMs:ms(55),remainingMs:15*60_000});
  expect(focusClock(row,ms(40)).endsAt).toBe(at(55));
  // Paused again at 40: 6 more minutes were focused, 15 are left, and they stay 15.
  const again=entry({status:'paused',intervals:[{id:'i1',kind:'focus',start:at(0),end:at(4)},{id:'i2',kind:'focus',start:at(34),end:at(40)}]});
  expect(timedPhase(again,ms(900))).toMatchObject({paused:true,remainingMs:15*60_000});
 });
 it('leaves open sessions and break phases as they were',()=>{
  expect(timedPhase(entry({mode:'open',phaseEndsAt:null}),ms(5))).toBeNull();
  const onBreak=entry({phase:'break',status:'paused',phaseEndsAt:at(30),intervals:[{id:'i1',kind:'focus',start:at(0),end:at(25)},{id:'i2',kind:'break',start:at(25),end:null}]});
  expect(timedPhase(onBreak,ms(27))).toMatchObject({paused:false,remainingMs:3*60_000,endsAtMs:ms(30)});
 });
 it('gives the Android notification no end time while paused, and the shifted end once resumed',()=>{
  expect(nativeTimerState(paused(4),ms(300))).toMatchObject({status:'paused',phaseEndsAt:0});
  const row=entry({intervals:[{id:'i1',kind:'focus',start:at(0),end:at(4)},{id:'i2',kind:'focus',start:at(34),end:null}]});
  expect(nativeTimerState(row,ms(40))).toMatchObject({status:'running',phaseEndsAt:ms(55)});
 });
});
