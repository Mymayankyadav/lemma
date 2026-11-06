import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoDeadlineApi} from '../../../src/data/deadlines/demo';
import type {DeadlineDue} from '../../../src/data/deadlines/contract';

const now='2026-11-06T11:00:00.000Z';
const exam='demo-deadline-1';
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date(now));});
afterEach(()=>{sessionStorage.clear();vi.useRealTimers();});

describe('N56.1 demo DeadlineApi',()=>{
 it('shows real seeded deadlines plus read-only source projections with exact bounded totals',async()=>{
  const api=createDemoDeadlineApi();
  expect(api.mode).toBe('demo');
  const list=await api.listDeadlines();
  expect(list.total).toBe(4);
  expect(list.items.map(item=>item.id)).toEqual([
   'checkpoint-due:cp1','demo-deadline-1','demo-deadline-2','project-target:analysis',
  ]);
  expect(list.items.map(item=>item.origin)).toContain('project_target');
  expect(list.items.find(item=>item.origin==='checkpoint_due')).toMatchObject({
   checkpointId:'checkpoint-analysis-1',projectId:'project-analysis',status:'open',
  });
  expect((await api.getDeadline(exam))?.remainingMinutes).toBe(90);
  expect(await api.getDeadline('missing')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.deadlines.v1')).not.toContain('project-target:analysis');
 });
 it('creates typed civil dates, supports clears and preserves cloned values through tab reload',async()=>{
  const api=createDemoDeadlineApi();
  const input={title:'  Write research paper  ',kind:'assignment' as const,
   due:{kind:'date' as const,date:'2026-12-01'},remainingMinutes:120,subjectId:'subject-analysis'};
  const created=await api.createDeadline(input);
  expect(created).toMatchObject({actionNo:null,record:{title:'Write research paper',
   due:{kind:'date',date:'2026-12-01'},remainingMinutes:120,estimateSource:'owner',
   subjectId:'subject-analysis',version:1,origin:'standalone',status:'open',createdAt:now}});
  created.record.title='Local tampering';
  input.due.date='2026-12-02';
  expect((await api.getDeadline(created.record.id))?.title).toBe('Write research paper');
  const nextDue:DeadlineDue={kind:'instant',at:'2026-12-02T13:45:00+05:30'};
  const updated=await api.updateDeadline(created.record.id,1,{due:nextDue,remainingMinutes:null,estimateSource:null});
  expect(updated.record).toMatchObject({version:2,due:{kind:'instant',at:'2026-12-02T08:15:00.000Z'},
   remainingMinutes:null,estimateSource:null});
  const reloaded=createDemoDeadlineApi();
  expect(await reloaded.getDeadline(created.record.id)).toEqual(updated.record);
  expect(sessionStorage.getItem('lemma.v6.demo.study.v1')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
 });
 it('enforces optimistic version and the complete status lifecycle',async()=>{
  const first=createDemoDeadlineApi(),second=createDemoDeadlineApi();
  const done=await first.completeDeadline(exam,1);
  expect(done).toMatchObject({record:{status:'done',version:2},actionNo:null});
  await expect(second.completeDeadline(exam,1)).rejects.toMatchObject({code:'conflict'});
  await expect(second.deleteDeadline(exam,1)).rejects.toMatchObject({code:'conflict'});
  await expect(first.cancelDeadline(exam,2)).rejects.toMatchObject({code:'invalid'});
  const reopened=await second.reopenDeadline(exam,2);
  expect(reopened.record).toMatchObject({status:'open',version:3});
  const cancelled=await first.cancelDeadline(exam,3);
  expect(cancelled.record).toMatchObject({status:'cancelled',version:4});
  expect((await second.listDeadlines()).total).toBe(3);
  expect((await second.listDeadlines({statuses:['cancelled']})).items[0].id).toBe(exam);
  const restored=await second.restoreDeadline(exam,4);
  expect(restored.record).toMatchObject({status:'open',version:5});
  const deleted=await first.deleteDeadline(exam,5);
  expect(deleted).toEqual({record:{id:exam},actionNo:null});
  expect(await second.getDeadline(exam)).toBeNull();
  await expect(second.reopenDeadline(exam,5)).rejects.toMatchObject({code:'not_found'});
 });
 it('keeps projected project and checkpoint due dates immutable',async()=>{
  const api=createDemoDeadlineApi();
  await expect(api.updateDeadline('project-target:analysis',1,{title:'Wrong'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.completeDeadline('checkpoint-due:cp1',1))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.deleteDeadline('project-target:analysis',1))
   .rejects.toMatchObject({code:'invalid'});
  expect((await api.getDeadline('project-target:analysis'))?.title).toBe('Analysis path target');
  expect((await createDemoDeadlineApi().listDeadlines()).total).toBe(4);
 });
 it('walks 50+ records in deterministic bounded pages with no duplicates',async()=>{
  const api=createDemoDeadlineApi();
  for(let i=0;i<55;i++)await api.createDeadline({
   title:'Milestone '+i,kind:'milestone',due:{kind:'date',date:'2026-12-01'},
  });
  const ids:string[]=[],seen=new Set<string>();
  let cursor:string|null=null;
  for(let n=0;n<20;n++){
   const page=await api.listDeadlines({limit:7,cursor});
   expect(page.total).toBe(59);
   expect(page.items.length).toBeLessThanOrEqual(7);
   for(const item of page.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);ids.push(item.id);}
   cursor=page.nextCursor;
   if(!cursor)break;
  }
  expect(ids).toHaveLength(59);
  expect(new Set(ids).size).toBe(59);
 });
 it('validates status filters and binds pagination cursors to their filter',async()=>{
  const api=createDemoDeadlineApi();
  const first=await api.listDeadlines({limit:2,statuses:['open','done']});
  expect(first.total).toBe(4);
  expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  const second=await api.listDeadlines({limit:2,statuses:['done','open'],cursor:first.nextCursor});
  expect(second.items).toHaveLength(2);
  await expect(api.listDeadlines({limit:2,statuses:['cancelled'],cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  for(const query of [{limit:0},{limit:51},{limit:1.5},{statuses:['unknown']},{statuses:['open','open']},{cursor:'bad!!'}])
   await expect(api.listDeadlines(query as never)).rejects.toMatchObject({code:'invalid'});
 });
 it('rejects invalid dates, missing estimate sources and unusable links without writing',async()=>{
  const api=createDemoDeadlineApi(),before=await api.listDeadlines();
  const bad=[
   {title:' ',kind:'exam',due:{kind:'date',date:'2026-12-10'}},
   {title:'Exam',kind:'invalid',due:{kind:'date',date:'2026-12-10'}},
   {title:'Exam',kind:'exam',due:{kind:'date',date:'2026-02-30'}},
   {title:'Exam',kind:'exam',due:{kind:'date',date:'2026-12-01T00:00:00Z'}},
   {title:'Exam',kind:'exam',due:{kind:'instant',at:'2026-12-01'}},
   {title:'Exam',kind:'exam',due:{kind:'instant',at:'2026-12-01T08:30'}},
   {title:'Exam',kind:'exam',due:{kind:'date',date:'2026-12-01'},remainingMinutes:1.5},
   {title:'Exam',kind:'exam',due:{kind:'date',date:'2026-12-01'},remainingMinutes:12,estimateSource:'unknown'},
   {title:'Exam',kind:'exam',due:{kind:'date',date:'2026-12-01'},remainingMinutes:null,estimateSource:'derived'},
   {title:'Exam',kind:'exam',due:{kind:'date',date:'2026-12-01'},projectId:' '},
  ];
  for(const input of bad)await expect(api.createDeadline(input as never)).rejects.toMatchObject({code:'invalid'});
  expect(await api.listDeadlines()).toEqual(before);
  await expect(api.updateDeadline(exam,1,{due:{kind:'date',date:'2026-02-30'}}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.updateDeadline(exam,1,{remainingMinutes:-10}))
   .rejects.toMatchObject({code:'invalid'});
  expect((await api.getDeadline(exam))?.version).toBe(1);
 });
 it('recovers from malformed tab storage and keeps the seeded projection separate',async()=>{
  sessionStorage.setItem('lemma.v6.demo.deadlines.v1','{bad');
  const api=createDemoDeadlineApi();
  expect((await api.listDeadlines()).total).toBe(4);
  sessionStorage.setItem('lemma.v6.demo.deadlines.v1',JSON.stringify({schema:100,deadlines:[]}));
  expect((await api.listDeadlines()).total).toBe(4);
 });
});
