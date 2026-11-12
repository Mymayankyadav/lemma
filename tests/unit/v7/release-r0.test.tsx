import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {visibleTicks,labelWidth} from '../../../src/ui/v7/Chart';
import {roundSplit} from '../../../src/features/review/v7/ReviewHubV7';
import {cardCountLabel} from '../../../src/features/cards/v7/CardsV7';
import {focusError,focusedMinutes} from '../../../src/features/focus/v7/FocusV7';
import {normaliseClock,rowFromParts} from '../../../src/features/time-log/v7/EntrySheetV7';
import {dueTimes} from '../../../src/features/tasks/v7/TaskSheetV7';
import {swipeStyle} from '../../../src/features/proposals/v7/inboxModel';
import {Stepper} from '../../../src/ui/v7/components';
import type {StudyEntryRecord} from '../../../src/data/study/contract';

/** Release plan R0 (audit F01–F14): the model rules behind "stop looking broken". */
describe('R0 · F06 chart ticks',()=>{
 it('thins 30 daily labels so neighbours keep an 8-unit gap',()=>{
  const labels=Array.from({length:30},(_,i)=>String(i+1)+' Nov'),group=300/30;
  const shown=visibleTicks(labels,group);
  const indexes=shown.flatMap((on,i)=>on?[i]:[]);
  expect(indexes.length).toBeGreaterThan(2);
  for(let i=1;i<indexes.length;i++)expect((indexes[i]-indexes[i-1])*group).toBeGreaterThanOrEqual(labelWidth('30 Nov')+8);
 });
 it('keeps every label when there is room, and honours preferred (week-start) ticks',()=>{
  expect(visibleTicks(['Mon','Tue','Wed'],100)).toEqual([true,true,true]);
  const preferred=Array.from({length:14},(_,i)=>i%7===0);
  expect(visibleTicks(Array.from({length:14},()=>'9 Nov'),20,preferred).flatMap((on,i)=>on?[i]:[])).toEqual([0,7]);
 });
});
describe('R0 · F05 numbers agree',()=>{
 it('says when a round mixes due and new cards',()=>expect(roundSplit(25,2)).toBe('23 due + 2 new'));
 it('never caps a card total with "50+"',()=>{
  expect(cardCountLabel({shown:50,more:true,exact:4951})).toBe('4 951 cards');
  expect(cardCountLabel({shown:49,more:false,exact:49})).toBe('49 cards');
  expect(cardCountLabel({shown:50,more:true,exact:null})).toBe('50 cards shown · more as you scroll');
  expect(cardCountLabel({shown:1,more:false,exact:null})).toBe('1 card');
  expect(cardCountLabel({shown:50,more:true,exact:null})).not.toContain('+');
 });
});
describe('R0 · F09 focus timer',()=>{
 const entry=(ms:number)=>({intervals:[{kind:'focus',start:'2026-11-09T08:00:00Z',end:new Date(Date.parse('2026-11-09T08:00:00Z')+ms).toISOString()}]}) as unknown as StudyEntryRecord;
 it('counts a sub-minute session as zero minutes, so Finish offers Discard',()=>{
  expect(focusedMinutes(entry(20_000),0)).toBe(0);
  expect(focusedMinutes(entry(25*60_000),0)).toBe(25);
 });
 it('never shows raw validation text',()=>{
  expect(focusError(new Error('End must follow start'))).toBe('This session is too short to save. Discard it, or keep going and finish later.');
  expect(focusError(new Error('weird internal message'))).not.toContain('internal');
 });
});
describe('R0 · F02 forms use the app pickers',()=>{
 it('time-log rows end on the next day when the end is before the start',()=>{
  expect(rowFromParts('focus','2026-11-09','23:30','00:15')).toEqual({kind:'focus',startDay:'2026-11-09',startTime:'23:30',endDay:'2026-11-10',endTime:'00:15'});
  expect(rowFromParts('break','2026-11-09','09:00','09:50').endDay).toBe('2026-11-09');
  expect(normaliseClock('930')).toBe('09:30');expect(normaliseClock('1745')).toBe('17:45');
 });
 it('offers 15-minute due times and keeps an off-grid time',()=>{
  expect(dueTimes()).toHaveLength(96);
  expect(dueTimes('17:05')).toContain('17:05');
 });
});
describe('R0 · F14 one stepper',()=>{
 it('always shows a label and a unit',()=>{
  const html=renderToStaticMarkup(<Stepper label="Focused time" unit="min" value={25} min={1} max={60} onChange={()=>{}}/>);
  expect(html).toContain('Focused time');
  expect(html).toContain('25 min');
  expect(renderToStaticMarkup(<Stepper label="Blocks" unit={n=>n===1?'block':'blocks'} value={1} onChange={()=>{}}/>)).toContain('1 block');
 });
});
describe('R0 · F07 inbox swipe',()=>{
 it('names the direction and grows the wash with distance',()=>{
  expect(swipeStyle(120,340).word).toBe('Approve');
  expect(swipeStyle(-120,340).word).toBe('Reject');
  expect(swipeStyle(20,340).wash).toBeLessThan(swipeStyle(100,340).wash);
 });
});
