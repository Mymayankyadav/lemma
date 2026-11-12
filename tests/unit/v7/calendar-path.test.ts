import {describe,expect,it} from 'vitest';
import {monthLabel,movedLabel,moveToDay,weekCells} from '../../../src/features/calendar/v7/dayModel';
import {layoutKind,openingScroll,quarterHour} from '../../../src/features/calendar/v7/DayGrid';
import {dueTotal,lineEnd,nodeSize,nodeStateOf,nodeText,shortDate,stageLabel,waitingFor} from '../../../src/features/project/v7/pathModel';
import type {CheckpointUi,CheckpointView} from '../../../src/data/types';

const cp=(code:string,ui:CheckpointUi,extra:Partial<CheckpointView>={}):CheckpointView=>({id:code,code,title:'Title '+code,position:Number(code.slice(2)),ui,currentStep:0,stepsTotal:0,recheckDue:null,dueCards:0,...extra});

describe('v7 Calendar Day model',()=>{
 it('builds the week strip from the week start',()=>{
  const cells=weekCells('2026-11-09');
  expect(cells.map(cell=>cell.day)).toEqual(['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
  expect(cells.map(cell=>cell.initial).join('')).toBe('MTWTFSS');
  expect(cells[2].number).toBe(11);
  expect(cells[2].long).toContain('Wednesday');
  expect(monthLabel('2026-11-11')).toBe('November 2026');
 });
 it('keeps duration and time of day when a block is dropped on another day',()=>{
  const block={startsAt:'2026-11-11T09:00:00.000Z',endsAt:'2026-11-11T10:30:00.000Z'};
  expect(moveToDay(block,'2026-11-11','2026-11-13',0,'UTC')).toEqual({startsAt:'2026-11-13T09:00:00.000Z',endsAt:'2026-11-13T10:30:00.000Z'});
  expect(moveToDay(block,'2026-11-11','2026-11-10',15,'UTC')).toEqual({startsAt:'2026-11-10T09:15:00.000Z',endsAt:'2026-11-10T10:45:00.000Z'});
 });
 it('names the move in the toast',()=>{
  expect(movedLabel('2026-11-11T16:00:00.000Z','2026-11-11T17:30:00.000Z',instant=>instant.slice(11,16))).toBe('Moved to 16:00–17:30');
 });
 it('shows a full block from 60 px (about an hour), a line from 30 px, and a title alone below that',()=>{
  expect(layoutKind(64)).toBe('full');expect(layoutKind(60)).toBe('full');expect(layoutKind(53)).toBe('line');
  expect(layoutKind(32)).toBe('line');expect(layoutKind(30)).toBe('line');
  expect(layoutKind(29)).toBe('title');expect(layoutKind(16)).toBe('title');
 });
 it('taps land on the quarter hour and stay inside the day',()=>{
  expect(quarterHour(0,1440)).toBe(0);
  expect(quarterHour(14,1440)).toBe(0);
  expect(quarterHour(16,1440)).toBe(15);
  expect(quarterHour(967,1440)).toBe(960);
  expect(quarterHour(5000,1440)).toBe(1425);
  expect(quarterHour(-20,1440)).toBe(0);
 });
 it('opens with the now-line a third of the way down, other days at the first block',()=>{
  expect(openingScroll({sameDay:true,nowY:900,viewport:600,firstBlockTop:null,windowTop:0})).toBe(700);
  expect(openingScroll({sameDay:true,nowY:50,viewport:600,firstBlockTop:null,windowTop:0})).toBe(0);
  expect(openingScroll({sameDay:false,nowY:0,viewport:600,firstBlockTop:320,windowTop:128})).toBe(288);
  expect(openingScroll({sameDay:false,nowY:0,viewport:600,firstBlockTop:null,windowTop:128})).toBe(96);
 });
});

describe('v7 Path map model',()=>{
 const cps=[cp('CP1','done',{demonstratedAt:'2026-11-02'}),cp('CP2','done'),cp('CP3','now',{currentStep:3,stepsTotal:4,dueCards:4}),cp('CP4','proposed'),cp('CP5','next',{dueCards:2}),cp('CP6','locked')];
 it('maps every checkpoint state to one of the five nodes, with a size each',()=>{
  expect(cps.map(item=>nodeStateOf(item.ui))).toEqual(['demonstrated','demonstrated','current','proposed','up_next','locked']);
  expect(nodeStateOf('revisit')).toBe('demonstrated');
  expect(nodeSize).toEqual({demonstrated:20,current:28,proposed:20,up_next:16,locked:8});
 });
 it('gives every node a text label as well as its mark',()=>{
  expect(nodeText(cps,0).detail).toBe('Demonstrated 2 Nov');
  expect(nodeText(cps,1).detail).toBe('Demonstrated');
  expect(nodeText(cps,2,'Use a finite subcover').detail).toBe('Step 3 of 4: Use a finite subcover');
  expect(nodeText(cps,3).label).toBe('Proposed');
  expect(nodeText(cps,4).detail).toBe('Up next');
  expect(nodeText(cps,5).detail).toBe('Needs Title CP5');
  expect(nodeText([cp('CP1','revisit',{demonstratedAt:'2026-11-02',recheckDue:'2026-11-20'})],0).detail).toBe('Demonstrated 2 Nov · recheck due 20 Nov');
  expect(nodeText([cp('CP1','revisit')],0).detail).toBe('Demonstrated · recheck due');
 });
 it('ends the solid line at the current node and falls back sensibly',()=>{
  expect(lineEnd(cps)).toBe(2);
  expect(lineEnd([cp('CP1','done'),cp('CP2','next'),cp('CP3','locked')])).toBe(1);
  expect(lineEnd([cp('CP1','done'),cp('CP2','done')])).toBe(1);
  expect(lineEnd([cp('CP1','revisit'),cp('CP2','next')])).toBe(1);
  expect(lineEnd([])).toBe(0);
 });
 it('counts stages, due cards and the node a locked checkpoint waits for',()=>{
  expect(stageLabel('Foundations',cps.slice(0,2))).toBe('FOUNDATIONS · 2 of 2');
  expect(stageLabel('Compactness',cps.slice(2))).toBe('COMPACTNESS · 0 of 4');
  expect(dueTotal(cps)).toBe(6);
  expect(waitingFor(cps,5)).toBe('Title CP5');
  expect(waitingFor(cps,0)).toBeNull();
  expect(shortDate('not a date')).toBe('');
  expect(shortDate(null)).toBe('');
 });
});
