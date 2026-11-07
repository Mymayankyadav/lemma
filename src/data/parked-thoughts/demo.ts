// N58.2.2: isolated tab-local parked-thought demo. The atomic task
// conversion belongs to N58.2.3's single command, never two browser writes.
import {ThoughtError,type NewThought,type ParkedThought,type ThoughtApi,
  type ThoughtPatch,type ThoughtQuery,type ThoughtStatus} from './contract';
import {thoughtTransition,validateNewThought,validateThoughtPatch} from './model';

const KEY='lemma.v6.demo.parked-thoughts.v1';
const STATUS:readonly ThoughtStatus[]=['open','dismissed','converted'];
type Snapshot={schema:1;thoughts:ParkedThought[]};
type Cursor={v:1;status:string;createdAt:string;id:string};
const clone=<T>(x:T):T=>structuredClone(x);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new ThoughtError(code,message);
};
let counter=0;
function newId():string {
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 return 'demo-thought-'+Date.now()+'-'+(++counter);
}
function seed():Snapshot {
 const at='2026-11-06T08:00:00.000Z';
 const make=(id:string,text:string,entry:string|null,status:ThoughtStatus='open'):ParkedThought=>({
  id,text,studyEntryId:entry,status,destinationKind:null,destinationId:null,
  resolvedAt:status==='dismissed'?'2026-11-06T08:30:00.000Z':null,
  version:1,createdAt:at,updatedAt:at,
 });
 return {schema:1,thoughts:[
  make('demo-thought-1','Revisit the lemma assumption','demo-study-entry-1'),
  make('demo-thought-2','Try a counterexample',null),
  make('demo-thought-3','Old reminder',null,'dismissed'),
 ]};
}
function validRow(t:unknown):t is ParkedThought {
 if(!t||typeof t!=='object'||Array.isArray(t))return false;
 const r=t as Partial<ParkedThought>;
 if(typeof r.id!=='string'||!r.id||
  typeof r.text!=='string'||!r.text.trim()||r.text.length>4000||
  !STATUS.includes(r.status as ThoughtStatus)||
  typeof r.version!=='number'||!Number.isSafeInteger(r.version)||r.version<1||
  typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||
  typeof r.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt))||
  !(r.studyEntryId===null||(typeof r.studyEntryId==='string'&&!!r.studyEntryId.trim())))return false;
 if(r.status==='open')return r.resolvedAt===null&&r.destinationKind===null&&r.destinationId===null;
 if(typeof r.resolvedAt!=='string'||!Number.isFinite(Date.parse(r.resolvedAt)))return false;
 if(r.status==='dismissed')return r.destinationKind===null&&r.destinationId===null;
 return r.destinationKind==='task'&&typeof r.destinationId==='string'&&!!r.destinationId.trim();
}
function readStorage():Snapshot|null {
 try {
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const s=value as Partial<Snapshot>;
  if(s.schema!==1||!Array.isArray(s.thoughts)||!s.thoughts.every(validRow))return null;
  if(new Set(s.thoughts.map(x=>x.id)).size!==s.thoughts.length)return null;
  return s as Snapshot;
 } catch {return null;}
}
function writeStorage(snapshot:Snapshot):void {
 try{sessionStorage.setItem(KEY,JSON.stringify(snapshot));}
 catch{/* Storage can be blocked; current adapter still retains its snapshot. */}
}
function validateId(id:string):string {
 if(typeof id!=='string'||!id.trim())fail('invalid','Thought ID is required');
 return id;
}
function compare(a:Pick<ParkedThought,'createdAt'|'id'>,
 b:Pick<ParkedThought,'createdAt'|'id'>):number {
 return a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
}
function encode(record:ParkedThought,status:string):string {
 return btoa(JSON.stringify({v:1,status,createdAt:record.createdAt,id:record.id}))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(raw:string|null|undefined,status:string):Cursor|null {
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||raw.length<4||raw.length>1024||!/^[A-Za-z0-9_-]+$/.test(raw))
   fail('invalid','Invalid thought cursor');
  const value:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4)));
  if(!value||typeof value!=='object')fail('invalid','Invalid thought cursor');
  const c=value as Cursor;
  if(c.v!==1||c.status!==status||typeof c.id!=='string'||!c.id||
   typeof c.createdAt!=='string'||!Number.isFinite(Date.parse(c.createdAt)))
   fail('invalid','Invalid or mismatched thought cursor');
  return c;
 }catch{return fail('invalid','Invalid or mismatched thought cursor');}
}
function queryOptions(q:ThoughtQuery={}):{statuses:ThoughtStatus[];limit:number;cursor:Cursor|null}{
 if(!q||typeof q!=='object'||Array.isArray(q)||
  Object.keys(q).some(key=>!['status','limit','cursor'].includes(key)))
  fail('invalid','Invalid thought query');
 const limit=q.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('invalid','Page size must be 1–50');
 const requested:ThoughtStatus[]=q.status===undefined?['open']:q.status;
 if(!Array.isArray(requested)||!requested.every(s=>STATUS.includes(s)))
  fail('invalid','Invalid thought status filter');
 const statuses=STATUS.filter(s=>requested.includes(s));
 return {statuses,limit,cursor:decode(q.cursor,statuses.join(','))};
}
function receipt<T>(record:T):{record:T;actionNo:null}{
 return {record:clone(record),actionNo:null};
}

