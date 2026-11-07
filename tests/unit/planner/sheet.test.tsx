import {describe,expect,it} from 'vitest';
import {selectPlannerPlacements} from '../../../src/features/planner/selection';
import type {PlannerResult} from '../../../src/features/planner/model';

const preview:PlannerResult={
 placements:[
  {taskId:'task-a',date:'2026-11-09',start:'2026-11-09T09:00:00Z',
   end:'2026-11-09T09:30:00Z',minutes:30,part:1},
  {taskId:'task-b',date:'2026-11-09',start:'2026-11-09T09:45:00Z',
   end:'2026-11-09T10:15:00Z',minutes:30,part:1},
 ],
 days:[],unplaced:[{taskId:'task-c',estimateMinutes:45,reason:'no_capacity',
  availabilityKnown:true,suggestion:'move_to_next_free_day'}],
 placedTaskIds:['task-a','task-b']
};
describe('N68 owner-directed preview selection',()=>{
 it('keeps deselected work and genuinely unplaced tasks with reasons',()=>{
  const result=selectPlannerPlacements(preview,new Set(['task-a']));
  expect(result.selected.map(x=>x.taskId)).toEqual(['task-a']);
  expect(result.unplaced).toEqual([
   {taskId:'task-c',reason:'no_capacity'},
   {taskId:'task-b',reason:'Deselected by owner'},
  ]);
 });
 it('supports a nonoverlapping time move without mutating preview',()=>{
  const moved=selectPlannerPlacements(preview,new Set(['task-a','task-b']),
   new Map([['task-b:1',{date:'2026-11-10',
    start:'2026-11-10T10:00:00Z',end:'2026-11-10T10:30:00Z'}]]));
  expect(moved.selected[1].date).toBe('2026-11-10');
  expect(preview.placements[1].date).toBe('2026-11-09');
  expect(moved.unplaced).toEqual([{taskId:'task-c',reason:'no_capacity'}]);
 });
 it('refuses overlaps, invalid instants and silent drops',()=>{
  const all=new Set(['task-a','task-b']);
  expect(()=>selectPlannerPlacements(preview,all,new Map([
   ['task-b:1',{date:'2026-11-09',
    start:'2026-11-09T09:15:00Z',end:'2026-11-09T09:45:00Z'}],
  ]))).toThrow(/overlap/);
  expect(()=>selectPlannerPlacements(preview,all,new Map([
   ['task-a:1',{date:'2026-11-09',start:'not-a-date',end:'2026-11-09T10:00:00Z'}],
  ]))).toThrow(/Invalid moved/);
  expect(selectPlannerPlacements(preview,new Set()).unplaced).toHaveLength(3);
 });
});
