import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {GoalApi,GoalPatch,GoalQuery,GoalRecord,NewGoal} from './contract';

type Row=Record<string,unknown>;
type Failure={message?:string;code?:string};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const invalid=(msg:string):never=>{throw new LemmaError('invalid',msg)};
async function client(){return (await import('../live/client')).liveClient();}
function uuid(){
 if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
 const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
 return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20);
}
function id(v:string){if(typeof v!=='string'||!UUID.test(v))return invalid('Goal ID must be a UUID');return v}
function date(v:string){
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v))return invalid('Goal date must be YYYY-MM-DD');
 const d=new Date(v+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)return invalid('Invalid goal date');
 return v;
}
function zone(v:string){
 if(typeof v!=='string'||!v.trim()||v.length>100)return invalid('Time zone required');
 try{new Intl.DateTimeFormat('en-US',{timeZone:v}).format(new Date());}
 catch{return invalid('Invalid IANA time zone');}
 return v;
}
function minutes(n:number){if(!Number.isSafeInteger(n)||n<1||n>100000)return invalid('Invalid target minutes');return n}
function version(n:number){if(!Number.isSafeInteger(n)||n<1)return invalid('Expected positive goal version');return n}
function scope(v:string|null|undefined){if(v!==null&&v!==undefined)id(v);return v}
function createPatch(g:NewGoal):Row{
 if(!g||!['week','month','custom'].includes(g.period))return invalid('Invalid goal period');
 const start=date(g.startDate),end=date(g.endDate);
 if(start>end)return invalid('Goal end must not precede start');
 return {period:g.period,start_date:start,end_date:end,time_zone:zone(g.timeZone),
  target_minutes:minutes(g.targetMinutes),subject_id:scope(g.subjectId)??null,project_id:scope(g.projectId)??null};
}
function updatePatch(p:GoalPatch):Row{
 if(!p||typeof p!=='object')return invalid('Goal patch required');
 const patch:Row={};
 if(p.period!==undefined){if(!['week','month','custom'].includes(p.period))return invalid('Invalid period');patch.period=p.period}
 if(p.startDate!==undefined)patch.start_date=date(p.startDate);
 if(p.endDate!==undefined)patch.end_date=date(p.endDate);
 if(p.startDate!==undefined&&p.endDate!==undefined&&p.startDate>p.endDate)return invalid('Invalid date range');
 if(p.timeZone!==undefined)patch.time_zone=zone(p.timeZone);
 if(p.targetMinutes!==undefined)patch.target_minutes=minutes(p.targetMinutes);
 if(p.subjectId!==undefined)patch.subject_id=scope(p.subjectId);
 if(p.projectId!==undefined)patch.project_id=scope(p.projectId);
 if(!Object.keys(patch).length)return invalid('Empty goal update');
 return patch;
}
function map(r:Row):GoalRecord{
 if(!r?.id)return invalid('Malformed goal row');
 return {id:String(r.id),period:r.period as GoalRecord['period'],
  startDate:String(r.start_date),endDate:String(r.end_date),timeZone:String(r.time_zone),
  targetMinutes:Number(r.target_minutes),subjectId:(r.subject_id??null) as string|null,
  projectId:(r.project_id??null) as string|null,archivedAt:(r.archived_at??null) as string|null,
  version:Number(r.version),createdAt:String(r.created_at),updatedAt:String(r.updated_at)};
}
function err(e:Failure):LemmaError{
 const m=e.message??'Study goal request failed';
 if(e.code==='23505'||e.code==='23514'||/overlap|conflict|version|reused|stale/i.test(m))return new LemmaError('conflict',m);
 if(e.code==='PGRST116'||/not found|no rows/i.test(m))return new LemmaError('not_found',m);
 if(e.code==='23503'||e.code==='22P02'||/invalid|required|unknown|cannot|must|constraint/i.test(m))return new LemmaError('invalid',m);
 if(/network|failed to fetch|timeout/i.test(m))return new LemmaError('offline',m);
 return new LemmaError('server',m);
}
function unpack<T>(r:{data:T|null;error:Failure|null}):T{
 if(r.error)throw err(r.error);
 if(r.data===null)throw new LemmaError('server','Empty study goal response');
 return r.data;
}
type Cursor={v:1;filter:string;key:[string,string,string]};
const sig=(q:GoalQuery)=>JSON.stringify([q.includeArchived===true,q.subjectId===undefined?'*':q.subjectId,
 q.projectId===undefined?'*':q.projectId]);
