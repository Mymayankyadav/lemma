import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoStudyApi} from '../../../src/data/study/demo';
import {createLiveStudyApi} from '../../../src/data/study/live';
import {liveClient} from '../../../src/data/live/client';
import {loggedMinutes} from '../../../src/lib/effort';
import type {StudyEntryRecord} from '../../../src/data/study/contract';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
const start=Date.parse('2026-11-06T09:00:00Z');
const t=(minutes:number)=>new Date(start+minutes*60000).toISOString();
const range={start:t(-20),end:t(95)};
const focus=(start:number,end:number)=>({kind:'focus' as const,start:t(start),end:t(end)});
const study=(overrides:Record<string,unknown>={})=>({
 id:'saved-1',intent:'Study a proof',source:'manual',status:'saved',
 approximate:true,voided_at:null,version:1,
 reflection:null,rating:null,subject_id:null,project_id:null,
 checkpoint_id:null,session_id:null,created_at:t(0),updated_at:t(50),
 saved_at:t(50),study_intervals:[{
  id:'interval-1',kind:'focus',started_at:t(0),ended_at:t(30),
 }],...overrides
});
const block=(overrides:Record<string,unknown>={})=>({
 id:'block-1',kind:'study',title:'Practice',status:'planned',
 starts_at:t(0),ends_at:t(50),time_zone:'UTC',version:1,
 task_id:null,subject_id:null,project_id:null,checkpoint_id:null,session_id:null,
 ...overrides,
});
const minutes=(entries:StudyEntryRecord[])=>loggedMinutes(entries,range,'UTC',t(95)).minutes;

beforeEach(()=>{
 sessionStorage.clear();
 vi.useFakeTimers();
 vi.setSystemTime(new Date(t(120)));
});
afterEach(()=>{
 vi.useRealTimers();
 sessionStorage.clear();
 vi.clearAllMocks();
});

