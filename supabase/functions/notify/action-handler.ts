import {ActionTokenError,signActionToken,verifyActionToken} from './action-token.ts';

/** NOTIF-4b1: pure /act transaction boundary; the Edge route injects its single RPC. */
export interface NotifyActArgs {
 p_user:string; p_notification:number; p_action:string; p_extra:Record<string,unknown>
}
export interface NotifyActDeps {
 /** Edge secret, never included in a response or log. */
 secret:string;
 /** Exactly one service-role call to public.notify_act; SQL claims + writes atomically. */
 rpc:(args:NotifyActArgs)=>Promise<{data:unknown;error?:{message:string}|null}>;
 nowSeconds?:number;
}
export interface NotifyActResponse {status:200|400|409|410|503;body:Record<string,unknown>}
const reply=(status:NotifyActResponse['status'],body:Record<string,unknown>):NotifyActResponse=>({status,body});
const recover=(action:string)=>action==='undo'?'Open Lemma to undo':'Open Lemma to finish';
function positiveId(value:unknown):number|null{
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>0?value:null;
 if(typeof value!=='string'||!/^\d{1,16}$/.test(value))return null;
 const number=Number(value);
 return Number.isSafeInteger(number)&&number>0?number:null;
}

/**
 * /act never queries the outbox before claiming it. The HMAC authenticates the
 * owner and action, and the one owner-scoped SQL RPC enforces idempotency and
 * transactional rollback (including approval, confirmation and Undo).
 */
export async function handleActionRequest(input:unknown,deps:NotifyActDeps):Promise<NotifyActResponse>{
 if(typeof deps.secret!=='string'||deps.secret.length<32)
  return reply(503,{message:'Reminders are not set up yet'});
 if(!input||typeof input!=='object'||Array.isArray(input))
  return reply(400,{message:'Invalid notification action'});
 const raw=input as Record<string,unknown>;
 if(Object.keys(raw).length!==1||typeof raw.token!=='string')
  return reply(400,{message:'Invalid notification action'});
 const now=deps.nowSeconds??Math.floor(Date.now()/1000);
 let action:Awaited<ReturnType<typeof verifyActionToken>>;
 try{action=await verifyActionToken(raw.token,deps.secret,now)}
 catch(error){
  if(error instanceof ActionTokenError&&error.status===410)
   return reply(410,{message:'Notification action expired'});
  return reply(400,{message:'Invalid notification action'});
 }
 let data:unknown;
 try{
  const result=await deps.rpc({
   p_user:action.u,p_notification:action.n,p_action:action.a,
   p_extra:action.x??{},
  });
  if(result.error)throw Error('Action failed');
  data=result.data;
 }catch{
  // No retry or second DB call: the SQL transaction rolled back its claim.
  return reply(409,{message:recover(action.a)});
 }
 if(!data||typeof data!=='object'||Array.isArray(data))
  return reply(409,{message:recover(action.a)});
 const row=data as Record<string,unknown>;
 if(row.status==='already_done')return reply(409,{message:'Already done'});
 if(row.status!=='done')return reply(409,{message:recover(action.a)});
 // Never trust an RPC-supplied token; only this server may mint a signed Undo.
 const {undoToken:_ignored,...body}=row;
 if(action.a==='approve_cards'&&row.confirmId!==undefined&&row.confirmId!==null){
  const confirmId=positiveId(row.confirmId),actionId=positiveId(row.action);
  if(confirmId===null||actionId===null)return reply(409,{message:recover(action.a)});
  try{
   body.undoToken=await signActionToken({
    u:action.u,n:confirmId,a:'undo',exp:now+48*60*60,x:{action:actionId},
   },deps.secret,now);
  }catch{return reply(409,{message:recover(action.a)})}
 }
 return reply(200,body);
}
