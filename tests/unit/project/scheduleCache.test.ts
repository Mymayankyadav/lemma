import {describe,it,expect} from 'vitest';
import type {ProjectDetail} from '../../../src/data/types';
import {scheduleForVisibleProject} from '../../../src/features/project/scheduleCache';

const project=()=>({
 project:{id:'analysis',slug:'analysis',targetDate:'2026-12-31'},
 done:0,total:1,
 checkpoints:[{id:'cp-1',code:'CP1',ui:'now',stepsTotal:4,currentStep:2,dueOn:'2026-11-05'}],
}) as unknown as ProjectDetail;

describe('FIX #655 cold checkpoint/project schedule reuse',()=>{
 it('reuses one schedule across sheet, Route and stage list for one immutable query snapshot',()=>{
  const detail=project(),now=Date.UTC(2026,10,1,12,0,0);
  const events=[{projectId:'analysis',checkpointCode:'CP1',kind:'demonstrated',at:'2026-10-01T00:00:00Z'}];
  const first=scheduleForVisibleProject(detail,events,now);
  expect(scheduleForVisibleProject(detail,events,now+1000)).toBe(first);
  expect(first.rows[0].checkpoint.code).toBe('CP1');
  expect(first.rows[0].dueOn).toBe('2026-11-05');
 });
 it('invalidates for a new minute, event list or project snapshot',()=>{
  const detail=project(),now=Date.UTC(2026,10,1,12,0,0);
  const first=scheduleForVisibleProject(detail,undefined,now);
  expect(scheduleForVisibleProject(detail,undefined,now+60_000)).not.toBe(first);
  const changed=scheduleForVisibleProject(detail,[],now+60_000);
  expect(changed).not.toBe(first);
  expect(scheduleForVisibleProject(project(),[],now+60_000)).not.toBe(changed);
 });
});
