import {describe,expect,it} from 'vitest';
import {DayPlanError} from '../../../src/data/day-plans/contract';
import {normalizeCommitPlacements,type CommitPlacementsInput}
 from '../../../src/data/day-plans/placements';

const source={resource:'tasks' as const,id:'task-1',version:7};
const placement={taskId:'task-1',title:'Read theorem',startsAt:'2028-01-01T08:00:00Z',
 endsAt:'2028-01-01T08:30:00Z',position:0};
const request=():CommitPlacementsInput=>({days:[{
 planDate:'2028-01-01',timeZone:'UTC',
 sources:[{...source},{resource:'calendar_blocks',id:'busy-1',version:3},
  {resource:'study_entries',id:'saved-1',version:2}],
 placements:[{...placement}],unplaced:[],
}]});
const bad=(change:(input:CommitPlacementsInput)=>void,pattern:RegExp)=>{
 const input=request();change(input);
 expect(()=>normalizeCommitPlacements(input)).toThrowError(pattern);
};
describe('N107 atomic placement request validation',()=>{
 it('preserves every owner source version and produces an immutable serializable envelope',()=>{
  const input=request(),copy=structuredClone(input);
  const result=normalizeCommitPlacements(input);
  expect(result.days[0].sources).toEqual(copy.days[0].sources);
  expect(result.days[0].placements[0].startsAt).toBe('2028-01-01T08:00:00.000Z');
  expect(input).toEqual(copy);
  expect(result).not.toBe(input);
 });
 it('accepts two distinct owner days and exact preview plan versions',()=>{
  const input=request();
  input.days.push({...structuredClone(input.days[0]),planDate:'2028-01-02',
   planId:'draft-2',expectedVersion:4,
   placements:[{...placement,startsAt:'2028-01-02T08:00:00Z',
    endsAt:'2028-01-02T08:30:00Z'}]});
  expect(normalizeCommitPlacements(input).days[1].expectedVersion).toBe(4);
 });
 it('refuses a placement without its captured task version',()=>{
  bad(i=>{i.days[0].sources=[]},/missing its preview version/);
 });
 it('refuses duplicate days, duplicate snapshots and duplicate positions',()=>{
  bad(i=>{i.days.push(structuredClone(i.days[0]))},/Duplicate atomic placement day/);
  bad(i=>{i.days[0].sources.push(source)},/Duplicate placement source version/);
  bad(i=>{i.days[0].unplaced=[{taskId:'task-1',position:0,reason:'No room'}]},
   /Duplicate plan item position/);
 });
 it('refuses invalid periods, overlaps, timezone misalignment and partial plan CAS',()=>{
  bad(i=>{i.days[0].placements[0].endsAt='2028-01-01T07:30:00Z'},
   /Invalid planned block interval/);
  bad(i=>{i.days[0].placements.push({...placement,position:1})},
   /New placements overlap/);
  bad(i=>{i.days[0].planDate='2028-01-02'},
   /outside its owner plan date/);
  bad(i=>{i.days[0].planId='draft-1'},/both ID and version/);
 });
 it('rejects unknown fields and synthetic client snapshots',()=>{
  bad(i=>{(i.days[0] as unknown as Record<string,unknown>).owner_id='forged'},
   /Unknown placement field/);
  bad(i=>{i.days[0].sources[0].version=0},/positive int4/);
  bad(i=>{i.days[0].unplaced=[{taskId:'task-1',position:1,reason:' '}]},
   /requires a reason/);
 });
 it('uses a typed owner validation error instead of silently dropping bad selections',()=>{
  try{normalizeCommitPlacements({days:[]});throw Error('No validation error')}
  catch(e){expect(e).toBeInstanceOf(DayPlanError);}
 });
});
