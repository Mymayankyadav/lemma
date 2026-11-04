/** Bounded parser for v1 notifications emitted by notify/payload.ts. */
export interface PushNotice {
 v:1; id:number|string; kind:string; tag:string; title:string; body:string;
 url:string; actions:Array<{action:string;title:string;url?:string;token?:string}>; ts:number;
}
const kinds=new Set(['due','deadline','behind','resume','tutor','digest','plan','rhythm','confirm','test']);
const maxId=9223372036854775807n;
export function pushDeepLink(value:string):string|null {
 if(value.length>2048||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))return null;
 if(value.startsWith('#/'))return '/lemma/'+value;
 if(value.startsWith('/lemma/#/'))return value;
 try {
  const url=new URL(value);
  if(url.username||url.password)return null;
  if(url.protocol==='https:'&&url.hostname==='mymayankyadav.github.io'&&url.pathname.startsWith('/lemma/')&&url.hash.startsWith('#/'))return url.href;
  if(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/lemma/')&&url.hash.startsWith('#/'))return url.href;
 }catch{/* invalid URL */}
 return null;
}
export function parsePushNotice(raw:string):PushNotice|null {
 if(new TextEncoder().encode(raw).length>3072)return null;
 try {
  const p:unknown=JSON.parse(raw);
  if(!p||typeof p!=='object'||Array.isArray(p))return null;
  const x=p as Record<string,unknown>;
  const id=x.id;
  const validId=typeof id==='number'?Number.isSafeInteger(id)&&id>0:
   typeof id==='string'&&/^[1-9]\\d{0,18}$/.test(id)&&BigInt(id)<=maxId;
  if(x.v!==1||!validId||!kinds.has(x.kind as string)||
   typeof x.tag!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(x.tag)||
   typeof x.title!=='string'||!x.title.trim()||x.title.length>1000||
   typeof x.body!=='string'||x.body.length>2000||
   typeof x.url!=='string'||!pushDeepLink(x.url)||
   typeof x.ts!=='number'||!Number.isSafeInteger(x.ts)||x.ts<=0||
   !Array.isArray(x.actions)||x.actions.length>2)return null;
  for(const action of x.actions){
   if(!action||typeof action!=='object'||typeof action.action!=='string'||
    !/^[a-z][a-z0-9_-]{0,31}$/.test(action.action)||
    typeof action.title!=='string'||!action.title.trim()||action.title.length>1000||
    (action.url!==undefined&&(typeof action.url!=='string'||!pushDeepLink(action.url)))||
    (action.token!==undefined&&(typeof action.token!=='string'||action.token.length>4096||!/^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(action.token))))return null;
  }
  return x as unknown as PushNotice;
 }catch{return null}
}
