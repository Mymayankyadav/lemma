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

const MAX_ID=9223372036854775807n;
const ENVELOPE_KEYS=new Set(['v','id','kind','tag','title','body','url','actions','ts']);
const ACTION_KEYS=new Set(['action','title','url','token']);
const safeUrl=(value:unknown):boolean=>{
 if(typeof value!=='string'||value.length<1||value.length>2048||
    value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))return false;
 if(/^#\//.test(value)||/^\/lemma\/#\//.test(value))return true;
 try{
  const url=new URL(value);
  if(url.username||url.password)return false;
  if(url.protocol==='https:'&&(url.hostname==='claude.ai'||url.hostname==='chatgpt.com'))return true;
  if(url.protocol==='https:'&&url.hostname==='mymayankyadav.github.io'&&
     url.pathname.startsWith('/lemma/')&&url.hash.startsWith('#/'))return true;
  if(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&
     url.pathname.startsWith('/lemma/'))return true;
 }catch{/* Invalid navigation destination. */}
 return false;
};
const validAction=(raw:unknown):boolean=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
 const action=raw as Record<string,unknown>;
 if(Object.keys(action).some(key=>!ACTION_KEYS.has(key))||
    typeof action.action!=='string'||!/^[a-z][a-z0-9_-]{0,31}$/.test(action.action)||
    typeof action.title!=='string'||!action.title.trim()||action.title.length>40)return false;
 if(action.url!==undefined&&!safeUrl(action.url))return false;
 if(action.token!==undefined&&(typeof action.token!=='string'||action.token.length>4096||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(action.token)))return false;
 return true;
};
/** Fail closed before encrypting: never transmit unrecognized JSON properties. */
const validEnvelope=(payload:Record<string,unknown>,kind:PushKind,tag:string):boolean=>{
 const keys=Object.keys(payload);
 if(keys.length!==ENVELOPE_KEYS.size||keys.some(key=>!ENVELOPE_KEYS.has(key)))return false;
 const id=payload.id;
 const validId=typeof id==='number'?Number.isSafeInteger(id)&&id>0:
  typeof id==='string'&&/^[1-9]\d{0,18}$/.test(id)&&BigInt(id)<=MAX_ID;
 return validId&&payload.v===1&&payload.kind===kind&&payload.tag===tag&&
  typeof payload.title==='string'&&!!payload.title.trim()&&payload.title.length<=48&&
  typeof payload.body==='string'&&payload.body.length<=140&&
  safeUrl(payload.url)&&
  Array.isArray(payload.actions)&&payload.actions.length<=2&&Array.from(payload.actions).every(validAction)&&
  Number.isSafeInteger(payload.ts)&&Number(payload.ts)>0;
};


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
 // A tick can expire while another owner is preparing a payload.
 // Never begin cryptographic work or network delivery for an aborted tick.
 if(signal?.aborted)return {status:'failed'};
 if(!Number.isSafeInteger(priorFailures)||priorFailures<0||typeof tag!=='string'||!isTopic(tag)||
    !KINDS.has(kind)||!payload||typeof payload!=='object'||Array.isArray(payload)||
    !validEnvelope(payload,kind,tag))
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
 // WebCrypto preparation is asynchronous and cannot be assumed abort-aware.
 // Recheck immediately before any push-service request.
 if(signal?.aborted)return {status:'failed'};
 const ttl=kind==='confirm'?600:kind==='digest'?86400:21600;
 const urgency=kind==='digest'||kind==='rhythm'?'low':'normal';
 let status:number;
 try{
  const response=await sender(subscription.endpoint,{
   method:'POST',
   // Never forward encrypted push bytes or VAPID auth across a 307/308 redirect.
   redirect:'error',
   headers:{...prepared.headers,TTL:String(ttl),Urgency:urgency,Topic:tag},
   body:prepared.body as BodyInit,
   signal,
  });
  status=response.status;
 }catch{return signal?.aborted?{status:'failed'}:failure(priorFailures)}
 // A late response from an abort-insensitive sender is not confirmation of
 // a completed tick. The batch runner leaves such rows unconfirmed/deferred.
 if(signal?.aborted)return {status:'failed'};
 if(status===201)return {status:'sent',httpStatus:status};
 if(status===404||status===410)return {status:'gone',httpStatus:status};
 if(status===429||status>=500&&status<=599)
  return {...failure(priorFailures),httpStatus:status};
 return {status:'failed',httpStatus:status};
}
