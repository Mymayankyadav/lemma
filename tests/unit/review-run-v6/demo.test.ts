import {beforeEach,describe,expect,it} from 'vitest';
import type {ReviewItem} from '../../../src/data/types';
import {demoStart,demoRead,demoResume,demoGrade,demoSkip,
 demoPause,demoUnpause} from '../../../src/features/review-run/v6/demo';

const settings={selectedDeckIds:['project:proof'],filters:{includeNew:true},
 cardBudget:3,minuteBudget:3,schedulerVersion:'fsrs-v6',settingsVersion:1};
const cards=Array.from({length:3},(_,i)=>({cardId:'demo-card-'+i} as ReviewItem));
beforeEach(()=>sessionStorage.clear());

describe('N83 v6 demo durable review-run lifecycle',()=>{
 it('persists position, grade and skipped receipts without replaying across reads',()=>{
  const run=demoStart(settings,cards);
  expect(demoResume()?.id).toBe(run.id);
  const graded=demoGrade(run.id,run.version,run.items[0].id,51);
  expect(graded.progress).toEqual({position:1,total:3,
   graded:1,skipped:0,remaining:2,done:false});
  expect(demoRead(run.id)?.items[0]).toMatchObject({state:'graded',reviewId:51});
  expect(()=>demoGrade(run.id,run.version,run.items[0].id,52)).toThrow(/version conflict/);
  const paused=demoPause(graded.id,graded.version);
  expect(demoResume()?.status).toBe('paused');
  const resumed=demoUnpause(paused.id,paused.version);
  const stale=demoSkip(resumed.id,resumed.version,run.items[1].id,'Card version changed');
  expect(stale.progress).toMatchObject({position:2,graded:1,skipped:1,remaining:1});
  const final=demoGrade(stale.id,stale.version,run.items[2].id,53);
  expect(final.progress).toEqual({position:3,total:3,
   graded:2,skipped:1,remaining:0,done:true});
  expect(final.status).toBe('exhausted');
  expect(demoResume()).toBeNull();
  expect(demoRead(run.id)?.items.map(x=>x.state)).toEqual(['graded','stale','graded']);
 });
 it('rejects advancing twice, invalid receipts and wrong run state',()=>{
  const run=demoStart(settings,cards);
  expect(()=>demoGrade(run.id,run.version,run.items[0].id,0)).toThrow(/receipt/);
  expect(()=>demoSkip(run.id,run.version,run.items[0].id,'')).toThrow(/reason/);
  expect(()=>demoGrade(run.id,run.version,run.items[1].id,12)).toThrow(/already advanced/);
  const paused=demoPause(run.id,run.version);
  expect(()=>demoGrade(paused.id,paused.version,paused.items[0].id,12)).toThrow(/not active/);
  expect(()=>demoUnpause(run.id,run.version)).toThrow(/version conflict/);
 });
 it('starts an exhausted run honestly for an empty selection',()=>{
  const run=demoStart(settings,[]);
  expect(run).toMatchObject({status:'exhausted',
   progress:{position:0,total:0,graded:0,skipped:0,remaining:0,done:true}});
  expect(demoRead(run.id)).toEqual(run);
 });
});
