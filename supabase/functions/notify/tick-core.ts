import {decideNotifications,type ReminderCandidate,type ReminderContext,type ReminderKind,type RuleResult} from './rules.ts';

/**
 * NOTIF-4b6b: orchestration only. The Edge route supplies authenticated
 * service-role adapters. Each owner data operation MUST filter by user_id.
 * The adapter's queue() must insert by unique (user_id,key), idempotently.
 * No credentials, endpoints, subscriptions or payloads enter this result.
 */
export interface TickOwnerFacts {
 candidates:ReminderCandidate[];
 context:ReminderContext;
}
export interface TickDelivery {
 attempted:number;
 sent:number;
 failed:number;
}
export interface TickAdapters {
 /** Enumerate only settings.notify.enabled owners. Never return device keys. */
 listEnabledOwners:(signal:AbortSignal)=>Promise<readonly string[]>;
 /** Exactly one owner-scoped notify_candidates read; never a global scan. */
 load:(userId:string,now:number,signal:AbortSignal)=>Promise<TickOwnerFacts>;
 /** Persist decisions with (user_id,key) uniqueness and owner-bound writes. */
 queue:(userId:string,decisions:readonly RuleResult[],signal:AbortSignal)=>Promise<number>;
 /** Claim due queued rows by user_id, deliver and record results atomically. */
 deliver:(userId:string,maxSends:number,signal:AbortSignal)=>Promise<TickDelivery>;
}
export interface TickSummary {
 owners:number;
 queued:number;
 sent:number;
 skipped:number;
 failed:number;
 ms:number;
 timedOut:boolean;
}
export interface TickOptions {
 now?:number;
 maxMs?:number;
 maxSends?:number;
 signal?:AbortSignal;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS=new Set<ReminderKind>(['due','deadline','behind','resume','tutor','digest','plan','rhythm']);
const safeCount=(value:unknown,max:number):value is number=>
 typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
const bound=(value:number|undefined,fallback:number,max:number)=>
 value===undefined||!Number.isFinite(value)?fallback:
 Math.max(1,Math.min(max,Math.floor(value)));

/**
 * Runs one bounded tick, not a cron or HTTP endpoint. Every operation carries
 * an explicit owner UUID and an abort signal. If a dependency ignores abort,
 * the deadline still returns promptly, but its adapter MUST refrain from
 * committing a late write or send after signal.aborted.
 */
export async function runNotifyTick(
 deps:TickAdapters,
 options:TickOptions={},
):Promise<TickSummary>{
 const started=performance.now();
 const now=typeof options.now==='number'&&Number.isFinite(options.now)
  ?options.now:Date.now();
 const maxMs=bound(options.maxMs,19_500,19_500);
 const sendLimit=options.maxSends===0?0:bound(options.maxSends,50,50);
 const controller=new AbortController();
 const expired=Symbol('expired');
 let expire!:()=>void;
 let timedOut=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<typeof expired>(resolve=>{expire=()=>resolve(expired)});
 const onAbort=()=>{controller.abort();expire()};
 const within=async<T>(promise:Promise<T>):Promise<T>=>{
  const value=await Promise.race([promise,deadline]);
  if(value===expired)throw Error('Tick deadline or cancellation');
  return value as T;
 };
 options.signal?.addEventListener('abort',onAbort,{once:true});
 timer=setTimeout(()=>{timedOut=true;onAbort()},maxMs);
 if(options.signal?.aborted)onAbort();
 const summary:TickSummary={owners:0,queued:0,sent:0,skipped:0,failed:0,ms:0,timedOut:false};
 try{
  if(controller.signal.aborted)return summary;
  let owners:readonly string[];
  try{owners=await within(deps.listEnabledOwners(controller.signal))}
  catch{summary.failed=controller.signal.aborted?0:1;return summary};
  if(!Array.isArray(owners)){summary.failed=1;return summary}
  const seen=new Set<string>();
  let attempted=0;
  for(const raw of owners){
   if(controller.signal.aborted)break;
   if(typeof raw!=='string'||!UUID.test(raw)){summary.failed++;continue}
   const userId=raw.toLowerCase();
   if(seen.has(userId))continue;
   seen.add(userId);
   summary.owners++;
   try{
    const facts=await within(deps.load(userId,now,controller.signal));
    if(!facts||!Array.isArray(facts.candidates)||!facts.context)
     throw Error('Invalid owner facts');
    // Candidate facts come from an owner-scoped RPC, but malformed JSON must
    // never create an arbitrary kind/key in the durable notification outbox.
    // Array.from materializes sparse holes so they cannot evade validation.
    if(!Array.from(facts.candidates).every(candidate=>
     candidate&&typeof candidate==='object'&&
     KINDS.has(candidate.kind)&&typeof candidate.key==='string'&&
     candidate.key.trim().length>0))
     throw Error('Invalid notification candidate');
    const context=facts.context;
    // The pure rules expect a normalized owner setting. A malformed database
    // JSON value must not silently fall through to as-happens delivery.
    if(!['as-happens','daily','weekly','off'].includes(context.mode)||
       !Number.isSafeInteger(context.dailyCap)||context.dailyCap<1||context.dailyCap>5||
       !Number.isSafeInteger(context.sendsToday)||context.sendsToday<0||
       (context.lastSendAt!==undefined&&!Number.isFinite(context.lastSendAt)))
     throw Error('Invalid owner notification settings');
    if(controller.signal.aborted)break;
    const decisions=decideNotifications(facts.candidates,{...facts.context,now});
    const queued=await within(deps.queue(userId,decisions,controller.signal));
    // An adapter can resolve in the same turn as external cancellation.
    // Never credit or start a delivery after the owner-bound signal aborts.
    if(controller.signal.aborted)break;
    if(!safeCount(queued,decisions.length))throw Error('Invalid queued count');
    summary.queued+=queued;
    summary.skipped+=decisions.filter(row=>row.status==='skipped'||row.status==='suppressed').length;
    // Switching reminders off must also block previously queued deliveries.
    if(facts.context.mode==='off')continue;
    const remaining=sendLimit-attempted;
    if(controller.signal.aborted)break;
    if(remaining<=0)continue;
    const delivery=await within(deps.deliver(userId,remaining,controller.signal));
    if(controller.signal.aborted)break;
    if(!delivery||!safeCount(delivery.attempted,remaining)||
       !safeCount(delivery.sent,delivery.attempted)||
       !safeCount(delivery.failed,delivery.attempted)||
       delivery.sent+delivery.failed>delivery.attempted)
      throw Error('Invalid delivery counts');
    attempted+=delivery.attempted;
    summary.sent+=delivery.sent;
    summary.failed+=delivery.failed;
   }catch{
    if(controller.signal.aborted)break;
    // An owner's malformed settings or failed query must not stop other owners.
    summary.failed++;
   }
  }
  return summary;
 }finally{
  if(timer!==undefined)clearTimeout(timer);
  options.signal?.removeEventListener('abort',onAbort);
  summary.timedOut=timedOut;
  summary.ms=Math.max(0,Math.ceil(performance.now()-started));
 }
}
