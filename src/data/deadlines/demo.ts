// N56.1: tab-persistent demo deadlines. Project/checkpoint dates are read-only projections.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {
 DeadlineApi,DeadlineDue,DeadlineKind,DeadlineLinks,DeadlinePage,
 DeadlinePatch,DeadlineQuery,DeadlineRecord,DeadlineStatus,EstimateSource,NewDeadline,
} from './contract';

const KEY='lemma.v6.demo.deadlines.v1';
const KINDS:DeadlineKind[]=['exam','seminar','assignment','milestone','other'];
const STATES:DeadlineStatus[]=['open','done','cancelled'];
type Snapshot={schema:1;deadlines:DeadlineRecord[]};
type Cursor={v:1;statuses:string;offset:number};
let backup:Snapshot|null=null,sequence=0;
const copy=<T>(value:T):T=>structuredClone(value);
function fail(code:'invalid'|'conflict'|'not_found',message:string):never {throw new LemmaError(code,message);}
function dateOnly(date:string):boolean {
 if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date))return false;
 const [year,month,day]=date.split('-').map(Number);
 const d=new Date(0);d.setUTCHours(0,0,0,0);d.setUTCFullYear(year,month-1,day);
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}
function validDue(due:DeadlineDue):DeadlineDue {
 if(!due||typeof due!=='object')return fail('invalid','Choose a due date or instant.');
 if(due.kind==='date'&&dateOnly(due.date))return {kind:'date',date:due.date};
 if(due.kind==='instant'&&typeof due.at==='string'&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(due.at)&&/(Z|[+-]\d\d:\d\d)$/i.test(due.at)&&
    Number.isFinite(Date.parse(due.at)))return {kind:'instant',at:new Date(due.at).toISOString()};
 return fail('invalid','Invalid civil due date or time-zone-aware due instant.');
}
function title(value:string):string {
 if(typeof value!=='string'||!value.trim()||value.trim().length>200)
  return fail('invalid','Title must contain 1–200 characters.');
 return value.trim();
}
function kind(value:DeadlineKind):DeadlineKind {
 if(!KINDS.includes(value))return fail('invalid','Invalid deadline kind.');
 return value;
}
function links(value:DeadlineLinks,prior?:DeadlineRecord):Required<DeadlineLinks> {
 const out={subjectId:prior?.subjectId??null,projectId:prior?.projectId??null,
  checkpointId:prior?.checkpointId??null};
 for(const field of ['subjectId','projectId','checkpointId'] as const) {
  if(value[field]===undefined)continue;
  const item=value[field];
  if(item!==null&&(typeof item!=='string'||!item.trim()))
   return fail('invalid','Invalid deadline link.');
  out[field]=item??null;
 }
 return out;
}
function estimate(minutes:number|null,source:EstimateSource|null) {
 if(minutes===null) {
  if(source!==null)return fail('invalid','An estimate source requires minutes.');
  return {remainingMinutes:null,estimateSource:null};
 }
 if(!Number.isSafeInteger(minutes)||minutes<0||minutes>100000)
  return fail('invalid','Remaining effort must be 0–100000 whole minutes.');
 if(source!=='owner'&&source!=='derived')return fail('invalid','Estimate source is required.');
 return {remainingMinutes:minutes,estimateSource:source};
}
function makeId():string {
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 return 'demo-deadline-'+Date.now()+'-'+(++sequence);
}
function receipt<T>(record:T):StudyReceipt<T>{return {record:copy(record),actionNo:null};}
const fixtureTime='2026-11-06T08:00:00.000Z';
function row(id:string,name:string,due:DeadlineDue,origin:DeadlineRecord['origin'],
 projectId:string|null=null,checkpointId:string|null=null):DeadlineRecord {
 return {id,title:name,kind:origin==='standalone'?'exam':'milestone',due,status:'open',
  remainingMinutes:origin==='standalone'?90:null,estimateSource:origin==='standalone'?'owner':null,
  origin,subjectId:null,projectId,checkpointId,version:1,createdAt:fixtureTime,updatedAt:fixtureTime};
}
function seed():Snapshot {
 return {schema:1,deadlines:[
  row('demo-deadline-1','Analysis exam',{kind:'date',date:'2026-11-15'},'standalone'),
  row('demo-deadline-2','Seminar draft',{kind:'instant',at:'2026-11-18T11:30:00.000Z'},'standalone'),
 ]};
}
// These records project existing demo plan dates; they are never persisted as
// duplicate authoritative deadline rows or accepted by a write operation.
function projections():DeadlineRecord[] {
 return [
  row('project-target:analysis','Analysis path target',{kind:'date',date:'2026-11-20'},
   'project_target','project-analysis'),
  row('checkpoint-due:cp1','Checkpoint CP1 due',{kind:'date',date:'2026-11-12'},
   'checkpoint_due','project-analysis','checkpoint-analysis-1'),
 ];
}
function isSnapshot(raw:unknown):raw is Snapshot {
 if(!raw||typeof raw!=='object')return false;
 const value=raw as Partial<Snapshot>;
 return value.schema===1&&Array.isArray(value.deadlines)&&
  value.deadlines.every(d=>d&&typeof d.id==='string'&&d.origin==='standalone'&&
   STATES.includes(d.status)&&Number.isSafeInteger(d.version)&&d.version>0);
}
function load():Snapshot {
 try {
  const raw=sessionStorage.getItem(KEY);
  if(raw) {
   let parsed:unknown=null;
   try{parsed=JSON.parse(raw);}catch{/* broken storage resets to seed */}
   if(isSnapshot(parsed)){backup=copy(parsed);return copy(parsed);}
  }
  const fresh=seed();backup=copy(fresh);sessionStorage.setItem(KEY,JSON.stringify(fresh));
  return copy(fresh);
 } catch {
  if(!backup)backup=seed();
  return copy(backup);
 }
}
function save(snapshot:Snapshot) {
 backup=copy(snapshot);
 try{sessionStorage.setItem(KEY,JSON.stringify(snapshot));}catch{/* in-memory tab fallback */}
}
const all=()=>[...load().deadlines,...projections()];
function key(r:DeadlineRecord) {
 return r.due.kind==='date'?r.due.date+'T00:00:00':r.due.at;
}
function sorted(records:DeadlineRecord[]):DeadlineRecord[] {
 return records.sort((a,b)=>key(a).localeCompare(key(b))||
  a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
function page(query:DeadlineQuery={}):DeadlinePage {
 const limit=query.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)return fail('invalid','Limit must be 1–50.');
 const statuses=query.statuses??['open'];
 if(!Array.isArray(statuses)||statuses.some(s=>!STATES.includes(s))||
   new Set(statuses).size!==statuses.length)return fail('invalid','Invalid status filter.');
 const filter=[...statuses].sort().join(',');
 let offset=0;
 if(query.cursor) {
  try {
   const parsed=JSON.parse(atob(query.cursor.replace(/-/g,'+').replace(/_/g,'/'))) as Cursor;
   if(parsed.v!==1||parsed.statuses!==filter||!Number.isSafeInteger(parsed.offset)||parsed.offset<0)
    return fail('invalid','Cursor does not match deadline filter.');
   offset=parsed.offset;
  }catch{return fail('invalid','Invalid deadline cursor.');}
 }
 const items=sorted(all().filter(r=>statuses.includes(r.status)));
 if(offset>items.length)return fail('invalid','Cursor is past the end.');
 const slice=items.slice(offset,offset+limit);
 const next=offset+limit<items.length
  ? btoa(JSON.stringify({v:1,statuses:filter,offset:offset+limit} satisfies Cursor))
     .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
  :null;
 return {items:copy(slice),total:items.length,nextCursor:next};
}
function lookup(snapshot:Snapshot,id:string,expectedVersion:number):DeadlineRecord {
 const current=snapshot.deadlines.find(r=>r.id===id);
 if(!current) {
  if(projections().some(r=>r.id===id))return fail('invalid','Projected dates are read-only.');
  return fail('not_found','Deadline not found.');
 }
 if(!Number.isSafeInteger(expectedVersion)||current.version!==expectedVersion)
  return fail('conflict','Deadline version changed elsewhere.');
 return current;
}
function replace(snapshot:Snapshot,record:DeadlineRecord) {
 snapshot.deadlines=snapshot.deadlines.map(r=>r.id===record.id?record:r);
 save(snapshot);
 return receipt(record);
}
function change(id:string,expectedVersion:number,to:DeadlineStatus,from:DeadlineStatus) {
 const snapshot=load(),current=lookup(snapshot,id,expectedVersion);
 if(current.status!==from)return fail('invalid','Invalid deadline status transition.');
 return replace(snapshot,{...current,status:to,version:current.version+1,updatedAt:new Date().toISOString()});
}
export function createDemoDeadlineApi():DeadlineApi {
 return {
  mode:'demo',
  async listDeadlines(query){return page(query);},
  async getDeadline(id){return copy(all().find(r=>r.id===id)??null);},
  async createDeadline(input:NewDeadline) {
   const now=new Date().toISOString(),snapshot=load();
   const minutes=input.remainingMinutes??null;
   const source=minutes===null?(input.estimateSource??null):(input.estimateSource??'owner');
   const record:DeadlineRecord={
    id:makeId(),title:title(input.title),kind:kind(input.kind),due:validDue(input.due),
    ...links(input),...estimate(minutes,source),status:'open',origin:'standalone',
    version:1,createdAt:now,updatedAt:now,
   };
   snapshot.deadlines.push(record);save(snapshot);
   return receipt(record);
  },
  async updateDeadline(id,expectedVersion,patch:DeadlinePatch) {
   const snapshot=load(),current=lookup(snapshot,id,expectedVersion);
   const remaining=patch.remainingMinutes===undefined?current.remainingMinutes:patch.remainingMinutes;
   const source=patch.estimateSource===undefined?current.estimateSource:patch.estimateSource;
   const updated:DeadlineRecord={...current,...links(patch,current),
    ...estimate(remaining,source),
    title:patch.title===undefined?current.title:title(patch.title),
    kind:patch.kind===undefined?current.kind:kind(patch.kind),
    due:patch.due===undefined?current.due:validDue(patch.due),
    version:current.version+1,updatedAt:new Date().toISOString()};
   return replace(snapshot,updated);
  },
  async completeDeadline(id,version){return change(id,version,'done','open');},
  async reopenDeadline(id,version){return change(id,version,'open','done');},
  async cancelDeadline(id,version){return change(id,version,'cancelled','open');},
  async restoreDeadline(id,version){return change(id,version,'open','cancelled');},
  async deleteDeadline(id,expectedVersion) {
   const snapshot=load();lookup(snapshot,id,expectedVersion);
   snapshot.deadlines=snapshot.deadlines.filter(r=>r.id!==id);save(snapshot);
   return receipt({id});
  },
 };
}
