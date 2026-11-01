import {sendWebPush,type DeliveryRequest,type DeliveryResult} from './delivery.ts';

/**
 * NOTIF-4b2: bounded transport batch, independent of database ownership and
 * notification scheduling. The caller persists each result under its owner.
 */
export interface PushBatchOptions {
 /** Cannot exceed 50, even if a caller requests more. */
 maxSends?:number;
 /** Cannot exceed 19.5s, leaving the tick 0.5s to finish under 20s. */
 maxMs?:number;
 /** At most four simultaneous push-service requests. */
 concurrency?:number;
 sender?:typeof fetch;
 /** Cancels the whole batch, in addition to the hard deadline. */
 signal?:AbortSignal;
}
export interface PushBatchResult {
 attempted:number;
 /** Entries without a completed transport result (unstarted or timed out). */
 deferred:number;
 timedOut:boolean;
 results:Array<{index:number;result:DeliveryResult}>;
}
const bounded=(value:number|undefined,fallback:number,upper:number)=>
 value===undefined||!Number.isFinite(value)?fallback:Math.max(0,Math.min(upper,Math.floor(value)));

/**
 * Up to 50 sends per tick. Abort in-flight fetches at 19.5 seconds and never
 * report an unfinished send as successful. A push service may ignore Abort,
 * so race the deadline as well; the caller retries unconfirmed rows next tick.
 */
export async function sendPushBatch(
 requests:readonly DeliveryRequest[],
 options:PushBatchOptions={},
):Promise<PushBatchResult>{
 const limit=Math.min(requests.length,bounded(options.maxSends,50,50));
 if(limit===0||options.signal?.aborted)
  return {attempted:0,deferred:requests.length,timedOut:false,results:[]};
 const maxMs=Math.max(1,bounded(options.maxMs,19_500,19_500));
 const concurrency=Math.max(1,bounded(options.concurrency,4,4));
 const controller=new AbortController();
 const finished:Array<{index:number;result:DeliveryResult}|undefined>=new Array(limit);
 let next=0,timedOut=false;
 const worker=async()=>{
  while(next<limit&&!controller.signal.aborted){
   const index=next++;
   let result:DeliveryResult;
   try{
    result=await sendWebPush({...requests[index],signal:controller.signal},options.sender);
   }catch{
    // A faulty transport must not abort the remaining owner-scoped sends or
    // leak an endpoint/credential through an exception.
    const failures=requests[index].priorFailures??0;
    result={status:Number.isSafeInteger(failures)&&failures>=0&&failures<2?'retry':'failed'};
   }
   if(!controller.signal.aborted)finished[index]={index,result};
  }
 };
 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<void>(resolve=>{
  timer=setTimeout(()=>{timedOut=true;controller.abort();resolve()},maxMs);
 });
 let resolveExternalAbort:()=>void=()=>{};
 const externalAbort=new Promise<void>(resolve=>{resolveExternalAbort=()=>resolve()});
 const onAbort=()=>{controller.abort();resolveExternalAbort()};
 options.signal?.addEventListener('abort',onAbort,{once:true});
 if(options.signal?.aborted)onAbort();
 try{
  await Promise.race([
   Promise.all(Array.from({length:Math.min(concurrency,limit)},()=>worker())).then(()=>{}),
   deadline,externalAbort,
  ]);
 }finally{
  if(timer!==undefined)clearTimeout(timer);
  options.signal?.removeEventListener('abort',onAbort);
 }
 const results=finished.filter((row):row is {index:number;result:DeliveryResult}=>row!==undefined);
 return {attempted:next,deferred:requests.length-results.length,timedOut,results};
}