describe('N65 demo StudyApi corrections and manual saved time',()=>{
 it('creates approximate saved time atomically and reloads persisted intervals',async()=>{
  const api=createDemoStudyApi();
  const receipt=await api.createManualStudyEntry({
   intent:'  Proof correction  ',reflection:'Measured afterwards',rating:4,
   subjectId:'subject-1',intervals:[focus(0,10),
    {kind:'break',start:t(10),end:t(20)},focus(20,40)],
  });
  expect(receipt.actionNo).toBeNull();
  expect(receipt.record).toMatchObject({
   source:'manual',status:'saved',approximate:true,
   intent:'Proof correction',rating:4,version:1,subjectId:'subject-1',
  });
  expect(minutes([receipt.record])).toBe(30);
  const reload=createDemoStudyApi();
  const rows=await reload.listStudyEntries(range);
  const stored=rows.find(x=>x.id===receipt.record.id);
  expect(stored).toEqual(receipt.record);
  receipt.record.intervals[0].end=t(999);
  expect((await reload.listStudyEntries(range)).find(x=>x.id===stored!.id)?.intervals[0].end).toBe(t(10));
 });
 it('corrects the whole interval union, guards versions and rejects overlaps without mutation',async()=>{
  const api=createDemoStudyApi();
  const made=(await api.createManualStudyEntry({intent:'Fix proof',intervals:[focus(0,12)]})).record;
  const edited=await api.correctStudyEntry(made.id,1,{intent:'Precise proof',rating:5,
   intervals:[focus(0,10),focus(20,30)]});
  expect(edited.record).toMatchObject({intent:'Precise proof',version:2,rating:5});
  expect(minutes([edited.record])).toBe(20);
  await expect(api.correctStudyEntry(made.id,1,{intent:'Stale'}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.correctStudyEntry(made.id,2,{intervals:[focus(0,20),focus(15,30)]}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.correctStudyEntry(made.id,2,{intervals:[focus(0,0)]}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.correctStudyEntry(made.id,2,{intervals:[{
   kind:'focus',start:'2026-11-06T09:00:00',end:t(30),
  }]})).rejects.toMatchObject({code:'invalid'});
  expect((await createDemoStudyApi().listStudyEntries(range)).find(x=>x.id===made.id))
   .toEqual(edited.record);
 });
 it('splits a closed half-open union across a focus span, retaining exact total and versions',async()=>{
  const api=createDemoStudyApi();
  const made=(await api.createManualStudyEntry({
   intent:'Half-hour practice',intervals:[focus(0,10),
    {kind:'break',start:t(10),end:t(20)},focus(20,40)],
  })).record;
  const parts=await api.splitStudyEntry(made.id,1,t(25));
  expect(parts.actionNo).toBeNull();
  expect(parts.record.original.version).toBe(2);
  expect(parts.record.created).toMatchObject({
   status:'saved',source:'manual',approximate:true,version:1,
  });
  expect(parts.record.created.id).not.toBe(made.id);
  expect(minutes([parts.record.original,parts.record.created])).toBe(30);
  expect(minutes([parts.record.original])).toBe(15);
  expect(minutes([parts.record.created])).toBe(15);
  expect(parts.record.original.intervals.at(-1)?.end).toBe(t(25));
  expect(parts.record.created.intervals[0].start).toBe(t(25));
  await expect(api.splitStudyEntry(made.id,1,t(30)))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.splitStudyEntry(made.id,2,t(-20)))
   .rejects.toMatchObject({code:'invalid'});
  const reloaded=await createDemoStudyApi().listStudyEntries(range);
  expect(reloaded.filter(x=>x.id===parts.record.original.id || x.id===parts.record.created.id))
   .toHaveLength(2);
 });
 it('voids saved time without losing its history and restores with optimistic versions',async()=>{
  const api=createDemoStudyApi();
  const made=(await api.createManualStudyEntry({intent:'Time',intervals:[focus(0,35)]})).record;
  const voided=await api.voidStudyEntry(made.id,1);
  expect(voided.record).toMatchObject({status:'discarded',version:2});
  expect(voided.record.voidedAt).toBeTruthy();
  expect(minutes([voided.record])).toBe(0);
  expect(voided.record.intervals).toEqual(made.intervals);
  await expect(api.restoreStudyEntry(made.id,1)).rejects.toMatchObject({code:'conflict'});
  const restored=await createDemoStudyApi().restoreStudyEntry(made.id,2);
  expect(restored.record).toMatchObject({status:'saved',version:3,voidedAt:null});
  expect(minutes([restored.record])).toBe(35);
  await expect(api.restoreStudyEntry(made.id,3)).rejects.toMatchObject({code:'conflict'});
 });
 it('keeps repeated DST hour as one absolute hour instead of duplicating or dropping it',async()=>{
  const api=createDemoStudyApi();
  const entry=(await api.createManualStudyEntry({intent:'DST study',intervals:[{
   kind:'focus',start:'2026-11-01T05:30:00Z',end:'2026-11-01T06:30:00Z',
  }]})).record;
  const localRange={start:'2026-11-01T04:00:00Z',end:'2026-11-01T08:00:00Z'};
  expect(loggedMinutes([entry],localRange,'America/New_York',localRange.end).minutes).toBe(60);
 });
 it('persists a task-linked calendar block and supports versioned clear without altering others',async()=>{
  const api=createDemoStudyApi();
  const first='11111111-1111-4111-8111-111111111111';
  const created=await api.createCalendarBlock({
   kind:'study',title:'Task practice',startsAt:t(0),endsAt:t(30),
   timeZone:'UTC',taskId:first,
  });
  expect(created.record.taskId).toBe(first);
  const cleared=await api.updateCalendarBlock(created.record.id,1,{taskId:null});
  expect(cleared.record.taskId).toBeNull();
  await expect(api.updateCalendarBlock(created.record.id,1,{taskId:first}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.updateCalendarBlock(created.record.id,2,{taskId:'  '}))
   .rejects.toMatchObject({code:'invalid'});
  expect((await createDemoStudyApi().listCalendarBlocks(range))
   .find(x=>x.id===created.record.id)?.taskId).toBeNull();
 });
});

type Result={data:unknown,error:{message?:string;code?:string}|null};
type Row=Record<string,unknown>;
function liveHarness() {
 const rows:Record<string,Row>={
  'saved-1':study(), 'block-1':block(),
  'manual-2':study({id:'manual-2',intent:'Manual from server',version:1}),
  'created-3':study({id:'created-3',intent:'Split result',version:1}),
 };
 const calls:Array<{fn:string;p:Record<string,unknown>}>=[];
 const reads:string[]=[];
 let failing=false;
 const from=vi.fn((table:string)=>({
  select:(_columns:string)=>({
   eq:(_column:string,key:string)=>({
    maybeSingle:async():Promise<Result>=>{
     reads.push(table+':'+key);
     return {data:rows[key] ?? null,error:null};
    },
   }),
  }),
 }));
 const rpc=vi.fn(async(fn:string,args:{p:Record<string,unknown>}):Promise<Result>=>{
  const p=args.p;calls.push({fn,p});
  if(failing)return {data:{status:'conflict',changed:[],conflict:{currentVersion:9}},error:null};
  const op=p.operation as string;
  const id=(p.target as {id?:string}|undefined)?.id??(op==='create_manual'?'manual-2':'block-1');
  const r=(p.resource==='calendar_blocks'?rows['block-1']:rows[id]);
  if(op==='correct'){
   const patch=p.patch as Record<string,unknown>;
   r.intent=patch.intent??r.intent;
   r.rating=patch.rating??r.rating;
   r.version=Number(r.version)+1;
  } else if(op==='void'){
   r.status='discarded';r.voided_at=t(120);r.version=Number(r.version)+1;
  } else if(op==='restore'){
   r.status='saved';r.voided_at=null;r.version=Number(r.version)+1;
  } else if(op==='create_manual'){
   rows['manual-2']=study({id:'manual-2',source:'manual',approximate:true,
    status:'saved',intent:(p.patch as Record<string,unknown>).intent});
  } else if(op==='split'){
   rows['created-3']=study({id:'created-3',version:1});
   rows['saved-1'].version=Number(rows['saved-1'].version)+1;
   return {data:{status:'ok',changed:[{id:'saved-1',version:rows['saved-1'].version},
    {id:'created-3',version:1}],actionNo:83},error:null};
  } else if(op==='create' && p.resource==='calendar_blocks'){
   rows['block-1']=block({task_id:(p.patch as Record<string,unknown>).task_id??null});
  } else if(op==='update' && p.resource==='calendar_blocks'){
   rows['block-1'].task_id=(p.patch as Record<string,unknown>).task_id;
   rows['block-1'].version=Number(rows['block-1'].version)+1;
  }
  return {data:{status:'ok',changed:[{id,version:Number(r?.version??1)}],actionNo:82},error:null};
 });
 vi.mocked(liveClient).mockReturnValue({from,rpc} as never);
 return {rows,calls,reads,rpc,setFail(value:boolean){failing=value;}};
}
describe('N65 live StudyApi N51 owner RPC parity',()=>{
 it('sends one strict correct envelope with full interval replacement and maps readback',async()=>{
  const h=liveHarness();
  const out=await createLiveStudyApi().correctStudyEntry('saved-1',1,{
   intent:'Revised proof',rating:5,projectId:null,
   intervals:[focus(0,10),focus(20,40)],
  });
  expect(out.actionNo).toBe(82);
  expect(out.record.intent).toBe('Revised proof');
  expect(h.calls[0].fn).toBe('study_command');
  expect(h.calls[0].p).toMatchObject({
   schemaVersion:1,resource:'study_entries',operation:'correct',
   target:{id:'saved-1'},expectedVersion:1,
   patch:{intent:'Revised proof',rating:5,project_id:null,
    intervals:[{kind:'focus',started_at:t(0),ended_at:t(10)},
     {kind:'focus',started_at:t(20),ended_at:t(40)}]},
  });
  expect(h.calls[0].p.operationId).toMatch(/^[\da-f]{8}-[\da-f-]{27,}$/i);
  expect(JSON.stringify(h.calls[0].p)).not.toMatch(/user_id|approximate|voided_at/);
  expect(h.reads).toContain('study_entries:saved-1');
 });
 it('reads both server-changed split IDs and issues no client interval mutations',async()=>{
  const h=liveHarness();
  const out=await createLiveStudyApi().splitStudyEntry('saved-1',1,t(15));
  expect(out.actionNo).toBe(83);
  expect(out.record).toMatchObject({
   original:{id:'saved-1',version:2},created:{id:'created-3',version:1},
  });
  expect(h.calls).toHaveLength(1);
  expect(h.calls[0].p).toMatchObject({
   resource:'study_entries',operation:'split',
   target:{id:'saved-1'},expectedVersion:1,patch:{at:t(15)},
  });
  expect(h.reads).toEqual(['study_entries:saved-1','study_entries:created-3']);
 });
 it('voids and restores with server versions, while keeping a manual record approximate',async()=>{
  const h=liveHarness();
  const api=createLiveStudyApi();
  const voided=await api.voidStudyEntry('saved-1',1);
  expect(voided.record).toMatchObject({status:'discarded',voidedAt:t(120),version:2});
  const restored=await api.restoreStudyEntry('saved-1',2);
  expect(restored.record).toMatchObject({status:'saved',voidedAt:null,version:3});
  const manual=await api.createManualStudyEntry({
   intent:'Manual from server',intervals:[focus(0,30)],
  });
  expect(manual.record).toMatchObject({source:'manual',status:'saved',approximate:true});
  expect(h.calls.map(x=>x.p.operation)).toEqual(['void','restore','create_manual']);
  expect(h.calls[2].p).toMatchObject({resource:'study_entries',
   patch:{intent:'Manual from server',
    intervals:[{kind:'focus',started_at:t(0),ended_at:t(30)}]}});
  expect(JSON.stringify(h.calls[2].p)).not.toMatch(/user_id|source|approximate/);
  expect(new Set(h.calls.map(x=>x.p.operationId)).size).toBe(3);
 });
 it('adds, updates and clears task_id in calendar block commands and maps readback',async()=>{
  const h=liveHarness();
  const api=createLiveStudyApi();
  const task='11111111-1111-4111-8111-111111111111';
  const result=await api.createCalendarBlock({
   kind:'study',title:'Practice',startsAt:t(0),endsAt:t(30),
   timeZone:'UTC',taskId:task,
  });
  expect(result.record.taskId).toBe(task);
  await api.updateCalendarBlock('block-1',1,{taskId:null});
  expect(h.calls.map(x=>x.p.operation)).toEqual(['create','update']);
  expect(h.calls[0].p).toMatchObject({resource:'calendar_blocks',
   patch:{task_id:task}});
  expect(h.calls[1].p).toMatchObject({resource:'calendar_blocks',
   target:{id:'block-1'},expectedVersion:1,patch:{task_id:null}});
 });
 it('rejects malformed intervals before RPC and maps server optimistic conflicts',async()=>{
  const h=liveHarness();
  const api=createLiveStudyApi();
  await expect(api.correctStudyEntry('saved-1',1,{intervals:[focus(0,20),focus(10,30)]}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.createManualStudyEntry({
   intent:'Bad',intervals:[{kind:'focus',start:'2026-11-06T09:00:00',end:t(10)}],
  })).rejects.toMatchObject({code:'invalid'});
  expect(h.calls).toHaveLength(0);
  h.setFail(true);
  await expect(api.voidStudyEntry('saved-1',1)).rejects.toMatchObject({code:'conflict'});
  expect(h.calls[0].p).toMatchObject({expectedVersion:1});
  expect(h.calls[0].p).not.toHaveProperty('user_id');
 });
});