export function createDemoThoughtApi():ThoughtApi{
 let snapshot=readStorage()??seed();
 writeStorage(snapshot);
 const current=():Snapshot=>{snapshot=readStorage()??snapshot;return snapshot;};
 const save=(thoughts:ParkedThought[]):void=>{
  snapshot={schema:1,thoughts};
  writeStorage(snapshot);
 };
 const find=(id:string):ParkedThought=>{
  const valid=validateId(id);
  const row=current().thoughts.find(t=>t.id===valid);
  if(!row)return fail('not_found','Parked thought not found');
  return row;
 };
 const version=(t:ParkedThought,expectedVersion:number):void=>{
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
   fail('invalid','Expected version must be positive');
  if(t.version!==expectedVersion)fail('conflict','Parked thought has changed');
 };
 const replace=(row:ParkedThought):void=>{
  save(current().thoughts.map(t=>t.id===row.id?row:t));
 };
 return {
  mode:'demo',
  async listThoughts(q={}){
   const {statuses,limit,cursor}=queryOptions(q);
   const ordered=current().thoughts.filter(t=>statuses.includes(t.status)).sort(compare);
   const page=ordered.filter(t=>!cursor||compare(t,cursor)>0).slice(0,limit+1);
   const items=page.slice(0,limit);
   return {items:clone(items),total:ordered.length,
    nextCursor:page.length>limit&&items.length?encode(items[items.length-1],statuses.join(',')):null};
  },
  async getThought(id){
   const valid=validateId(id);
  const row=current().thoughts.find(t=>t.id===valid);
   return row?clone(row):null;
  },
  async createThought(input:NewThought){
   const n=validateNewThought(input);
   const now=new Date().toISOString();
   const row:ParkedThought={
    id:newId(),text:n.text,studyEntryId:n.studyEntryId??null,
    status:'open',destinationKind:null,destinationId:null,resolvedAt:null,
    version:1,createdAt:now,updatedAt:now,
   };
   save([...current().thoughts,row]);
   return receipt(row);
  },
  async editThought(id:string,expectedVersion:number,input:ThoughtPatch){
   const patch=validateThoughtPatch(input);
   if(Object.keys(patch).length===0)fail('invalid','Empty thought edit');
   const t=find(id);version(t,expectedVersion);
   if(t.status!=='open')fail('invalid','Only open thoughts may be edited');
   const row:ParkedThought={...t,
    ...(patch.text!==undefined?{text:patch.text}:{}),
    ...('studyEntryId'in patch?{studyEntryId:patch.studyEntryId??null}:{}),
    version:t.version+1,updatedAt:new Date().toISOString()};
   replace(row);return receipt(row);
  },
  async dismissThought(id:string,expectedVersion:number){
   const t=find(id);version(t,expectedVersion);
   const now=new Date().toISOString();
   const row:ParkedThought={...t,...thoughtTransition(t,'dismiss',now),
    version:t.version+1,updatedAt:now};
   replace(row);return receipt(row);
  },
  async reopenThought(id:string,expectedVersion:number){
   const t=find(id);version(t,expectedVersion);
   const row:ParkedThought={...t,...thoughtTransition(t,'reopen'),
    version:t.version+1,updatedAt:new Date().toISOString()};
   replace(row);return receipt(row);
  },
  async deleteThought(id:string,expectedVersion:number){
   const t=find(id);version(t,expectedVersion);
   if(t.status==='converted')fail('conflict','Converted task history must be preserved');
   save(current().thoughts.filter(row=>row.id!==t.id));
   return receipt({id:t.id});
  },
  async convertToTask(){
   // A two-storage browser sequence cannot atomically create a real task and
   // resolve the thought. N58.2.3 uses one server receipt for both records.
   throw new Error('Atomic task conversion requires N58.2.3');
  },
 };
}
