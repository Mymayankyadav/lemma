import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoDeadlineApi} from '../../../src/data/deadlines/demo';
const KEY='lemma.v6.demo.deadlines.v1';
const at='2026-11-06T12:00:00.000Z';
const draft={title:' Thesis defense ',kind:'seminar' as const,
 due:{kind:'instant' as const,at:'2026-12-12T16:30:00+05:30'},
 remainingMinutes:180,estimateSource:'owner' as const,
 projectId:'project-analysis'};
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date(at));});
afterEach(()=>{vi.useRealTimers();sessionStorage.clear();});
describe('N56 demo deadlines with projected reads and lifecycle writes',()=>{
 it('seeds separate real and projected deadlines without persisting projection rows',async()=>{
  const api=createDemoDeadlineApi();
  const page=await api.listDeadlines();
  expect(page).toMatchObject({total:4,nextCursor:null});
  expect(page.items.filter(x=>x.origin==='deadline')).toHaveLength(3);
  const projection=page.items.find(x=>x.origin==='project_target')!;
  expect(projection.due).toEqual({kind:'date',date:'2026-12-15'});
  expect(projection.projectId).toBe('project-topology');
  expect(await api.getDeadline(projection.id)).toEqual(projection);
  expect(JSON.parse(sessionStorage.getItem(KEY)!).items).toHaveLength(3);
  await expect(api.completeDeadline(projection.id,1)).rejects.toMatchObject({code:'invalid'});
  await expect(api.deleteDeadline(projection.id,1)).rejects.toMatchObject({code:'invalid'});
 });
 it('creates validated date/instant records and isolates the returned object',async()=>{
  const api=createDemoDeadlineApi();
  const saved=await api.createDeadline(draft);
  expect(saved).toMatchObject({actionNo:null,record:{
   title:'Thesis defense',kind:'seminar',due:draft.due,projectId:'project-analysis',
   status:'open',source:'app',origin:'deadline',version:1,
   remainingMinutes:180,estimateSource:'owner',
  }});
  saved.record.title='Edited client copy';
  expect((await api.getDeadline(saved.record.id))?.title).toBe('Thesis defense');
  const civil=await api.createDeadline({title:'Exam',kind:'exam',due:{kind:'date',date:'2026-11-19'}});
  expect(civil.record.due).toEqual({kind:'date',date:'2026-11-19'});
  expect(civil.record.remainingMinutes).toBeNull();
 });
 it('persists edits, complete/reopen and cancel/restore with strict optimistic versions',async()=>{
  const a=createDemoDeadlineApi(),b=createDemoDeadlineApi();
  const row=(await a.createDeadline(draft)).record,id=row.id;
  const done=await a.completeDeadline(id,1);
  expect(done.record).toMatchObject({status:'done',version:2});
  await expect(b.updateDeadline(id,1,{title:'Stale'})).rejects.toMatchObject({code:'conflict'});
  await expect(b.cancelDeadline(id,1)).rejects.toMatchObject({code:'conflict'});
  await expect(a.completeDeadline(id,2)).rejects.toMatchObject({code:'invalid'});
  const reopened=await b.reopenDeadline(id,2);
  expect(reopened.record).toMatchObject({status:'open',version:3});
  const cancelled=await a.cancelDeadline(id,3);
  expect(cancelled.record.status).toBe('cancelled');
  const restored=await b.restoreDeadline(id,4);
  expect(restored.record).toMatchObject({status:'open',version:5});
  const edited=await a.updateDeadline(id,5,{remainingMinutes:90,
   estimateSource:'derived',due:{kind:'date',date:'2026-12-16'}});
  expect(edited.record).toMatchObject({version:6,estimateSource:'derived',
   due:{kind:'date',date:'2026-12-16'},remainingMinutes:90});
  expect(await createDemoDeadlineApi().getDeadline(id)).toEqual(edited.record);
  expect((await a.deleteDeadline(id,6)).record).toEqual({id});
  expect(await b.getDeadline(id)).toBeNull();
 });
 it('bounds paging with opaque cursor, exact total and filter matching',async()=>{
  const api=createDemoDeadlineApi();
  for(let i=0;i<55;i++)
   await api.createDeadline({title:'Exam '+i,kind:'exam',due:{kind:'date',date:'2026-12-01'}});
  const found=new Set<string>();let cursor:string|null=null;
  for(let i=0;i<10;i++){
   const page=await api.listDeadlines({limit:9,cursor});
   expect(page.total).toBe(59);
   expect(page.items.length).toBeLessThanOrEqual(9);
   for(const row of page.items)found.add(row.id);
   cursor=page.nextCursor;
   if(!cursor)break;
   expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  }
  expect(found.size).toBe(59);
  const open=await api.listDeadlines({status:['open']});
  expect(open.total).toBe(58);
  await expect(api.listDeadlines({cursor:'%%%'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({status:['done'],cursor:cursor??'%%%'})).rejects.toMatchObject({code:'invalid'});
 });
 it('rejects invalid civil dates, unzoned instants and estimates without changing state',async()=>{
  const api=createDemoDeadlineApi(),before=await api.listDeadlines();
  const invalid=[
   {...draft,title:'  '},{...draft,kind:'urgent'}, 
   {...draft,due:{kind:'date',date:'2026-02-30'}},
   {...draft,due:{kind:'instant',at:'2026-12-12T10:00'}},
   {...draft,remainingMinutes:-1},{...draft,remainingMinutes:0.25},
  ];
  for(const item of invalid)
   await expect(api.createDeadline(item as never)).rejects.toMatchObject({code:'invalid'});
  expect(await api.listDeadlines()).toEqual(before);
 });
 it('recovers from malformed storage without reading Tasks or Study keys',async()=>{
  sessionStorage.setItem(KEY,'{corrupt');
  expect((await createDemoDeadlineApi().listDeadlines()).total).toBe(4);
  sessionStorage.setItem(KEY,JSON.stringify({schema:99,items:[]}));
  expect((await createDemoDeadlineApi().listDeadlines()).total).toBe(4);
  await createDemoDeadlineApi().createDeadline(draft);
  expect(sessionStorage.getItem(KEY)).toContain('Thesis defense');
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.study.v1')).toBeNull();
 });
});