const encode=(c:Cursor)=>btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(value:string,filter:string):Cursor{
 try{
  if(typeof value!=='string'||value.length<4||value.length>1024||!/^[A-Za-z0-9_-]+$/.test(value))return invalid('Invalid cursor');
  const c=JSON.parse(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4))) as Cursor;
  if(c.v!==1||c.filter!==filter||!Array.isArray(c.key)||c.key.length!==3)return invalid('Cursor filter mismatch');
  date(c.key[0]);date(c.key[1]);id(c.key[2]);return c;
 }catch{return invalid('Invalid study goal cursor')}
}
function options(q:GoalQuery){
 const limit=q.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)return invalid('Goal page limit must be 1–50');
 if(q.includeArchived!==undefined&&typeof q.includeArchived!=='boolean')return invalid('Invalid archive filter');
 scope(q.subjectId);scope(q.projectId);
 const filter=sig(q);
 return {limit,filter,cursor:q.cursor==null?null:decode(q.cursor,filter)};
}
function filtered<T>(builder:T,q:GoalQuery):T{
 let b=builder as T&{eq:(col:string,value:string)=>T;is:(col:string,v:null)=>T};
 if(!q.includeArchived)b=b.is('archived_at',null) as typeof b;
 for(const [name,col] of [['subjectId','subject_id'],['projectId','project_id']] as const){
  const value=q[name];
  if(value===null)b=b.is(col,null) as typeof b;
  else if(value!==undefined)b=b.eq(col,value) as typeof b;
 }
 return b;
}
async function mutate(op:'create'|'update'|'archive'|'restore'|'delete',target:Row,
 expected:number|undefined,patch:Row):Promise<StudyReceipt<GoalRecord>|StudyReceipt<{id:string}>>{
 const db=await client();
 const p:Row={schemaVersion:1,resource:'study_goals',operation:op,operationId:uuid(),target,patch};
 if(expected!==undefined)p.expectedVersion=expected;
 const call=()=>db.rpc('study_goals_command',{p});
 let response=await call();
 // A lost acknowledgement must retry the SAME operationId and unchanged patch.
 if(response.error&&/network|failed to fetch|timeout/i.test(response.error.message??''))response=await call();
 const receipt=unpack<Row>(response);
 if(receipt.status==='conflict')throw new LemmaError('conflict',
  String((receipt.conflict as Row|undefined)?.reason??'Goal version or operation ID conflict'));
 if(receipt.status!=='ok'||!receipt.goal||!Array.isArray(receipt.changed))
  throw new LemmaError('server','Malformed study goal receipt');
 const actionNo=Number.isSafeInteger(receipt.actionNo)?Number(receipt.actionNo):null;
 return op==='delete'?{record:{id:String((receipt.goal as Row).id)},actionNo}
  :{record:map(receipt.goal as Row),actionNo};
}
export function createLiveGoalApi():GoalApi{
 return {
  mode:'live',
  async listGoals(query={}){
   const opt=options(query),db=await client();
   const count=await filtered(db.from('study_goals').select('id',{head:true,count:'exact'}),query);
   if(count.error)throw err(count.error);
   if(typeof count.count!=='number')throw new LemmaError('server','No exact goal count');
   let page=filtered(db.from('study_goals').select('*'),query);
   if(opt.cursor){
    const [s,e,k]=opt.cursor.key;
    page=page.or('start_date.gt.'+s+',and(start_date.eq.'+s+',end_date.gt.'+e+
     '),and(start_date.eq.'+s+',end_date.eq.'+e+',id.gt.'+k+')');
   }
   const rows=unpack<Row[]>(await page.order('start_date',{ascending:true})
    .order('end_date',{ascending:true}).order('id',{ascending:true}).range(0,opt.limit));
   if(!Array.isArray(rows))throw new LemmaError('server','Malformed goal page');
   const items=rows.slice(0,opt.limit).map(map),last=items.at(-1);
   return {items,total:count.count,nextCursor:rows.length>opt.limit&&last?
    encode({v:1,filter:opt.filter,key:[last.startDate,last.endDate,last.id]}):null};
  },
  async getGoal(key){
   const db=await client(),r=await db.from('study_goals').select('*').eq('id',id(key)).maybeSingle();
   if(r.error)throw err(r.error);
   return r.data?map(r.data as Row):null;
  },
  async createGoal(input){return mutate('create',{},undefined,createPatch(input)) as Promise<StudyReceipt<GoalRecord>>},
  async updateGoal(key,expected,p){return mutate('update',{id:id(key)},version(expected),updatePatch(p)) as Promise<StudyReceipt<GoalRecord>>},
  async archiveGoal(key,expected){return mutate('archive',{id:id(key)},version(expected),{}) as Promise<StudyReceipt<GoalRecord>>},
  async restoreGoal(key,expected){return mutate('restore',{id:id(key)},version(expected),{}) as Promise<StudyReceipt<GoalRecord>>},
  async deleteGoal(key,expected){return mutate('delete',{id:id(key)},version(expected),{}) as Promise<StudyReceipt<{id:string}>>},
 };
}
