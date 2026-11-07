// N62.2: owner-RLS review-run reads and receipt-only lifecycle commands.
import {ReviewRunError} from './contract';
import type {NewReviewRun,ReviewRunAdvance,ReviewRunApi,ReviewRunItemRecord,
 ReviewRunItemQuery,ReviewRunPage,ReviewRunQuery,ReviewRunRecord} from './contract';
import {assertReviewAdvance,assertReviewUuid,assertReviewVersion,
 encodeReviewRunCursor,validateReviewRunDraft,validateReviewRunItem,
 validateReviewRunQuery,validateReviewRunRecord} from './model';

type Row=Record<string,unknown>;
type SqlError={message?:string;code?:string};
type Changed={resource:string;id:string;version:number};
type Receipt={status:'ok'|'conflict';changed?:Changed[];
 actionNo?:number|null;conflict?:{currentVersion?:number;reason?:string}};
type Operation='start'|'pause'|'resume'|'advance'|'abandon'|'complete';
type Envelope={schemaVersion:1;operationId:string;resource:'review_runs';
 operation:Operation;target?:{id:string};expectedVersion?:number;patch:Row};
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:'invalid'|'not_found'|'conflict',m:string):never=>{throw new ReviewRunError(code,m)};
const server=(m:string):never=>{throw new Error('Live review runs: '+m)};
async function client(){return (await import('../live/client')).liveClient()}
function randomId():string{
 const crypto=globalThis.crypto;
 if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
 if(!crypto?.getRandomValues)return server('Secure command ID unavailable');
 const a=crypto.getRandomValues(new Uint8Array(16));
 a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;
 const h=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function mapError(err:SqlError):Error{
 const msg=err.message??'Review run RPC failed';
 if(err.code==='42883'||err.code==='PGRST202'||/could not find.*function/i.test(msg))
  return new Error('Review run server command N48.2 not deployed; no write sent');
 if(err.code==='23505'||/version|conflict|changed payload|operationId/i.test(msg))
  return new ReviewRunError('conflict',msg);
 if(/not found/i.test(msg))return new ReviewRunError('not_found',msg);
 if(['23503','23514','22P02','22007'].includes(err.code??'')||
  /invalid|unknown|required|must|unsupported/i.test(msg))
  return new ReviewRunError('invalid',msg);
 return new Error('Live review runs: '+msg);
}
function check(result:{error:SqlError|null}):void{
 if(result.error)throw mapError(result.error);
}
function str(value:unknown):string{
 if(typeof value!=='string')return server('Invalid owner-visible string');
 return value;
}
function version(value:unknown):number{
 if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>2147483647)
  return server('Invalid owner-visible version');
 return value;
}
function optionalTime(value:unknown):string|null{
 return value===null?null:str(value);
}
function mapRun(r:Row):ReviewRunRecord{
 return validateReviewRunRecord({
  id:str(r.id),filters:clone(r.filters as Record<string,unknown>),
  selectedDeckIds:clone(r.selected_deck_ids as string[]),
  cardBudget:Number(r.card_budget),minuteBudget:Number(r.minute_budget),
  schedulerVersion:str(r.scheduler_version),settingsVersion:version(r.settings_version),
  status:r.status as ReviewRunRecord['status'],
  position:Number(r.position),revealed:r.revealed as boolean,
  startedAt:str(r.started_at),pausedAt:optionalTime(r.paused_at),
  endedAt:optionalTime(r.ended_at),version:version(r.version),
  source:r.source as ReviewRunRecord['source'],
  createdAt:str(r.created_at),updatedAt:str(r.updated_at),
 });
}
function mapItem(r:Row):ReviewRunItemRecord{
 const grade=r.review_id;
 // Prevent lossy conversion of a 64-bit PostgreSQL receipt ID.
 if(grade!==null&&typeof grade!=='string'&&
   !(typeof grade==='number'&&Number.isSafeInteger(grade)))
   return server('Lossy review receipt bigint');
 return validateReviewRunItem({
  id:str(r.id),runId:str(r.run_id),position:Number(r.position),cardId:str(r.card_id),
  expectedCardVersion:version(r.expected_card_version),
  state:r.state as ReviewRunItemRecord['state'],
  reviewId:grade===null?null:String(grade),staleReason:r.stale_reason===null?
   null:str(r.stale_reason),
  version:version(r.version),source:r.source as ReviewRunItemRecord['source'],
  createdAt:str(r.created_at),updatedAt:str(r.updated_at),
 });
}
function itemCursor(last:ReviewRunItemRecord):string{
 return btoa(JSON.stringify({v:1,run:last.runId,position:last.position,id:last.id}))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeItemCursor(raw:string|null|undefined,run:string):
 {position:number;id:string}|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||raw.length>1024||
    !/^[A-Za-z0-9_-]+$/.test(raw))return fail('invalid','Invalid review item cursor');
  const d=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-raw.length%4)%4))) as Row;
  if(d.v!==1||d.run!==run||!Number.isInteger(d.position)||
    Number(d.position)<0||Number(d.position)>2147483647)
    return fail('invalid','Wrong review item cursor');
  return {position:Number(d.position),id:assertReviewUuid(d.id)};
 }catch{return fail('invalid','Invalid review item cursor')}
}
function itemQuery(query:ReviewRunItemQuery={}):number{
 if(!query||typeof query!=='object'||Array.isArray(query)||
  Object.keys(query).some(k=>!['limit','cursor'].includes(k)))
  return fail('invalid','Invalid item query fields');
 const limit=query.limit??20;
 if(!Number.isInteger(limit)||limit<1||limit>50)
  return fail('invalid','Page size must be 1–50');
 return limit;
}
function orderedRun(a:ReviewRunRecord,b:ReviewRunRecord):number{
 return a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
}
function orderedItem(a:ReviewRunItemRecord,b:ReviewRunItemRecord):number{
 return a.position-b.position||a.id.localeCompare(b.id);
}
// Exact totals for a filtered owner page require bounded owner-RLS scans.
async function scan(table:'review_runs'|'review_run_items',runId?:string):Promise<Row[]>{
 const api=await client(),all:Row[]=[];
 for(let start=0;start<=20000;start+=50){
  let q=api.from(table).select('*');
  if(runId)q=q.eq('run_id',runId);
  const r=await q.range(start,start+49);
  check(r);
  if(!Array.isArray(r.data)||r.data.length>50)return server('Invalid RLS page');
  all.push(...r.data as Row[]);
  if(r.data.length<50)return all;
 }
 return server('Review run read exceeds bounded owner scan');
}
export function createLiveReviewRunApi():ReviewRunApi{
 const pending=new Map<string,Envelope>();
 const readRun=async(key:string):Promise<ReviewRunRecord|null>=>{
  const api=await client(),r=await api.from('review_runs')
    .select('*').eq('id',assertReviewUuid(key)).maybeSingle();
  check(r);
  return r.data?mapRun(r.data as Row):null;
 };
 const readItem=async(key:string):Promise<ReviewRunItemRecord|null>=>{
  const api=await client(),r=await api.from('review_run_items')
    .select('*').eq('id',assertReviewUuid(key)).maybeSingle();
  check(r);
  return r.data?mapItem(r.data as Row):null;
 };
 async function command(operation:Operation,patch:Row,target?:string,expected?:number):
  Promise<{receipt:Receipt;changed:Changed[];key:string}>{
  const base:Omit<Envelope,'operationId'>={
   schemaVersion:1,resource:'review_runs',operation,patch,
   ...(target?{target:{id:assertReviewUuid(target)},expectedVersion:assertReviewVersion(expected)}:{}),
  };
  const signature=JSON.stringify(base);
  const envelope:Envelope=pending.get(signature)??{...base,operationId:randomId()};
  pending.set(signature,envelope);
  try{
   const api=await client();
   const result=await api.rpc('review_runs_command',{p:envelope});
   check(result);
   const receipt=result.data as Receipt|null;
   if(receipt?.status==='conflict'){
    const current=receipt.conflict?.currentVersion;
    throw new ReviewRunError('conflict',
      'Review run version or operationId conflict (current '+
      (current??'unknown')+')',
      Number.isInteger(current)?current:undefined);
   }
   if(receipt?.status!=='ok'||!Array.isArray(receipt.changed)||
    receipt.changed.length!==(operation==='advance'?2:1)||
    receipt.changed[0].resource!=='review_runs'||
    !Number.isSafeInteger(receipt.actionNo)||receipt.actionNo!<1||
    receipt.changed.some(x=>typeof x.id!=='string'||!Number.isInteger(x.version)||
      x.version<1||x.version>2147483647))
    return server('Invalid or unaudited review run receipt');
   const changes=receipt.changed.map(x=>({...x,id:assertReviewUuid(x.id)}));
   if(operation==='advance'&&changes[1].resource!=='review_run_items')
    return server('Advance did not link a review item');
   // Caller clears the slot only after the owner-RLS readback succeeds.
   return {receipt,changed:changes,key:signature};
  }catch(error){
   if(error instanceof ReviewRunError||
    (error instanceof Error&&error.message.includes('not deployed')))
    pending.delete(signature);
   throw error;
  }
 }
 async function transition(key:string,expected:number,operation:'pause'|'resume'|'abandon'|'complete'){
  const result=await command(operation,{},key,expected);
  if(result.changed[0].id!==key)return server('Wrong review run changed');
  const record=await readRun(key);
  if(!record||record.version!==result.changed[0].version)
   return server('Review run receipt not visible through owner RLS');
  if(record.source!=='app')return server('Unexpected review run provenance');
  pending.delete(result.key);
  return {record:clone(record),actionNo:result.receipt.actionNo!};
 }
 return {
  mode:'live',
  async listRuns(query:ReviewRunQuery={}):Promise<ReviewRunPage<ReviewRunRecord>>{
   const q=validateReviewRunQuery(query);
   const matching=(await scan('review_runs')).map(mapRun)
    .filter(r=>q.status.includes(r.status)).sort(orderedRun);
   const after=matching.filter(r=>!q.cursor||orderedRun(r,{
    id:q.cursor.id,createdAt:q.cursor.createdAt} as ReviewRunRecord)>0);
   const items=after.slice(0,q.limit),last=items.at(-1);
   return {items:clone(items),total:matching.length,
    nextCursor:last&&after.length>q.limit?encodeReviewRunCursor(last,q.status):null};
  },
  getRun:readRun,
  async listRunItems(runId:string,query:ReviewRunItemQuery={}){
   const id=assertReviewUuid(runId),limit=itemQuery(query);
   const cursor=decodeItemCursor(query.cursor,id);
   if(!await readRun(id))return fail('not_found','Review run not found');
   const rows=(await scan('review_run_items',id)).map(mapItem).sort(orderedItem);
   const after=rows.filter(i=>!cursor||orderedItem(i,{
    position:cursor.position,id:cursor.id} as ReviewRunItemRecord)>0);
   const items=after.slice(0,limit),last=items.at(-1);
   return {items:clone(items),total:rows.length,
    nextCursor:last&&after.length>limit?itemCursor(last):null};
  },
  async startRun(input:NewReviewRun){
   const d=validateReviewRunDraft(input);
   const result=await command('start',{
    filters:d.filters,selected_deck_ids:d.selectedDeckIds,card_budget:d.cardBudget,
    minute_budget:d.minuteBudget,scheduler_version:d.schedulerVersion,
    settings_version:d.settingsVersion,
   });
   const record=await readRun(result.changed[0].id);
   if(!record||record.version!==result.changed[0].version)
    return server('Started run not visible through owner RLS');
   if(record.source!=='app')return server('Unexpected review run provenance');
   pending.delete(result.key);
   return {record:clone(record),actionNo:result.receipt.actionNo!};
  },
  pauseRun:(key,expected)=>transition(key,expected,'pause'),
  resumeRun:(key,expected)=>transition(key,expected,'resume'),
  abandonRun:(key,expected)=>transition(key,expected,'abandon'),
  completeRun:(key,expected)=>transition(key,expected,'complete'),
  async advanceRun(key:string,expected:number,input:ReviewRunAdvance){
   const advance=assertReviewAdvance(input);
   const patch:Row=advance.kind==='graded'?{
    kind:'graded',item_id:advance.itemId,review_id:advance.reviewId,
   }:{kind:'stale',item_id:advance.itemId,reason:advance.reason};
   const result=await command('advance',patch,key,expected);
   if(result.changed[0].id!==key||result.changed[1].id!==advance.itemId)
    return server('Advance receipt does not match selected item');
   const [run,item]=await Promise.all([readRun(key),readItem(advance.itemId)]);
   if(!run||!item||run.version!==result.changed[0].version||
     item.version!==result.changed[1].version)
    return server('Advanced run or item not visible through owner RLS');
   if(run.source!=='app'||item.source!=='app')
    return server('Unexpected review run or item provenance');
   pending.delete(result.key);
   return {record:{run:clone(run),item:clone(item)},actionNo:result.receipt.actionNo!};
  },
 };
}
