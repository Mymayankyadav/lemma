import {notifyTitle,notifyBody,notifyText} from '../_shared/notify-text.ts';

/** NOTIF-4b5: pure, safe, bounded v1 payload for the Lemma service worker. */
export type PushKind='due'|'deadline'|'behind'|'resume'|'tutor'|'digest'|'plan'|'rhythm'|'confirm'|'test';
export interface PushActionInput {
 action:string;title:string;url?:string;token?:string;
}
export interface PushPayloadInput {
 id:number|string;kind:PushKind;tag:string;title:string;body:string;
 url:string;actions:PushActionInput[];ts:number;
}
const KINDS=new Set<PushKind>(['due','deadline','behind','resume','tutor','digest','plan','rhythm','confirm','test']);
const MAX_ID=9223372036854775807n;
const utf8=new TextEncoder();
const invalid=():never=>{throw new Error('Invalid notification payload')};
const isId=(value:unknown):boolean=>{
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>0;
 if(typeof value!=='string'||!/^[1-9]\d{0,18}$/.test(value))return false;
 try{return BigInt(value)<=MAX_ID}catch{return false}
};
const safeUrl=(value:string):boolean=>{
 if(value.length===0||value.length>2048||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))return false;
 if(/^#\//.test(value)||/^\/lemma\/#\//.test(value))return true;
 try{
  const url=new URL(value);
  if(url.username||url.password)return false;
  if(url.protocol==='https:'&&
     (url.hostname==='claude.ai'||url.hostname==='chatgpt.com'))return true;
  if(url.hostname==='mymayankyadav.github.io'&&url.protocol==='https:'&&
     url.pathname.startsWith('/lemma/')&&url.hash.startsWith('#/'))return true;
  if(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&
     url.pathname.startsWith('/lemma/'))return true;
 }catch{/* malformed URL */}
 return false;
};
const isToken=(value:string)=>value.length<=4096&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

/**
 * Constructs the exact §4g shape. The Edge route supplies action HMAC tokens;
 * this helper never signs, sends or stores anything.
 */
export function buildPushPayload(input:PushPayloadInput):string{
 if(!input||!isId(input.id)||!KINDS.has(input.kind)||
    typeof input.tag!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(input.tag)||
    typeof input.title!=='string'||!input.title.trim()||input.title.length>1000||
    typeof input.body!=='string'||input.body.length>2000||
    typeof input.url!=='string'||!safeUrl(input.url)||
    !Array.isArray(input.actions)||input.actions.length>2||
    !Number.isSafeInteger(input.ts)||input.ts<=0)invalid();
 const actions=input.actions.map(action=>{
  if(!action||typeof action.action!=='string'||!/^[a-z][a-z0-9_-]{0,31}$/.test(action.action)||
     typeof action.title!=='string'||!action.title.trim()||action.title.length>1000||
     action.url!==undefined&&(typeof action.url!=='string'||!safeUrl(action.url))||
     action.token!==undefined&&(typeof action.token!=='string'||!isToken(action.token)))invalid();
  return {
   action:action.action,title:notifyText(action.title,40),
   ...(action.url!==undefined?{url:action.url}:{}),
   ...(action.token!==undefined?{token:action.token}:{}),
  };
 });
 const payload={
  v:1 as const,id:input.id,kind:input.kind,tag:input.tag,
  title:notifyTitle(input.title),body:notifyBody(input.body),
  url:input.url,actions,ts:input.ts,
 };
 const encoded=JSON.stringify(payload);
 if(utf8.encode(encoded).length>3072)invalid();
 return encoded;
}
