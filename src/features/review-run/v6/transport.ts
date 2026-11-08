// N83 owner-scoped durable review run transport. No browser DML:
// review_runs_command is the only mutation path; SELECT is owner-RLS.
import {summarizeDurableRun,type DurableRunProgress,
 type DurableRunItem} from './position';

type Row=Record<string,unknown>;
type Operation='start'|'pause'|'resume'|'advance'|'abandon'|'complete';
type Envelope={
 schemaVersion:1;resource:'review_runs';operation:Operation;operationId:string;
 target?:{id:string};expectedVersion?:number;patch:Row;
};
type Receipt={
 status:'ok'|'conflict';actionNo?:number|null;
 changed?:{resource?:string;id:string;version:number}[];
 run?:Row;current?:Row;conflict?:{reason?:string;currentVersion?:number};
};
export type DurableRunStatus='running'|'paused'|'exhausted'|'completed'|'abandoned';
export interface DurableRun{
 id:string;status:DurableRunStatus;position:number;version:number;
 startedAt:string;endedAt:string|null;progress:DurableRunProgress;
 items:ReadonlyArray<DurableRunItem&{id:string;cardId:string;expectedCardVersion:number}>;
}
export interface StartRunInput{
 selectedDeckIds:string[];
 filters:{sessionId?:string|null;conceptSlug?:string|null;
  includeNew?:boolean;newOnly?:boolean};
 cardBudget:number;minuteBudget:number;schedulerVersion:string;settingsVersion:number;
}
const retry=new Map<string,Envelope>();
function operationId():string{
 const crypt=globalThis.crypto;
 if(typeof crypt?.randomUUID==='function')return crypt.randomUUID();
 if(!crypt?.getRandomValues)throw new Error('Secure UUID generation unavailable');
 const bytes=new Uint8Array(16);
 crypt.getRandomValues(bytes);
 bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20);
}
async function db(){return (await import('../../../data/live/client')).liveClient();}
function checkedId(value:string):string{
 if(typeof value!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
  throw new Error('Invalid review-run ID');
 return value;
}
function version(n:number):number{
 if(!Number.isSafeInteger(n)||n<1||n>2147483647)throw new Error('Invalid review-run version');
 return n;
}
function mapStatus(input:unknown):DurableRunStatus{
 if(!['running','paused','exhausted','completed','abandoned'].includes(String(input)))
  throw new Error('Malformed review-run state');
 return input as DurableRunStatus;
}
export async function readDurableRun(id:string):Promise<DurableRun|null>{
 const key=checkedId(id),c=await db();
 const result=await c.from('review_runs').select('*').eq('id',key).maybeSingle();
 if(result.error)throw new Error(result.error.message);
 if(!result.data)return null;
 const record=result.data as Row;
 const items:DurableRun['items'][number][]=[];
 for(let offset=0;offset<=2000;offset+=50){
  const page=await c.from('review_run_items').select('*').eq('run_id',key)
   .order('position',{ascending:true}).range(offset,offset+49);
  if(page.error)throw new Error(page.error.message);
  if(!Array.isArray(page.data)||page.data.length>50)
   throw new Error('Malformed bounded review-run items');
  for(const raw of page.data as Row[])items.push({
   id:String(raw.id),cardId:String(raw.card_id),
   expectedCardVersion:Number(raw.expected_card_version),
   position:Number(raw.position),state:raw.state as DurableRunItem['state'],
   reviewId:raw.review_id==null?null:Number(raw.review_id),
   staleReason:raw.stale_reason==null?null:String(raw.stale_reason),
  });
  if(page.data.length<50)break;
  if(offset===2000)throw new Error('Review-run item bound exceeded');
 }
 const position=Number(record.position),status=mapStatus(record.status);
 const progress=summarizeDurableRun(items,position);
 if(status==='exhausted'&&!progress.done)
  throw new Error('Exhausted run has unadvanced items');
 return {id:key,status,position,version:version(Number(record.version)),
  startedAt:String(record.started_at),
  endedAt:record.ended_at==null?null:String(record.ended_at),items,progress};
}
export async function resumeDurableRun():Promise<DurableRun|null>{
 const c=await db();
 const rows=await c.from('review_runs').select('id')
  .in('status',['running','paused']).order('updated_at',{ascending:false}).limit(1);
 if(rows.error)throw new Error(rows.error.message);
 if(!Array.isArray(rows.data)||rows.data.length>1)
  throw new Error('Malformed bounded active review-run response');
 return rows.data.length?readDurableRun(String((rows.data[0] as Row).id)):null;
}
async function command(operation:Operation,patch:Row,target?:{
 id:string;expectedVersion:number
}):Promise<DurableRun>{
 const base={
  schemaVersion:1 as const,resource:'review_runs' as const,operation,patch,
  ...(target?{target:{id:checkedId(target.id)},expectedVersion:version(target.expectedVersion)}:{}),
 };
 const key=JSON.stringify(base),envelope=retry.get(key)??{...base,operationId:operationId()};
 retry.set(key,envelope);
 try{
  const c=await db(),response=await c.rpc('review_runs_command',{p:envelope});
  if(response.error)throw new Error(response.error.message);
  const receipt=response.data as Receipt|null;
  if(receipt?.status==='conflict'){
   retry.delete(key);throw new Error('Review run changed: '+
    String(receipt.conflict?.reason??receipt.conflict?.currentVersion??'version conflict'));
  }
  if(receipt?.status!=='ok'||!Number.isSafeInteger(receipt.actionNo)||
   (receipt.actionNo??0)<1||!receipt.run||!Array.isArray(receipt.changed))
   throw new Error('Malformed review-run receipt');
  const returned=receipt.run;
  const id=checkedId(String(returned.id));
  const matched=receipt.changed.some(ch=>ch.id===id&&Number(ch.version)===returned.version);
  if(!matched)throw new Error('Review-run receipt lacks its own changed version');
  const run=await readDurableRun(id);
  if(!run||run.version!==Number(returned.version))
   throw new Error('Review-run receipt/readback mismatch');
  retry.delete(key);
  return run;
 }catch(e){
  // Preserve uncertain RPC/readback failures for exact operationId retry.
  throw e;
 }
}
export function startDurableRun(input:StartRunInput):Promise<DurableRun>{
 if(!Array.isArray(input.selectedDeckIds)||!input.selectedDeckIds.every(
  id=>typeof id==='string'&&!!id.trim())||
  !Number.isSafeInteger(input.cardBudget)||input.cardBudget<0||
  input.cardBudget>2000||!Number.isSafeInteger(input.minuteBudget)||
  input.minuteBudget<0||input.minuteBudget>1440||
  !input.schedulerVersion||!Number.isSafeInteger(input.settingsVersion)||
  input.settingsVersion<1)
  throw new Error('Invalid review-run selection');
 return command('start',{
  selected_deck_ids:input.selectedDeckIds,filters:input.filters,
  card_budget:input.cardBudget,minute_budget:input.minuteBudget,
  scheduler_version:input.schedulerVersion,settings_version:input.settingsVersion,
 });
}
export function pauseDurableRun(id:string,expectedVersion:number):Promise<DurableRun>{
 return command('pause',{}, {id,expectedVersion});
}
export function unpauseDurableRun(id:string,expectedVersion:number):Promise<DurableRun>{
 return command('resume',{}, {id,expectedVersion});
}
/** Grade first through the existing app review path, then advance ONCE
 * with its committed review receipt ID. Never grade on a retry of advance. */
export function advanceGradedRun(id:string,expectedVersion:number,
 itemId:string,reviewId:number):Promise<DurableRun>{
 if(!Number.isSafeInteger(reviewId)||reviewId<1)throw new Error('Invalid committed review receipt');
 return command('advance',{kind:'graded',item_id:checkedId(itemId),review_id:reviewId},
  {id,expectedVersion});
}
export function advanceStaleRun(id:string,expectedVersion:number,
 itemId:string,reason:string):Promise<DurableRun>{
 if(typeof reason!=='string'||!reason.trim()||reason.length>200)
  throw new Error('A stale review item needs a reason');
 return command('advance',{kind:'stale',item_id:checkedId(itemId),reason},
  {id,expectedVersion});
}
