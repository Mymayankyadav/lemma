// bug #1299 (N119): the demo durable run steps back to its last graded item, and only that item.
import {beforeEach,describe,expect,it} from 'vitest';
import {demoGrade,demoSkip,demoStart,demoUndoLast} from '../../../src/features/review-run/v6/demo';
import {lastGraded} from '../../../src/features/review-run/v6/adapter';
import type {ReviewItem} from '../../../src/data/types';

const input={selectedDeckIds:['project:a'],filters:{},cardBudget:5,minuteBudget:5,schedulerVersion:'fsrs-5',settingsVersion:1};
const cards=[{cardId:'c1'},{cardId:'c2'}] as unknown as ReviewItem[];
beforeEach(()=>sessionStorage.clear());

describe('bug #1299 undo the last answer of a v6 review run',()=>{
 it('returns the run to the graded item, pending again, and keeps earlier items',()=>{
  const run=demoStart(input,cards);
  expect(lastGraded(run)).toBeNull();
  expect(()=>demoUndoLast(run.id,run.version,run.items[0].id)).toThrow(/No answer to undo/);
  const graded=demoGrade(run.id,run.version,run.items[0].id,41);
  expect(lastGraded(graded)?.id).toBe(run.items[0].id);
  expect(()=>demoUndoLast(run.id,graded.version,run.items[1].id)).toThrow(/Only the last graded item/);
  expect(()=>demoUndoLast(run.id,graded.version-1,run.items[0].id)).toThrow(/version conflict/);
  const undone=demoUndoLast(run.id,graded.version,run.items[0].id);
  expect(undone.position).toBe(0);
  expect(undone.items[0]).toMatchObject({state:'pending',reviewId:null});
  expect(undone.progress).toMatchObject({position:0,graded:0,remaining:2,done:false});
 });
 it('reopens an exhausted run at its last card and refuses to undo a skipped card',()=>{
  const run=demoStart(input,cards);
  const first=demoGrade(run.id,run.version,run.items[0].id,1);
  const done=demoGrade(run.id,first.version,run.items[1].id,2);
  expect(done.status).toBe('exhausted');
  const reopened=demoUndoLast(run.id,done.version,run.items[1].id);
  expect(reopened).toMatchObject({status:'running',position:1,endedAt:null});
  const skipped=demoSkip(run.id,reopened.version,run.items[1].id,'Card changed');
  expect(lastGraded(skipped)).toBeNull();
  expect(()=>demoUndoLast(run.id,skipped.version,run.items[1].id)).toThrow(/Only the last graded item/);
 });
});
