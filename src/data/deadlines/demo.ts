// N56.1: isolated tab-local demo deadlines; live mode never reads this key.
import {LemmaError} from '../api';
import type {
 DeadlineApi,DeadlineDue,DeadlineKind,DeadlineLinks,DeadlinePatch,DeadlineQuery,
 DeadlineRecord,DeadlineStatus,NewDeadline,
} from './contract';
import type {StudyReceipt} from '../study/contract';

const KEY='lemma.v6.demo.deadlines.v1';
const kinds:DeadlineKind[]=['exam','seminar','assignment','milestone','other'];
const statuses:DeadlineStatus[]=['open','done','cancelled'];
type Snapshot={schema:1;rows:DeadlineRecord[]};
type Cursor={v:1;f:string;k:[string,string]};
const copy=<T>(value:T):T=>structuredClone(value);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{throw new LemmaError(code,message)};
const receipt=<T>(record:T):StudyReceipt<T>=>({record:copy(record),actionNo:null});
let count=0;
function uuid(){
 if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
 return 'demo-deadline-'+Date.now()+'-'+(++count);
}
function civil(value:string):boolean{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);
 const check=new Date(Date.UTC(y,m-1,d));
 return check.getUTCFullYear()===y&&check.getUTCMonth()+1===m&&check.getUTCDate()===d;
}
function due(value:DeadlineDue):DeadlineDue{
 if(!value||typeof value!=='object')return fail('invalid','Deadline due date or instant required');
 if(value.kind==='date'&&Object.keys(value).every(k=>['kind','date'].includes(k))&&civil(value.date))
  return {kind:'date',date:value.date};
 if(value.kind==='instant'&&Object.keys(value).every(k=>['kind','at'].includes(k))&&
  typeof value.at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value.at)&&
  /(Z|[+-]\d\d:\d\d)$/i.test(value.at)&&civil(value.at.slice(0,10))&&
  Number.isFinite(Date.parse(value.at)))
  return {kind:'instant',at:value.at};
 return fail('invalid','Invalid deadline date or timezone-aware instant');
}
function title(value:string):string{
 if(typeof value!=='string'||!value.trim()||value.trim().length>160)
  return fail('invalid','Deadline title must be 1–160 characters');
 return value.trim();
}
function link(value:DeadlineLinks):Required<DeadlineLinks>{
 const out={subjectId:value.subjectId??null,projectId:value.projectId??null,
  checkpointId:value.checkpointId??null};
 if(Object.values(out).some(v=>v!==null&&(typeof v!=='string'||!v.trim())))
  return fail('invalid','Invalid deadline subject, project or checkpoint link');
 return out;
}
function estimate(minutes:number|null,source:'owner'|'derived'|null){
 if(minutes!==null&&(!Number.isSafeInteger(minutes)||minutes<0||minutes>100000))
  return fail('invalid','Remaining effort must be non-negative whole minutes');
 if(minutes===null&&source!==null)return fail('invalid','Estimate source requires remaining minutes');
 if(minutes!==null&&source!=='owner'&&source!=='derived')
  return fail('invalid','Remaining minutes require an estimate source');
 return {remainingMinutes:minutes,estimateSource:source};
}
function seed():Snapshot{
 const created='2026-11-06T09:00:00.000Z';
 const item=(id:string,label:string,kind:DeadlineKind,day:DeadlineDue,
  status:DeadlineStatus,projectId:string|null):DeadlineRecord=>({
  id,title:label,kind,due:day,status,projectId,subjectId:null,checkpointId:null,
  remainingMinutes:60,estimateSource:'owner',origin:'owner',version:1,
  createdAt:created,updatedAt:created,
 });
 return {schema:1,rows:[
  item('demo-deadline-1','Analysis examination','exam',{kind:'date',date:'2026-11-23'},'open','project-analysis'),
  item('demo-deadline-2','Submit topology assignment','assignment',{kind:'instant',at:'2026-11-15T17:30:00+05:30'},'open','project-topology'),
  item('demo-deadline-3','Present last seminar','seminar',{kind:'date',date:'2026-11-03'},'done',null),
  item('demo-deadline-4','Cancelled milestone','milestone',{kind:'date',date:'2026-12-02'},'cancelled',null),
 ]};
}
// These reflect existing project/checkpoint targets, not newly inserted
// deadline rows. Never persist or allow mutation of the projected records.
const projections:DeadlineRecord[]=[
 {id:'project-target:project-analysis',title:'Analysis path target',kind:'milestone',
  due:{kind:'date',date:'2026-11-28'},origin:'project_target',status:'open',
  subjectId:null,projectId:'project-analysis',checkpointId:null,
  remainingMinutes:null,estimateSource:null,version:1,
  createdAt:'2026-11-06T09:00:00.000Z',updatedAt:'2026-11-06T09:00:00.000Z'},
 {id:'checkpoint-due:cp-proof',title:'Proof checkpoint target',kind:'milestone',
  due:{kind:'date',date:'2026-11-19'},origin:'checkpoint_due',status:'open',
  subjectId:null,projectId:'project-analysis',checkpointId:'cp-proof',
  remainingMinutes:null,estimateSource:null,version:1,
  createdAt:'2026-11-06T09:00:00.000Z',updatedAt:'2026-11-06T09:00:00.000Z'},
];
function read():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);if(!raw)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||(value as Snapshot).schema!==1||
   !Array.isArray((value as Snapshot).rows))return null;
  const found=value as Snapshot;
  if(new Set(found.rows.map(x=>x.id)).size!==found.rows.length)return null;
  if(!found.rows.every(r=>
   typeof r.id==='string'&&!!r.id&&r.origin==='owner'&&
   typeof r.title==='string'&&r.title.trim()&&kinds.includes(r.kind)&&
   statuses.includes(r.status)&&Number.isSafeInteger(r.version)&&r.version>0&&
   Number.isFinite(Date.parse(r.createdAt))&&Number.isFinite(Date.parse(r.updatedAt))&&
   (r.remainingMinutes===null||Number.isSafeInteger(r.remainingMinutes)&&r.remainingMinutes>=0)&&
   (r.estimateSource===null||r.estimateSource==='owner'||r.estimateSource==='derived')&&
   !!due(r.due)))return null;
  return found;
 }catch{return null}
}
function save(snapshot:Snapshot){try{sessionStorage.setItem(KEY,JSON.stringify(snapshot))}catch{/*memory fallback*/}}
function key(row:DeadlineRecord):Cursor['k']{
 return [row.due.kind==='date'?row.due.date+'T00:00:00':new Date(row.due.at).toISOString(),row.id];
}
function cmp(a:Cursor['k'],b:Cursor['k']):number{
 return a[0].localeCompare(b[0])||a[1].localeCompare(b[1]);
}
function encode(cursor:Cursor):string{
 return btoa(JSON.stringify(cursor)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(cursor:string,f:string):Cursor{
 try{
  if(typeof cursor!=='string'||cursor.length<4||cursor.length>1000||!/^[A-Za-z0-9_-]+$/.test(cursor))
   return fail('invalid','Invalid deadline cursor');
  const raw=atob(cursor.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-cursor.length%4)%4));
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object')return fail('invalid','Invalid deadline cursor');
  const c=value as Cursor;
  if(c.v!==1||c.f!==f||!Array.isArray(c.k)||c.k.length!==2||
   typeof c.k[0]!=='string'||typeof c.k[1]!=='string'||
   !Number.isFinite(Date.parse(c.k[0]))||!c.k[1])return fail('invalid','Invalid deadline cursor');
  return c;
 }catch{return fail('invalid','Invalid deadline cursor')}
}
function queryOpts(query:DeadlineQuery){
 const limit=query.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)return fail('invalid','Deadline page size must be 1–50');
 const filter=query.statuses??['open'];
 if(!Array.isArray(filter)||!filter.every(s=>statuses.includes(s)))
  return fail('invalid','Invalid deadline status filter');
 if(query.includeProjections!==undefined&&typeof query.includeProjections!=='boolean')
  return fail('invalid','Invalid projections filter');
 const selected=statuses.filter(s=>filter.includes(s));
 const include=query.includeProjections!==false;
 const f=selected.join(',')+':'+include;
 return {selected,include,limit,f,anchor:query.cursor==null?null:decode(query.cursor,f)};
}
function checkVersion(row:DeadlineRecord,expected:number){
 if(!Number.isSafeInteger(expected)||expected!==row.version)
  return fail('conflict','Deadline changed elsewhere; reload current version '+row.version);
}
export function createDemoDeadlineApi():DeadlineApi{
 let snapshot=read()??seed();
 save(snapshot);
 const current=()=>{snapshot=read()??snapshot;return snapshot};
 const persist=(rows:DeadlineRecord[])=>{snapshot={schema:1,rows};save(snapshot)};
 const own=(id:string,version:number)=>{
  const row=current().rows.find(x=>x.id===id);
  if(!row)return fail('not_found','Deadline not found or is a read-only target projection');
  checkVersion(row,version);
  return row;
 };
 const change=(id:string,version:number,patch:Partial<DeadlineRecord>)=>{
  const old=own(id,version),now=new Date().toISOString();
  const updated:DeadlineRecord={...old,...patch,version:old.version+1,updatedAt:now};
  persist(current().rows.map(x=>x.id===id?updated:x));
  return receipt(updated);
 };
 return {
  mode:'demo',
  async listDeadlines(query={}){
   const {selected,include,limit,f,anchor}=queryOpts(query);
   const all=[...current().rows,...(include?projections:[])].filter(x=>selected.includes(x.status))
    .sort((a,b)=>cmp(key(a),key(b)));
   const start=anchor?all.findIndex(x=>cmp(key(x),anchor.k)>0):0;
   const page=start<0?[]:all.slice(start,start+limit);
   const end=start<0?all.length:start+page.length;
   return {items:copy(page),total:all.length,
    nextCursor:end<all.length&&page.length?
     encode({v:1,f,k:key(page[page.length-1])}):null};
  },
  async getDeadline(id){return copy(current().rows.find(x=>x.id===id)??projections.find(x=>x.id===id)??null)},
  async createDeadline(input:NewDeadline){
   if(!kinds.includes(input.kind))return fail('invalid','Invalid deadline kind');
   const projected=due(input.due),links=link(input);
   const minutes=input.remainingMinutes??null,source=input.estimateSource??(minutes===null?null:'owner');
   const est=estimate(minutes,source);
   const now=new Date().toISOString();
   const row:DeadlineRecord={id:uuid(),title:title(input.title),kind:input.kind,due:projected,
    ...links,...est,status:'open',origin:'owner',version:1,createdAt:now,updatedAt:now};
   persist([...current().rows,row]);return receipt(row);
  },
  async updateDeadline(id,expectedVersion,patch:DeadlinePatch){
   const old=own(id,expectedVersion);
   const minutes=patch.remainingMinutes===undefined?old.remainingMinutes:patch.remainingMinutes;
   const source=patch.estimateSource===undefined?old.estimateSource:patch.estimateSource;
   const updated:Partial<DeadlineRecord>={
    title:patch.title===undefined?old.title:title(patch.title),
    kind:patch.kind??old.kind,due:patch.due===undefined?old.due:due(patch.due),
    ...estimate(minutes,source),
    ...link({subjectId:patch.subjectId===undefined?old.subjectId:patch.subjectId,
      projectId:patch.projectId===undefined?old.projectId:patch.projectId,
      checkpointId:patch.checkpointId===undefined?old.checkpointId:patch.checkpointId}),
   };
   if(!kinds.includes(updated.kind!))return fail('invalid','Invalid deadline kind');
   return change(id,expectedVersion,updated);
  },
  async completeDeadline(id,expectedVersion){return change(id,expectedVersion,{status:'done'})},
  async reopenDeadline(id,expectedVersion){return change(id,expectedVersion,{status:'open'})},
  async cancelDeadline(id,expectedVersion){return change(id,expectedVersion,{status:'cancelled'})},
  async restoreDeadline(id,expectedVersion){
   const old=own(id,expectedVersion);
   if(old.status!=='cancelled')return fail('invalid','Only cancelled deadlines may be restored');
   return change(id,expectedVersion,{status:'open'});
  },
  async deleteDeadline(id,expectedVersion){
   own(id,expectedVersion);
   persist(current().rows.filter(x=>x.id!==id));return receipt({id});
  },
 };
}
