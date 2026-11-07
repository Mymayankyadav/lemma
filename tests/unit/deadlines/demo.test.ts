import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoDeadlineApi} from '../../../src/data/deadlines/demo';
import type {DeadlineDue,DeadlineRecord} from '../../../src/data/deadlines/contract';

const now='2026-11-06T12:00:00.000Z';
const input={title:'Prepare for oral exam',kind:'exam' as const,
 due:{kind:'date' as const,date:'2026-11-30'},
 projectId:'project-analysis',remainingMinutes:90,estimateSource:'owner' as const};
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date(now))});
afterEach(()=>{sessionStorage.clear();vi.useRealTimers()});

describe('N56.1 demo DeadlineApi',()=>{
 it('starts with a small active fixture and read-only projected path/checkpoint targets',async()=>{
  const api=createDemoDeadlineApi();
  expect(api.mode).toBe('demo');
  const page=await api.listDeadlines();
  expect(page.total).toBe(4);
  expect(page.nextCursor).toBeNull();
  expect(page.items.map(x=>x.id)).toEqual([
   'demo-deadline-2','checkpoint-due:cp-proof','demo-deadline-1','project-target:project-analysis'
  ]);
  expect(page.items.filter(x=>x.origin!=='owner')).toHaveLength(2);
  expect((await api.listDeadlines({includeProjections:false})).total).toBe(2);
  expect((await api.listDeadlines({statuses:['done','cancelled']})).total).toBe(2);
  expect((await api.listDeadlines({statuses:[]})).items).toEqual([]);
 });
 it('creates due civil dates separately from timezone-aware instants and clone-isolates reads',async()=>{
  const api=createDemoDeadlineApi();
  const params={...input,due:{...input.due}};
  const created=await api.createDeadline(params);
  expect(created.actionNo).toBeNull();
  expect(created.record).toMatchObject({...input,status:'open',origin:'owner',version:1,
   createdAt:now,updatedAt:now});
  params.due.date='2026-12-01';
  created.record.title='mutated by caller';
  expect((await api.getDeadline(created.record.id))?.title).toBe(input.title);
  expect((await api.getDeadline(created.record.id))?.due).toEqual({kind:'date',date:'2026-11-30'});
  const instant:DeadlineDue={kind:'instant',at:'2026-12-01T09:15:00+05:30'};
  const changed=await api.updateDeadline(created.record.id,1,{due:instant,remainingMinutes:60});
  expect(changed.record).toMatchObject({version:2,due:instant,remainingMinutes:60});
  const read=(await createDemoDeadlineApi().getDeadline(created.record.id))!;
  read.due={kind:'date',date:'2026-12-02'};
  expect((await api.getDeadline(created.record.id))?.due).toEqual(instant);
 });
 it('walks more than 50 items with exact totals and filter-bound opaque keyset cursors',async()=>{
  const api=createDemoDeadlineApi();
  for(let i=0;i<52;i++)await api.createDeadline({
   title:'Deadline '+i,kind:'assignment',due:{kind:'date',date:'2026-12-01'}
  });
  const seen:string[]=[];let cursor:string|null=null;
  for(let pageNo=0;pageNo<15;pageNo++){
   const page=await api.listDeadlines({limit:7,cursor});
   expect(page.items.length).toBeLessThanOrEqual(7);
   expect(page.total).toBe(56);
   seen.push(...page.items.map(x=>x.id));
   cursor=page.nextCursor;
   if(!cursor)break;
   expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
   expect(cursor).not.toContain(page.items.at(-1)!.id);
  }
  expect(seen).toHaveLength(56);
  expect(new Set(seen).size).toBe(56);
 });
 it('validates pagination limits, statuses, and cursor filter compatibility',async()=>{
  const api=createDemoDeadlineApi();
  const page=await api.listDeadlines({limit:1});
  expect(page.nextCursor).not.toBeNull();
  const follow=await api.listDeadlines({limit:1,cursor:page.nextCursor});
  expect(follow.items[0].id).not.toBe(page.items[0].id);
  for(const limit of [0,51,1.5])
   await expect(api.listDeadlines({limit})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({statuses:['unknown' as never]})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({cursor:'bad!'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({cursor:page.nextCursor,includeProjections:false}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({cursor:page.nextCursor,statuses:['done']}))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('requires fresh optimistic versions across independent adapters',async()=>{
  const a=createDemoDeadlineApi(),b=createDemoDeadlineApi();
  const original=(await a.getDeadline('demo-deadline-1'))!;
  const changed=await a.updateDeadline(original.id,1,{title:'Rescheduled examination'});
  expect(changed).toMatchObject({actionNo:null,record:{version:2,title:'Rescheduled examination'}});
  await expect(b.updateDeadline(original.id,1,{title:'Stale'})).rejects.toMatchObject({code:'conflict'});
  await expect(b.completeDeadline(original.id,1)).rejects.toMatchObject({code:'conflict'});
  await expect(b.deleteDeadline(original.id,1)).rejects.toMatchObject({code:'conflict'});
  expect((await b.getDeadline(original.id))?.version).toBe(2);
 });
 it('completes, reopens, cancels and restores with distinct durable version steps',async()=>{
  const api=createDemoDeadlineApi();
  const done=await api.completeDeadline('demo-deadline-1',1);
  expect(done.record).toMatchObject({version:2,status:'done'});
  const open=await api.reopenDeadline('demo-deadline-1',2);
  expect(open.record).toMatchObject({version:3,status:'open'});
  const cancelled=await api.cancelDeadline('demo-deadline-1',3);
  expect(cancelled.record).toMatchObject({version:4,status:'cancelled'});
  const restored=await api.restoreDeadline('demo-deadline-1',4);
  expect(restored.record).toMatchObject({version:5,status:'open'});
  await expect(api.restoreDeadline('demo-deadline-1',5)).rejects.toMatchObject({code:'invalid'});
  expect((await createDemoDeadlineApi().getDeadline('demo-deadline-1'))?.status).toBe('open');
 });
 it('deletes only owned deadlines, never read-only project/checkpoint projections',async()=>{
  const api=createDemoDeadlineApi();
  await expect(api.updateDeadline('project-target:project-analysis',1,{title:'bad'}))
   .rejects.toMatchObject({code:'not_found'});
  await expect(api.completeDeadline('checkpoint-due:cp-proof',1))
   .rejects.toMatchObject({code:'not_found'});
  await expect(api.deleteDeadline('project-target:project-analysis',1))
   .rejects.toMatchObject({code:'not_found'});
  const deleted=await api.deleteDeadline('demo-deadline-2',1);
  expect(deleted).toEqual({record:{id:'demo-deadline-2'},actionNo:null});
  expect(await api.getDeadline('demo-deadline-2')).toBeNull();
  expect((await api.listDeadlines()).total).toBe(3);
 });
 it('persists creates, edits, archive status, and delete across reload without touching task/study keys',async()=>{
  const a=createDemoDeadlineApi();
  const newOne=(await a.createDeadline(input)).record;
  await a.cancelDeadline(newOne.id,1);
  await a.deleteDeadline('demo-deadline-4',1);
  const b=createDemoDeadlineApi();
  expect((await b.getDeadline(newOne.id))?.status).toBe('cancelled');
  expect(await b.getDeadline('demo-deadline-4')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.deadlines.v1')).toContain(newOne.id);
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.study.v1')).toBeNull();
 });
 it('rejects invalid record fields and retains the old snapshot on any failure',async()=>{
  const api=createDemoDeadlineApi();
  const before=await api.listDeadlines({statuses:['open','done','cancelled']});
  for(const bad of [
   {...input,title:'   '},{...input,kind:'bad' as never},
   {...input,due:{kind:'date' as const,date:'2026-02-30'}},
   {...input,due:{kind:'instant' as const,at:'2026-11-30T09:00:00'}},
   {...input,due:{kind:'instant' as const,at:'2026-02-30T09:15:00Z'}},
   {...input,due:{kind:'instant' as const,at:'2026-11-31T09:15:00+05:30'}},
   {...input,remainingMinutes:-1},
   {...input,remainingMinutes:1.25},
   {...input,remainingMinutes:null,estimateSource:'owner' as const},
   {...input,subjectId:' '},
  ])await expect(api.createDeadline(bad)).rejects.toMatchObject({code:'invalid'});
  await expect(api.updateDeadline('demo-deadline-1',1,{due:{kind:'date',date:'bad'}}))
   .rejects.toMatchObject({code:'invalid'});
  expect(await api.listDeadlines({statuses:['open','done','cancelled']})).toEqual(before);
 });
 it('recovers from invalid or obsolete local snapshots without copying any live data',async()=>{
  sessionStorage.setItem('lemma.v6.demo.deadlines.v1','{garbage');
  expect((await createDemoDeadlineApi().listDeadlines()).total).toBe(4);
  sessionStorage.setItem('lemma.v6.demo.deadlines.v1',JSON.stringify({schema:99,rows:[{id:'bad'}]}));
  expect((await createDemoDeadlineApi().listDeadlines()).total).toBe(4);
 });
});
