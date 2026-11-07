import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoStudyEventApi} from '../../../src/data/study-events/demo';
import {createDemoStudyApi} from '../../../src/data/study/demo';
import {createDemoTaskApi} from '../../../src/data/tasks/demo';
import type {StudyEventRecord} from '../../../src/data/study-events/contract';

const KEY='lemma.v6.demo.study-events.v1';
const RANGE={start:'2000-01-01T00:00:00Z',end:'2100-01-01T00:00:00Z'};
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
beforeEach(()=>{
 sessionStorage.clear();vi.useFakeTimers();
 vi.setSystemTime(new Date('2026-11-07T12:00:00.000Z'));
});
afterEach(()=>{sessionStorage.clear();vi.useRealTimers()});

describe('N64.2 owner-bound persistent study-event demo lifecycle',()=>{
 it('initializes real tab-local owner entry IDs for notice, drift and urge fixtures',async()=>{
  const api=createDemoStudyEventApi();
  const list=await api.listEvents();
  expect(api.mode).toBe('demo');
  expect(list).toMatchObject({total:3,nextCursor:null});
  expect(list.items.map(e=>e.kind)).toEqual(['notice','drift','urge']);
  const current=await createDemoStudyApi().listStudyEntries(RANGE);
  expect(list.items.every(e=>current.some(row=>row.id===e.entryId))).toBe(true);
  expect(list.items.every(e=>e.voidedAt===null&&e.version===1&&e.source==='app'))
   .toBe(true);
  expect(list.items.find(e=>e.kind==='drift')?.durationMinutes).toBe(5);
  expect(list.items.find(e=>e.kind==='notice')?.durationMinutes).toBeNull();
  expect(list.items[0]).not.toHaveProperty('userId');
 });
 it('supports record/edit/void/restore with reload and optimistic conflict isolation',async()=>{
  const first=createDemoStudyEventApi(),second=createDemoStudyEventApi();
  const entryId=(await first.listEvents()).items[0].entryId;
  const created=await first.recordEvent({entryId,kind:'drift',
   occurredAt:'2026-11-07T13:30:00+05:30',durationMinutes:12,note:'Observed'});
  expect(created).toMatchObject({actionNo:null,record:{
   kind:'drift',occurredAt:'2026-11-07T08:00:00.000Z',
   durationMinutes:12,version:1,source:'app',voidedAt:null}});
  const key=created.record.id;
  expect((await second.getEvent(key))?.note).toBe('Observed');
  const updated=await second.editEvent(key,1,{note:'Corrected',durationMinutes:9});
  expect(updated.record).toMatchObject({version:2,note:'Corrected',durationMinutes:9});
  await expect(first.editEvent(key,1,{note:'Lost'}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(first.voidEvent(key,1)).rejects.toMatchObject({code:'conflict'});
  const voided=await first.voidEvent(key,2);
  expect(voided.record).toMatchObject({version:3,voidedAt:expect.any(String)});
  expect((await second.listEvents()).items.some(e=>e.id===key)).toBe(false);
  expect((await second.listEvents({includeVoided:true})).items.some(e=>e.id===key))
   .toBe(true);
  await expect(second.voidEvent(key,3)).rejects.toMatchObject({code:'invalid'});
  const restored=await second.restoreEvent(key,3);
  expect(restored.record).toMatchObject({version:4,voidedAt:null});
  expect((await createDemoStudyEventApi().getEvent(key))?.version).toBe(4);
  await expect(first.restoreEvent(key,4)).rejects.toMatchObject({code:'invalid'});
  expect(sessionStorage.getItem(KEY)).toContain('"source":"app"');
  expect(sessionStorage.getItem(KEY)).not.toContain('user_id');
 });
 it('requires valid complete drift/kind edits and rejects forged ownership/provenance',async()=>{
  const api=createDemoStudyEventApi(),entryId=(await api.listEvents()).items[0].entryId;
  const row=(await api.recordEvent({entryId,kind:'drift',durationMinutes:3})).record;
  await expect(api.editEvent(row.id,1,{kind:'urge'}))
   .rejects.toMatchObject({code:'invalid'});
  const changed=await api.editEvent(row.id,1,{kind:'urge',durationMinutes:null});
  expect(changed.record).toMatchObject({kind:'urge',durationMinutes:null,version:2});
  for(const patch of [{source:'mcp'},{user_id:uuid(999)},{voidedAt:'2026-11-07T00:00:00Z'}]){
   await expect(api.editEvent(row.id,2,patch as never))
    .rejects.toMatchObject({code:'invalid'});
  }
  await expect(api.recordEvent({entryId,kind:'notice',userId:uuid(999)} as never))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordEvent({entryId:uuid(999),kind:'notice'}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.recordEvent({entryId,kind:'notice',durationMinutes:1}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordEvent({entryId,kind:'notice',relatedKind:'task',relatedId:uuid(999)}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.getEvent(uuid(999))).resolves.toBeNull();
 });
 it('enforces owner-visible task, calendar block and study-entry links on restore',async()=>{
  const study=createDemoStudyApi(),tasks=createDemoTaskApi();
  const api=createDemoStudyEventApi();
  const entryId=(await api.listEvents()).items[0].entryId;
  const task=(await tasks.createTask({title:'Demo linked thought'})).record;
  const block=(await study.createCalendarBlock({kind:'study',title:'Demo block',
   startsAt:'2026-11-07T09:00:00Z',endsAt:'2026-11-07T09:45:00Z',timeZone:'UTC'})).record;
  const linkedTask=(await api.recordEvent({entryId,kind:'notice',
   relatedKind:'task',relatedId:task.id})).record;
  const linkedBlock=(await api.recordEvent({entryId,kind:'urge',
   relatedKind:'calendar_block',relatedId:block.id})).record;
  const linkedEntry=(await api.recordEvent({entryId,kind:'notice',
   relatedKind:'study_entry',relatedId:entryId})).record;
  expect(linkedTask.relatedId).toBe(task.id);
  expect(linkedBlock.relatedId).toBe(block.id);
  expect(linkedEntry.relatedId).toBe(entryId);
  await api.voidEvent(linkedTask.id,1);
  await tasks.deleteTask(task.id,task.version);
  await expect(api.restoreEvent(linkedTask.id,2))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.editEvent(linkedBlock.id,1,{relatedKind:'task',relatedId:task.id}))
   .rejects.toMatchObject({code:'conflict'});
  await study.deleteCalendarBlock(block.id,block.version);
  await expect(api.restoreEvent(linkedBlock.id,1))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('walks >50 filter-bound keyset pages with exact totals and no duplicate records',async()=>{
  createDemoStudyEventApi();
  const api=createDemoStudyEventApi();
  const initial=await api.listEvents();
  const sample=initial.items[0];
  const start=Date.parse('2026-11-07T09:00:00Z');
  const rows:StudyEventRecord[]=Array.from({length:56},(_,i)=>({
   ...sample,id:uuid(300+i),kind:'notice',durationMinutes:null,
   occurredAt:new Date(start+i*60_000).toISOString(),
   voidedAt:i%8===0?'2026-11-07T12:00:00.000Z':null,
   note:'Notice '+i,
  }));
  sessionStorage.setItem(KEY,JSON.stringify({schema:1,events:rows}));
  const reloaded=createDemoStudyEventApi();
  const seen:string[]=[];let cursor:string|null=null;
  for(let n=0;n<12;n++){
   const page=await reloaded.listEvents({includeVoided:true,limit:6,cursor});
   expect(page.total).toBe(56);
   seen.push(...page.items.map(x=>x.id));
   cursor=page.nextCursor;
   if(cursor===null)break;
  }
  expect(seen).toHaveLength(56);
  expect(new Set(seen).size).toBe(56);
  const active=await reloaded.listEvents();
  expect(active.total).toBe(49);
  const first=await reloaded.listEvents({includeVoided:true,limit:2});
  await expect(reloaded.listEvents({limit:2,cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(reloaded.listEvents({kind:['drift'],includeVoided:true,
   limit:2,cursor:first.nextCursor})).rejects.toMatchObject({code:'invalid'});
  const other=await reloaded.listEvents({entryId:uuid(888),includeVoided:true});
  expect(other).toMatchObject({total:0,items:[],nextCursor:null});
  first.items[0].note='tampered';
  expect((await reloaded.getEvent(first.items[0].id))?.note).not.toBe('tampered');
  await expect(reloaded.listEvents({userId:uuid(888)} as never))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('fails closed on corrupt tab storage with forged owners or invalid rows',async()=>{
  const api=createDemoStudyEventApi();
  await api.listEvents();
  const parsed=JSON.parse(sessionStorage.getItem(KEY)!);
  parsed.events[0].user_id=uuid(888);
  sessionStorage.setItem(KEY,JSON.stringify(parsed));
  const fresh=createDemoStudyEventApi();
  const repaired=await fresh.listEvents();
  expect(repaired.total).toBe(3);
  expect(repaired.items[0]).not.toHaveProperty('user_id');
  expect(sessionStorage.getItem(KEY)).not.toContain('user_id');
  sessionStorage.setItem(KEY,'{malformed');
  expect((await createDemoStudyEventApi().listEvents()).total).toBe(3);
 });
});
