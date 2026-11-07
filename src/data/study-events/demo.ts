// N64.2: tab-local study notices, drift and urge events.
// No caller-supplied owner/source/void metadata; all linked records must be demo-owner visible.
import {LemmaError} from '../api';
import {createDemoStudyApi} from '../study/demo';
import {createDemoTaskApi} from '../tasks/demo';
import type {NewStudyEvent,StudyEventApi,StudyEventKind,StudyEventPage,
 StudyEventPatch,StudyEventQuery,StudyEventRecord,StudyEventRelatedKind} from './contract';
import {applyStudyEventPatch,studyEventId,studyEventInstant,studyEventVersion,
 studyEventVoidedAt,validateNewStudyEvent,validateStudyEventQuery} from './model';

type Snapshot={schema:1;events:StudyEventRecord[]};
type Cursor={v:1;f:string;at:string;id:string};
const KEY='lemma.v6.demo.study-events.v1';
const RANGE={start:'2000-01-01T00:00:00Z',end:'2100-01-01T00:00:00Z'};
const KINDS:StudyEventKind[]=['notice','drift','urge'];
const FIELDS=['id','entryId','kind','occurredAt','durationMinutes','note',
 'relatedKind','relatedId','voidedAt','version','source','createdAt','updatedAt'];
const clone=<T>(value:T):T=>structuredClone(value);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new LemmaError(code,message);
};
function newId():string {
 const crypto=globalThis.crypto;
 if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
 if(!crypto?.getRandomValues)return fail('invalid','Secure event ID generation unavailable');
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
  hex.slice(16,20),hex.slice(20)].join('-');
}
function ordered(a:Pick<StudyEventRecord,'occurredAt'|'id'>,
 b:Pick<StudyEventRecord,'occurredAt'|'id'>):number{
 return a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id);
}
function signature(q:StudyEventQuery):string{
 return JSON.stringify([q.entryId??null,
  KINDS.filter(kind=>q.kind?.includes(kind)).join(','),q.includeVoided===true]);
}
function cursorEncode(row:StudyEventRecord,f:string):string{
 return btoa(JSON.stringify({v:1,f,at:row.occurredAt,id:row.id}))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function cursorDecode(raw:string|null|undefined,f:string):Cursor|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{8,1024}$/.test(raw))
   return fail('invalid','Invalid study event cursor');
  const v:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4)));
  if(!v||typeof v!=='object'||Array.isArray(v))
   return fail('invalid','Invalid study event cursor');
  const c=v as Cursor;
  if(c.v!==1||c.f!==f||studyEventInstant(c.at)!==c.at||
   studyEventId(c.id)!==c.id)
   return fail('invalid','Cursor does not match event filters');
  return c;
 }catch{return fail('invalid','Invalid or mismatched study event cursor')}
}
function validRow(row:unknown):row is StudyEventRecord{
 if(!row||typeof row!=='object'||Array.isArray(row))return false;
 const r=row as StudyEventRecord;
 if(Object.keys(r).some(k=>!FIELDS.includes(k)))return false;
 try{
  studyEventId(r.id);studyEventVersion(r.version);
  if(!['app','mcp','worker'].includes(r.source))return false;
  if(studyEventInstant(r.occurredAt)!==r.occurredAt||
     studyEventInstant(r.createdAt)!==r.createdAt||
     studyEventInstant(r.updatedAt)!==r.updatedAt||
     (r.voidedAt!==null&&studyEventInstant(r.voidedAt)!==r.voidedAt))
   return false;
  const normalized=validateNewStudyEvent({entryId:r.entryId,kind:r.kind,
   occurredAt:r.occurredAt,durationMinutes:r.durationMinutes,note:r.note,
   relatedKind:r.relatedKind,relatedId:r.relatedId});
  return JSON.stringify(normalized)===JSON.stringify({
   entryId:r.entryId,kind:r.kind,occurredAt:r.occurredAt,
   durationMinutes:r.durationMinutes,note:r.note,
   relatedKind:r.relatedKind,relatedId:r.relatedId,
  });
 }catch{return false}
}
function storage():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const data=value as Snapshot;
  if(Object.keys(data).some(k=>!['schema','events'].includes(k))||
     data.schema!==1||!Array.isArray(data.events)||
     !data.events.every(validRow))return null;
  if(new Set(data.events.map(e=>e.id)).size!==data.events.length)return null;
  return data;
 }catch{return null}
}
function persist(next:Snapshot):void{
 try{sessionStorage.setItem(KEY,JSON.stringify(next))}
 catch{/* Private tab storage may be disabled. Adapter remains in-memory. */}
}
async function ownerEntries(){
 return createDemoStudyApi().listStudyEntries(RANGE);
}
async function assertLinks(row:Pick<NewStudyEvent,
 'entryId'|'relatedKind'|'relatedId'>):Promise<void>{
 const entries=await ownerEntries();
 if(!entries.some(e=>e.id===row.entryId))
  return fail('conflict','Study entry is absent or no longer demo-owner visible');
 if(row.relatedKind===null||row.relatedKind===undefined)return;
 if(!row.relatedId)return fail('invalid','Related event record ID required');
 let visible=false;
 if(row.relatedKind==='study_entry')
  visible=entries.some(e=>e.id===row.relatedId);
 else if(row.relatedKind==='calendar_block')
  visible=(await createDemoStudyApi().listCalendarBlocks(RANGE))
   .some(b=>b.id===row.relatedId);
 else if(row.relatedKind==='task')
  visible=Boolean(await createDemoTaskApi().getTask(row.relatedId));
 else return fail('invalid','Unsupported related event kind');
 if(!visible)return fail('conflict','Related event record is absent or not demo-owner visible');
}
async function seed():Promise<Snapshot>{
 // Read the actual tab-local StudyApi snapshot; never manufacture foreign IDs.
 const entries=(await ownerEntries()).filter(e=>{
  try{studyEventId(e.id);return true}catch{return false}
 });
 if(!entries.length)return {schema:1,events:[]};
 const at=new Date().toISOString(),entry=entries[0];
 const start=Date.parse(entry.intervals[0]?.start??entry.createdAt);
 const times=[3,8,12].map(min=>new Date(start+min*60_000).toISOString());
 const kinds:StudyEventKind[]=['notice','drift','urge'];
 const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
 return {schema:1,events:kinds.map((kind,i)=>({
  id:ids[i],entryId:entry.id,kind,occurredAt:times[i],
  durationMinutes:kind==='drift'?5:null,
  note:['Noticed a proof strategy','Attention drifted','Noticed an urge'][i],
  relatedKind:null,relatedId:null,voidedAt:null,
  version:1,source:'app' as const,createdAt:at,updatedAt:at,
 }))};
}
let pendingSeed:Promise<Snapshot>|null=null;
function nowAfter(previous?:string):string{
 return new Date(Math.max(Date.now(),previous?Date.parse(previous):0)).toISOString();
}
export function createDemoStudyEventApi():StudyEventApi{
 const stored=storage();
 let snapshot:Snapshot=stored??{schema:1,events:[]};
 let initialized=Boolean(stored);
 let pending:Promise<void>|null=null;
 const ready=async():Promise<void>=>{
  if(initialized)return;
  if(!pending)pending=(async()=>{
   const other=storage();
   if(other){snapshot=other;return}
   if(!pendingSeed)pendingSeed=seed().finally(()=>{pendingSeed=null});
   const seeded=await pendingSeed;
   snapshot=storage()??seeded;
   persist(snapshot);
  })().then(()=>{initialized=true},error=>{pending=null;throw error});
  await pending;
 };
 const current=():Snapshot=>{snapshot=storage()??snapshot;return snapshot};
 const save=(rows:StudyEventRecord[]):void=>{
  snapshot={schema:1,events:clone(rows)};persist(snapshot);
 };
 const lookup=(key:string):StudyEventRecord=>{
  const id=studyEventId(key);
  return current().events.find(e=>e.id===id)??
   fail('not_found','Study event not found');
 };
 const checkVersion=(record:StudyEventRecord,expected:number):void=>{
  studyEventVersion(expected);
  if(record.version!==expected)
   fail('conflict','Study event changed elsewhere (current '+record.version+')');
 };
 const changed=(r:StudyEventRecord):{record:StudyEventRecord;actionNo:null}=>({
  record:clone(r),actionNo:null,
 });
 return {
  mode:'demo',
  async listEvents(query:StudyEventQuery={}):Promise<StudyEventPage>{
   await ready();
   const q=validateStudyEventQuery(query),f=signature(q),cursor=cursorDecode(q.cursor,f);
   const rows=current().events.filter(r=>
    (!q.entryId||r.entryId===q.entryId)&&
    (!q.kind||q.kind.includes(r.kind))&&
    (q.includeVoided||r.voidedAt===null)).sort(ordered);
   const after=rows.filter(r=>!cursor||ordered(r,{
    occurredAt:cursor.at,id:cursor.id})>0);
   const items=after.slice(0,q.limit),last=items.at(-1);
   return {items:clone(items),total:rows.length,
    nextCursor:last&&after.length>q.limit?cursorEncode(last,f):null};
  },
  async getEvent(key:string){
   await ready();const id=studyEventId(key);
   return clone(current().events.find(r=>r.id===id)??null);
  },
  async recordEvent(input:NewStudyEvent){
   await ready();
   const valid=validateNewStudyEvent(input);
   await assertLinks(valid);
   const at=new Date().toISOString();
   const row:StudyEventRecord={
    id:newId(),entryId:valid.entryId,kind:valid.kind,
    occurredAt:valid.occurredAt??at,durationMinutes:valid.durationMinutes??null,
    note:valid.note??null,relatedKind:valid.relatedKind??null,
    relatedId:valid.relatedId??null,voidedAt:null,version:1,source:'app',
    createdAt:at,updatedAt:at,
   };
   save([...current().events,row]);
   return changed(row);
  },
  async editEvent(key:string,expectedVersion:number,patch:StudyEventPatch){
   await ready();
   const before=lookup(key);checkVersion(before,expectedVersion);
   if(before.voidedAt!==null)return fail('conflict','Cannot edit a voided study event');
   // Pure input validation must never see command-managed fields such as
   // id, source, version or voidedAt from the persisted record.
   const {entryId,kind,durationMinutes,note,relatedKind,relatedId}=before;
   const valid=applyStudyEventPatch({
    entryId,kind,durationMinutes,note,relatedKind,relatedId,
   },patch);
   await assertLinks(valid);
   // No awaits between the final version check and save.
   checkVersion(lookup(key),expectedVersion);
   const updated:StudyEventRecord={
    ...before,...valid,occurredAt:valid.occurredAt??before.occurredAt,
    durationMinutes:valid.durationMinutes??null,note:valid.note??null,
    relatedKind:valid.relatedKind??null,relatedId:valid.relatedId??null,
    version:before.version+1,source:'app',updatedAt:nowAfter(before.updatedAt),
   };
   save(current().events.map(r=>r.id===before.id?updated:r));
   return changed(updated);
  },
  async voidEvent(key:string,expectedVersion:number){
   await ready();
   const row=lookup(key);checkVersion(row,expectedVersion);
   const at=nowAfter(row.updatedAt),voidedAt=studyEventVoidedAt(row.voidedAt,'void',at);
   const updated:StudyEventRecord={...row,voidedAt,version:row.version+1,
    updatedAt:at,source:'app'};
   save(current().events.map(r=>r.id===row.id?updated:r));
   return changed(updated);
  },
  async restoreEvent(key:string,expectedVersion:number){
   await ready();
   const row=lookup(key);checkVersion(row,expectedVersion);
   const voidedAt=studyEventVoidedAt(row.voidedAt,'restore');
   await assertLinks(row);
   checkVersion(lookup(key),expectedVersion);
   const updated:StudyEventRecord={...row,voidedAt,version:row.version+1,
    updatedAt:nowAfter(row.updatedAt),source:'app'};
   save(current().events.map(r=>r.id===row.id?updated:r));
   return changed(updated);
  },
 };
}
