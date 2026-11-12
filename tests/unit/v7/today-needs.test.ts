import {describe,expect,it} from 'vitest';
import type {TaskRecord} from '../../../src/data/tasks/contract';
import type {PracticeTopicRecord} from '../../../src/data/practice-topics/contract';
import {needsRows,offerClose,practiceToday,presetLine,targetDone,targetRows,tasksDueToday} from '../../../src/features/home/v7/needsModel';

const task=(patch:Partial<TaskRecord>)=>({id:'t',title:'Problem set',status:'backlog',priority:'normal',position:1,due:{kind:'date',date:'2026-11-11'},version:1,...patch}) as TaskRecord;
const topic=(patch:Partial<PracticeTopicRecord>)=>({id:'p',title:'Epsilon-delta',archivedAt:null,nextDueDate:'2026-11-11',lastPracticedAt:null,...patch}) as PracticeTopicRecord;

describe('v7 Today targets and needs',()=>{
 it('leaves out zero targets and swaps a met target for Done',()=>{
  expect(targetRows({focus:0,focusGoal:0,answered:0,reviewsDue:0,practiceDone:0,practiceDue:0})).toEqual([]);
  const rows=targetRows({focus:40,focusGoal:120,answered:10,reviewsDue:13,practiceDone:2,practiceDue:0});
  expect(rows.map(row=>[row.key,row.value,row.max])).toEqual([['focus',40,120],['reviews',10,23],['practice',2,2]]);
  expect(rows.map(targetDone)).toEqual([false,false,true]);
 });
 it('lists open tasks due today by priority and ignores other days and closed tasks',()=>{
  const list=tasksDueToday([task({id:'a',priority:'low'}),task({id:'b',priority:'high'}),task({id:'c',due:{kind:'date',date:'2026-11-12'}}),task({id:'d',status:'completed'}),task({id:'e',due:{kind:'none'}})],'2026-11-11','UTC');
  expect(list.map(item=>item.id)).toEqual(['b','a']);
 });
 it('counts practice topics due today and practised today',()=>{
  const result=practiceToday([topic({id:'a'}),topic({id:'b',nextDueDate:'2026-11-20',lastPracticedAt:'2026-11-11T08:00:00Z'}),topic({id:'c',archivedAt:'2026-11-01T00:00:00Z'})],'2026-11-11','UTC');
  expect(result.due.map(item=>item.id)).toEqual(['a']);
  expect(result.done).toBe(1);
 });
 it('caps Needs you at four rows and counts the rest',()=>{
  const input={due:23,tasks:[task({id:'1'}),task({id:'2'}),task({id:'3'})],topics:[topic({})],overdue:7};
  const capped=needsRows(input);
  expect(capped.rows.map(row=>row.kind)).toEqual(['overdue','review','task','task']);
  expect(capped.hidden).toBe(2);
  expect(needsRows(input,4,true).rows).toHaveLength(6);
  expect(needsRows({due:0,tasks:[],topics:[],overdue:0}).total).toBe(0);
 });
 it('words the start-sheet presets',()=>{
  expect(presetLine({mode:'pomodoro',focusMinutes:25,breakMinutes:5,cycles:4})).toBe('Pomodoro · 25 / 5 × 4');
  expect(presetLine({mode:'flowtime',focusMinutes:0,breakMinutes:0,cycles:1})).toBe('Flowtime');
  expect(presetLine({mode:'open',focusMinutes:0,breakMinutes:0,cycles:1})).toBe('Open');
 });
 it('offers Close the day from 17:00 unless closed',()=>{
  expect(offerClose(16,false)).toBe(false);
  expect(offerClose(17,false)).toBe(true);
  expect(offerClose(20,true)).toBe(false);
 });
});
