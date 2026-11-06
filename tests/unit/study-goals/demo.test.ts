import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoStudyGoalApi} from '../../../src/data/study-goals/demo';
const KEY='lemma.v6.demo.study-goals.v1';
const input={period:'custom' as const,startDate:'2026-11-10',endDate:'2026-11-24',
 timeZone:'Asia/Kolkata',targetMinutes:600,subjectId:'subject-analysis',projectId:null};
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));});
afterEach(()=>{sessionStorage.clear();vi.useRealTimers();});
describe('N59 study goal demo adapter',()=>{
 it('seeds independent weekly/monthly/custom goals and exact archive-filtered totals',async()=>{
  const api=createDemoStudyGoalApi();
  const all=await api.listStudyGoals();
  expect(all.total).toBe(3);expect(all.nextCursor).toBeNull();
  expect((await api.listStudyGoals({archived:'active'})).total).toBe(2);
  expect((await api.listStudyGoals({archived:'archived'})).total).toBe(1);
  expect(all.items.some(r=>r.period==='week'&&r.timeZone==='Asia/Kolkata')).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(KEY)!).records).toHaveLength(3);
 });
 it('creates validated owner-scope IDs and clones both output and stored data',async()=>{
  const api=createDemoStudyGoalApi();
  const made=await api.createStudyGoal(input);
  expect(made).toMatchObject({actionNo:null,record:{
   period:'custom',startDate:'2026-11-10',endDate:'2026-11-24',
   targetMinutes:600,subjectId:'subject-analysis',archivedAt:null,version:1,
  }});
  const key=made.record.id;made.record.targetMinutes=0;
  expect((await api.getStudyGoal(key))?.targetMinutes).toBe(600);
  const reload=createDemoStudyGoalApi();
  expect((await reload.getStudyGoal(key))?.period).toBe('custom');
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
 });
 it('enforces versions across instances and archive/restore/delete lifecycle',async()=>{
  const a=createDemoStudyGoalApi(),b=createDemoStudyGoalApi();
  const created=(await a.createStudyGoal(input)).record;
  const changed=await a.updateStudyGoal(created.id,1,{targetMinutes:480});
  expect(changed.record.version).toBe(2);
  await expect(b.updateStudyGoal(created.id,1,{targetMinutes:900})).rejects.toMatchObject({code:'conflict'});
  const archived=await b.archiveStudyGoal(created.id,2);
  expect(archived.record.archivedAt).toMatch(/Z$/);
  await expect(a.archiveStudyGoal(created.id,3)).rejects.toMatchObject({code:'invalid'});
  expect((await a.listStudyGoals({archived:'active'})).items.some(r=>r.id===created.id)).toBe(false);
  const restored=await b.restoreStudyGoal(created.id,3);
  expect(restored.record).toMatchObject({archivedAt:null,version:4});
  const deleted=await a.deleteStudyGoal(created.id,4);
  expect(deleted).toEqual({actionNo:null,record:{id:created.id}});
  expect(await b.getStudyGoal(created.id)).toBeNull();
 });
 it('rejects overlapping same-scope periods, but permits another scope and period',async()=>{
  const api=createDemoStudyGoalApi();
  const first=(await api.createStudyGoal(input)).record;
  await expect(api.createStudyGoal({...input,startDate:'2026-11-24',endDate:'2026-11-27'}))
   .rejects.toMatchObject({code:'invalid'});
  await api.createStudyGoal({...input,period:'week'});
  await api.createStudyGoal({...input,subjectId:'subject-topology'});
  await expect(api.updateStudyGoal(first.id,1,{startDate:'2026-11-28',endDate:'2026-11-20'}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('walks bounded opaque cursor pages past 50 rows and validates filter identity',async()=>{
  const api=createDemoStudyGoalApi();
  for(let i=0;i<52;i++)await api.createStudyGoal({...input,
   period:'week',startDate:'2027-01-01',endDate:'2027-01-02',
   projectId:'path-'+i});
  const seen=new Set<string>();
  let cursor:string|null=null;
  for(let i=0;i<10;i++){
   const page=await api.listStudyGoals({limit:8,cursor});
   expect(page.total).toBe(55);
   expect(page.items.length).toBeLessThanOrEqual(8);
   for(const r of page.items)seen.add(r.id);
   cursor=page.nextCursor;
   if(!cursor)break;
   expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  }
  expect(seen.size).toBe(55);
  await expect(api.listStudyGoals({cursor:'%%%'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listStudyGoals({limit:51})).rejects.toMatchObject({code:'invalid'});
  const first=await api.listStudyGoals({limit:1,archived:'active'});
  await expect(api.listStudyGoals({cursor:first.nextCursor,archived:'archived'}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('rejects invalid date, zone and target inputs without mutating snapshot',async()=>{
  const api=createDemoStudyGoalApi(),before=await api.listStudyGoals();
  for(const bad of [
   {...input,startDate:'2026-02-30'}, {...input,endDate:'2026-11-01'},
   {...input,timeZone:'Not/AZone'},{...input,targetMinutes:-1},
   {...input,targetMinutes:1.5},{...input,period:'century'},
  ])await expect(api.createStudyGoal(bad as never)).rejects.toMatchObject({code:'invalid'});
  expect(await api.listStudyGoals()).toEqual(before);
  sessionStorage.setItem(KEY,'{bad JSON');
  expect((await createDemoStudyGoalApi().listStudyGoals()).total).toBe(3);
  sessionStorage.setItem(KEY,JSON.stringify({schema:9,records:[]}));
  expect((await createDemoStudyGoalApi().listStudyGoals()).total).toBe(3);
 });
});
