/** NOTIF-4a: bounded, authenticated action links. No database or network access. */
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const MAX_AGE_SECONDS=48*60*60;
const MAX_TOKEN_LENGTH=4096;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS=['open','dismiss','later','not_today','approve_cards','undo'] as const;
export type NotifyAction=typeof ACTIONS[number];
export interface ActionTokenPayload{
 u:string; n:number; a:NotifyAction; exp:number;
 x?:{ids?:string[];action?:number;scope?:string};
}
export class ActionTokenError extends Error{
 constructor(public readonly status:400|401|410,message:string){super(message);this.name='ActionTokenError'}
}
function bad(message='Invalid notification action'):never{throw new ActionTokenError(400,message)}
function encode(bytes:Uint8Array):string{
 let text='';for(const byte of bytes)text+=String.fromCharCode(byte);
 return btoa(text).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function decode(text:string):Uint8Array{
 if(!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)bad();
 const raw=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));
 return Uint8Array.from(raw,ch=>ch.charCodeAt(0));
}
function validate(raw:unknown,nowSeconds:number):ActionTokenPayload{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))bad();
 const p=raw as Record<string,unknown>;
 if(Object.keys(p).some(k=>!['u','n','a','exp','x'].includes(k)))bad();
 if(typeof p.u!=='string'||!UUID.test(p.u)||!Number.isSafeInteger(p.n)||Number(p.n)<1)bad();
 if(!ACTIONS.includes(p.a as NotifyAction))bad();
 if(!Number.isSafeInteger(p.exp))bad();
 if(Number(p.exp)<=nowSeconds)throw new ActionTokenError(410,'Notification action expired');
 if(Number(p.exp)>nowSeconds+MAX_AGE_SECONDS)bad('Notification action expiry exceeds 48 hours');
 if(p.x!==undefined){
  if(!p.x||typeof p.x!=='object'||Array.isArray(p.x))bad();
  const x=p.x as Record<string,unknown>;
  if(Object.keys(x).some(k=>!['ids','action','scope'].includes(k)))bad();
  if(x.ids!==undefined&&(!Array.isArray(x.ids)||x.ids.length>50||x.ids.some(v=>typeof v!=='string'||!UUID.test(v))))bad();
  if(x.action!==undefined&&(!Number.isSafeInteger(x.action)||Number(x.action)<1))bad();
  if(x.scope!==undefined&&(typeof x.scope!=='string'||x.scope.length<1||x.scope.length>120))bad();
  // An authenticated token must not smuggle fields the selected RPC action ignores.
  // Keep each signed instruction unambiguous when the Edge route forwards x.
  if((p.a==='open'||p.a==='dismiss')&&Object.keys(x).length>0)bad();
  if((p.a==='later'||p.a==='not_today')&&(x.ids!==undefined||x.action!==undefined))bad();
  if(p.a==='approve_cards'&&(x.action!==undefined||x.scope!==undefined))bad();
  if(p.a==='undo'&&(x.ids!==undefined||x.scope!==undefined))bad();
  if(p.a==='approve_cards'&&(!Array.isArray(x.ids)||x.ids.length===0))bad();
  if(p.a==='undo'&&!Number.isSafeInteger(x.action))bad();
 }else if(p.a==='approve_cards'||p.a==='undo')bad();
 return p as unknown as ActionTokenPayload;
}
async function hmacKey(secret:string):Promise<CryptoKey>{
 if(typeof secret!=='string'||secret.length<32)bad('Notification action secret is not configured');
 return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
/** The only allowed signing path. Expires within 48h; never stores a secret. */
export async function signActionToken(payload:ActionTokenPayload,secret:string,nowSeconds=Math.floor(Date.now()/1000)):Promise<string>{
 const p=validate(payload,nowSeconds);
 const payloadBytes=encoder.encode(JSON.stringify(p));
 if(payloadBytes.length>3000)bad('Notification action is too large');
 const body=encode(payloadBytes);
 if(body.length+44>MAX_TOKEN_LENGTH)bad('Notification action is too large');
 const key=await hmacKey(secret);
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(body)));
 return body+'.'+encode(mac);
}
/** Native HMAC verification avoids timing-sensitive string signature comparisons. */
export async function verifyActionToken(token:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):Promise<ActionTokenPayload>{
 if(typeof token!=='string'||token.length>MAX_TOKEN_LENGTH||token.length<44)bad();
 const parts=token.split('.');
 if(parts.length!==2||parts[1].length!==43)bad();
 const key=await hmacKey(secret);
 let signature:Uint8Array,body:Uint8Array;
 try{signature=decode(parts[1]);body=decode(parts[0])}catch{bad()}
 if(signature.length!==32||body.length>3000)bad();
 const verified=await crypto.subtle.verify('HMAC',key,signature,encoder.encode(parts[0]));
 if(!verified)throw new ActionTokenError(401,'Invalid notification action signature');
 let parsed:unknown;
 try{parsed=JSON.parse(decoder.decode(body))}catch{bad()}
 return validate(parsed,nowSeconds);
}

/** Authenticate the public /tick route without timing-sensitive string equality. */
export async function verifyCronHeader(header:string|null,secret:string):Promise<boolean>{
 if(!header||!secret||secret.length<32||header.length>512||secret.length>512)return false;
 const [actual,expected]=await Promise.all([
  crypto.subtle.digest('SHA-256',encoder.encode(header)),
  crypto.subtle.digest('SHA-256',encoder.encode(secret)),
 ]);
 const a=new Uint8Array(actual),b=new Uint8Array(expected);
 let mismatch=0;
 for(let i=0;i<32;i++)mismatch|=a[i]^b[i];
 return mismatch===0;
}
