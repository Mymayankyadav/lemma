import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoGoalApi} from '../../../src/data/study-goals/demo';
import {getGoalApi,setGoalApiForTests} from '../../../src/data/study-goals';
import type {GoalApi,NewGoal} from '../../../src/data/study-goals/contract';
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));

const now='2026-11-06T11:00:00.000Z';
const input:NewGoal={
 period:'week',startDate:'2026-11-16',endDate:'2026-11-22',
 timeZone:'Asia/Kolkata',targetMinutes:360,
 subjectId:'subject-analysis',projectId:'project-analysis',
};
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date(now));setGoalApiForTests(null)});
afterEach(()=>{setGoalApiForTests(null);sessionStorage.clear();vi.useRealTimers()});

describe('N59.1 demo study goals',()=>{
 it('seeds scoped weekly/monthly/custom targets and hides archived records by default',async()=>{
  const api=createDemoGoalApi();
  expect(api.mode).toBe('demo');
  const active=await api.listGoals();
  expect(active.total).toBe(4);
  expect(active.items.map(g=>g.id)).toEqual([
   'demo-goal-3','demo-goal-1','demo-goal-5','demo-goal-2'
  ]);
  expect((await api.listGoals({includeArchived:true})).total).toBe(5);
  expect((await api.getGoal('demo-goal-4'))?.archivedAt).toBeTruthy();
  expect((await api.getGoal('missing'))).toBeNull();
 });
 it('creates a validated owner record and isolates input, receipt and read objects',async()=>{
  const api=createDemoGoalApi();
  const data:{[K in keyof NewGoal]:NewGoal[K]}={...input};
  const created=await api.createGoal(data);
  expect(created.actionNo).toBeNull();
  expect(created.record).toMatchObject({...input,archivedAt:null,version:1,
   createdAt:now,updatedAt:now});
  data.targetMinutes=500;
  created.record.targetMinutes=1;
  expect((await api.getGoal(created.record.id))?.targetMinutes).toBe(360);
  const read=(await api.getGoal(created.record.id))!;
  read.startDate='2099-01-01';
  expect((await api.getGoal(created.record.id))?.startDate).toBe(input.startDate);
 });
 it('rejects inclusive overlaps for the same stable scope and period, not for different scopes or periods',async()=>{
  const api=createDemoGoalApi();
  await expect(api.createGoal({...input,startDate:'2026-11-08',endDate:'2026-11-10'}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.createGoal({...input,startDate:'2026-11-07',endDate:'2026-11-09'}))
   .rejects.toMatchObject({code:'conflict'});
  // Same dates but a separate subject, project or period do not collide.
  expect((await api.createGoal({...input,startDate:'2026-11-07',endDate:'2026-11-09',
   subjectId:'subject-linear'})).record).toBeDefined();
  expect((await api.createGoal({...input,startDate:'2026-11-07',endDate:'2026-11-09',
   period:'month'})).record.period).toBe('month');
  expect((await api.listGoals()).total).toBe(6);
 });
 it('walks 50+ goals with exact totals and cursor pages instead of an arbitrary row cap',async()=>{
  const api=createDemoGoalApi();
  for(let i=0;i<54;i++)await api.createGoal({...input,
   subjectId:'subject-'+i,projectId:null,
  });
  const ids:string[]=[];let cursor:string|null=null;
  for(let page=0;page<12;page++){
   const result=await api.listGoals({limit:7,cursor});
   expect(result.total).toBe(58);
   expect(result.items.length).toBeLessThanOrEqual(7);
   ids.push(...result.items.map(g=>g.id));
   cursor=result.nextCursor;
   if(!cursor)break;
   expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
   expect(cursor).not.toContain(result.items.at(-1)!.id);
  }
  expect(ids).toHaveLength(58);
  expect(new Set(ids).size).toBe(58);
 });
 it('binds pagination cursors to filters and validates the 1–50 limit',async()=>{
  const api=createDemoGoalApi();
  const page=await api.listGoals({limit:1});
  expect(page.nextCursor).not.toBeNull();
  const following=await api.listGoals({cursor:page.nextCursor,limit:1});
  expect(following.items[0].id).not.toBe(page.items[0].id);
  for(const limit of [0,51,1.5,-1])
   await expect(api.listGoals({limit})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listGoals({cursor:'??bad'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listGoals({cursor:page.nextCursor,includeArchived:true}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listGoals({cursor:page.nextCursor,subjectId:'subject-analysis'}))
   .rejects.toMatchObject({code:'invalid'});
  expect((await api.listGoals({subjectId:'subject-analysis',projectId:'project-analysis'})).total).toBe(2);
  expect((await api.listGoals({subjectId:null,projectId:null,includeArchived:true})).total).toBe(1);
 });
 it('checks optimistic versions across independent adapters before any update or delete',async()=>{
  const a=createDemoGoalApi(),b=createDemoGoalApi();
  const changed=await a.updateGoal('demo-goal-1',1,{targetMinutes:280});
  expect(changed).toMatchObject({actionNo:null,record:{targetMinutes:280,version:2}});
  await expect(b.updateGoal('demo-goal-1',1,{targetMinutes:100}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(b.archiveGoal('demo-goal-1',1)).rejects.toMatchObject({code:'conflict'});
  await expect(b.deleteGoal('demo-goal-1',1)).rejects.toMatchObject({code:'conflict'});
  expect((await b.getGoal('demo-goal-1'))?.targetMinutes).toBe(280);
 });
 it('archives, reopens and deletes without losing history or mutating other scoped goals',async()=>{
  const api=createDemoGoalApi();
  const initial=await api.getGoal('demo-goal-2');
  const archived=await api.archiveGoal('demo-goal-1',1);
  expect(archived.record).toMatchObject({version:2,archivedAt:now});
  expect((await api.listGoals()).total).toBe(3);
  await expect(api.archiveGoal('demo-goal-1',2)).rejects.toMatchObject({code:'invalid'});
  const restored=await api.restoreGoal('demo-goal-1',2);
  expect(restored.record).toMatchObject({version:3,archivedAt:null});
  await expect(api.restoreGoal('demo-goal-1',3)).rejects.toMatchObject({code:'invalid'});
  const gone=await api.deleteGoal('demo-goal-1',3);
  expect(gone).toEqual({record:{id:'demo-goal-1'},actionNo:null});
  expect(await api.getGoal('demo-goal-1')).toBeNull();
  expect(await api.getGoal('demo-goal-2')).toEqual(initial);
 });
 it('prevents restoring a historic goal after a new overlapping active goal was added',async()=>{
  const api=createDemoGoalApi();
  await api.archiveGoal('demo-goal-1',1);
  await api.createGoal({...input,startDate:'2026-11-02',endDate:'2026-11-08'});
  await expect(api.restoreGoal('demo-goal-1',2)).rejects.toMatchObject({code:'conflict'});
  expect((await api.getGoal('demo-goal-1'))?.archivedAt).toBe(now);
 });
 it('validates exact civil days, time-zone intent, minutes, scope and chronology atomically',async()=>{
  const api=createDemoGoalApi();
  const original=await api.listGoals({includeArchived:true});
  for(const bad of [
   {...input,period:'day' as never},
   {...input,startDate:'2026-02-30'},
   {...input,startDate:'2026-11-23'},
   {...input,endDate:'2026-11-15'},
   {...input,timeZone:'Mars/Olympus'},
   {...input,timeZone:''},
   {...input,targetMinutes:0},
   {...input,targetMinutes:100001},
   {...input,targetMinutes:2.25},
   {...input,subjectId:' '},
  ])await expect(api.createGoal(bad)).rejects.toMatchObject({code:'invalid'});
  await expect(api.updateGoal('demo-goal-2',1,{targetMinutes:-2}))
   .rejects.toMatchObject({code:'invalid'});
  expect(await api.listGoals({includeArchived:true})).toEqual(original);
 });
 it('persists edit, archive and deletion through reload in isolated tab storage',async()=>{
  const a=createDemoGoalApi();
  const goal=(await a.createGoal(input)).record;
  await a.updateGoal(goal.id,1,{targetMinutes:480});
  await a.archiveGoal(goal.id,2);
  await a.deleteGoal('demo-goal-5',1);
  const b=createDemoGoalApi();
  expect(await b.getGoal(goal.id)).toMatchObject({version:3,targetMinutes:480,archivedAt:now});
  expect(await b.getGoal('demo-goal-5')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.study-goals.v1')).toContain(goal.id);
  expect(sessionStorage.getItem('lemma.v6.demo.study.v1')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
 });
 it('recovers corrupt snapshots and accepts the stable test-injectable mode facade',async()=>{
  sessionStorage.setItem('lemma.v6.demo.study-goals.v1','{broken');
  expect((await createDemoGoalApi().listGoals()).total).toBe(4);
  sessionStorage.setItem('lemma.v6.demo.study-goals.v1',
   JSON.stringify({schema:99,goals:[{id:'bad'}]}));
  expect((await createDemoGoalApi().listGoals()).total).toBe(4);
  const api=createDemoGoalApi();
  setGoalApiForTests(api);
  expect(getGoalApi()).toBe(api);
  setGoalApiForTests(null);
  expect(getGoalApi().mode).toBe('demo');
  expect(getGoalApi()).not.toBe(api);
 });
});
