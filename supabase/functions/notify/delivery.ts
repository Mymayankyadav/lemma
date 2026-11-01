import {prepareWebPush,type VapidKeys} from '../_shared/webpush.ts';

/**
 * NOTIF-4b2: pure, bounded Web Push transport.
 * The tick runner owns the 50-send/20-second batch limit, owner-scoped
 * database writes and retry scheduling; this helper never queries or writes.
 */
export type PushKind='due'|'deadline'|'behind'|'resume'|'tutor'|'digest'|'plan'|'rhythm'|'confirm'|'test';
export interface DeliveryRequest {
 subscription:{endpoint:string;keys:{p256dh:string;auth:string}};
 payload:Record<string,unknown>;
 vapid:VapidKeys;
 kind:PushKind;
 /** RFC 8030 Topic: at most 32 URL-safe base64 characters. */
 tag:string;
 /** Number of prior failed attempts; initial send is attempt zero. */
 priorFailures?:number;
 /** The tick runner supplies a shared deadline/abort signal. */
 signal?:AbortSignal;
}
export type DeliveryResult={
 status:'sent'|'gone'|'retry'|'failed';
 httpStatus?:number;
};
const MAX_JSON_BYTES=3072;
const KINDS=new Set<PushKind>(['due','deadline','behind','resume','tutor','digest','plan','rhythm','confirm','test']);
const utf8=new TextEncoder();
const isTopic=(tag:string)=>/^[A-Za-z0-9_-]{1,32}$/.test(tag);
const canRetry=(failures:number)=>failures<2;
const failure=(failures:number):DeliveryResult=>({status:canRetry(failures)?'retry':'failed'});

/**
 * Returns a classification, never an endpoint, key, body, response text or
 * exception message. The caller persists status and disables 404/410 devices.
 * Retry means *next tick*, not an immediate second request.
 */
export async function sendWebPush(
 request:DeliveryRequest,
 sender:typeof fetch=fetch,
):Promise<DeliveryResult>{
 const {subscription,payload,vapid,kind,tag,signal}=request;
 const priorFailures=request.priorFailures??0;
 if(!Number.isSafeInteger(priorFailures)||priorFailures<0||typeof tag!=='string'||!isTopic(tag)||
    !KINDS.has(kind)||!payload||typeof payload!=='object'||Array.isArray(payload)||
    payload.kind!==kind||payload.tag!==tag||payload.v!==1)
  return {status:'failed'};
 const id=payload.id;
 if(!(typeof id==='number'&&Number.isSafeInteger(id)&&id>0||
      typeof id==='string'&&/^[1-9]\d{0,18}$/.test(id))||
    typeof payload.title!=='string'||payload.title.length<1||payload.title.length>48||
    typeof payload.body!=='string'||payload.body.length>140||
    typeof payload.url!=='string'||payload.url.length<1||payload.url.length>2048||
    /^\s*javascript:/i.test(payload.url))
  return {status:'failed'};
 let endpoint:URL;
 try{endpoint=new URL(subscription.endpoint)}
 catch{return {status:'failed'}}
 // Push services use public HTTPS origins, never loopback or IP-literal
 // endpoints. Reject obvious SSRF destinations before signing VAPID or fetch.
 const host=endpoint.hostname.toLowerCase().replace(/\.$/,'');
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||
    host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||host.startsWith('['))
  return {status:'failed'};
 let encoded:string;
 try{
  encoded=JSON.stringify(payload);
  if(typeof encoded!=='string'||utf8.encode(encoded).length>MAX_JSON_BYTES)
   return {status:'failed'};
 }catch{return {status:'failed'}}
 let prepared:Awaited<ReturnType<typeof prepareWebPush>>;
 try{prepared=await prepareWebPush(subscription,encoded,vapid)}
 catch{return {status:'failed'}}
 const ttl=kind==='confirm'?600:kind==='digest'?86400:21600;
 const urgency=kind==='digest'||kind==='rhythm'?'low':'normal';
 let status:number;
 try{
  const response=await sender(subscription.endpoint,{
   method:'POST',
   headers:{...prepared.headers,TTL:String(ttl),Urgency:urgency,Topic:tag},
   body:prepared.body as BodyInit,
   signal,
  });
  status=response.status;
 }catch{return failure(priorFailures)}
 if(status===201)return {status:'sent',httpStatus:status};
 if(status===404||status===410)return {status:'gone',httpStatus:status};
 if(status===429||status>=500&&status<=599)
  return {...failure(priorFailures),httpStatus:status};
 return {status:'failed',httpStatus:status};
}
