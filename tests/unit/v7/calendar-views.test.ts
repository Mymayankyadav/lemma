import {describe,expect,it} from 'vitest';
import type {CalendarBlockRecord} from '../../../src/data/study/contract';
import {agendaTimeColumn,collapseEmptyRuns,dotClasses,heatLegend,loadRange,loggedCaption,parseView,showWeekGlyph,tintStep,viewLabel,WEEK_TITLE_MIN_WIDTH} from '../../../src/features/calendar/v7/viewModel';

const block=(patch:Partial<CalendarBlockRecord>)=>({id:'b',title:'Reading',kind:'study',startsAt:'2026-11-11T09:00:00Z',endsAt:'2026-11-11T10:00:00Z',status:'planned',version:1,...patch}) as CalendarBlockRecord;

describe('v7 calendar views',()=>{
 it('reads the view from the query and falls back to day',()=>{
  expect(parseView('week')).toBe('week');
  expect(parseView('month')).toBe('month');
  expect(parseView('agenda')).toBe('agenda');
  expect(parseView(null)).toBe('day');
  expect(parseView('year')).toBe('day');
  expect(viewLabel('agenda')).toBe('Agenda');
 });
 it('loads a different span for each view',()=>{
  const day=loadRange('day','2026-11-11','UTC',1),week=loadRange('week','2026-11-11','UTC',1);
  expect(day).toEqual(week);
  const agenda=loadRange('agenda','2026-11-11','UTC',1),month=loadRange('month','2026-11-11','UTC',1);
  expect(JSON.stringify(agenda)).not.toBe(JSON.stringify(week));
  expect(JSON.stringify(month)).not.toBe(JSON.stringify(week));
 });
 it('tints on the kit heatmap steps (0, 1–15, 16–30, 31–60, 60+) and leaves an empty day untinted (KC6)',()=>{
  expect([0,1,15,16,30,31,60,61,400].map(tintStep)).toEqual([0,1,1,2,2,3,3,4,4]);
  expect(heatLegend).toEqual(['0','1–15','16–30','31–60','60+ min']);
 });
 it('collapses runs of empty Agenda days into one line (PA7)',()=>{
  const days=['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13'].map((day,i)=>({day,empty:i>0&&i<4}));
  expect(collapseEmptyRuns(days)).toEqual([{from:'2026-11-09',to:'2026-11-09',empty:false},{from:'2026-11-10',to:'2026-11-12',empty:true},{from:'2026-11-13',to:'2026-11-13',empty:false}]);
 });
 it('keeps at most three distinct study subjects as dots and skips busy or cancelled blocks',()=>{
  const klass=(b:CalendarBlockRecord)=>b.title;
  const blocks=[block({title:'a'}),block({title:'a'}),block({title:'b'}),block({title:'x',kind:'busy' as never}),block({title:'y',status:'cancelled' as never}),block({title:'c'}),block({title:'d'})];
  expect(dotClasses(blocks,klass)).toEqual(['a','b','c']);
 });
 it('captions logged minutes and prints nothing for a quiet day',()=>{
  expect(loggedCaption(0)).toBe('');
  expect(loggedCaption(40)).toBe('40 min');
  expect(loggedCaption(60)).toBe('1 h');
  expect(loggedCaption(65)).toBe('1 h 5 min');
 });
 it('shows the week glyph from 28 px and titles from 600 px',()=>{
  expect(showWeekGlyph(27)).toBe(false);
  expect(showWeekGlyph(28)).toBe(true);
  expect(WEEK_TITLE_MIN_WIDTH).toBe(600);
 });
 it('formats the agenda time column',()=>{
  expect(agendaTimeColumn('a','b',x=>x.toUpperCase())).toBe('A–B');
 });
});
