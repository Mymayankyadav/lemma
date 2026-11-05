import type {NotifyPrefs} from './types'

/** Preserve unknown future reminder keys on a partial settings update. */
export function mergeNotifyPrefs(before:NotifyPrefs|null|undefined,patch:NotifyPrefs):NotifyPrefs {
 const old=before??{}
 return {
  ...old,...patch,
  ...(patch.kinds?{kinds:{...old.kinds,...patch.kinds}}:{}),
  ...(patch.quiet?{quiet:{...old.quiet,...patch.quiet}}:{}),
  ...(patch.digest?{digest:{...old.digest,...patch.digest}}:{}),
  ...(patch.backoff?{backoff:{...old.backoff,...patch.backoff}}:{}),
 }
}


/** A reminder link selects a bounded one-shot Review round; it is not an
 * authorization grant. The signed action token must still be verified by the
 * server before any privileged action is attempted.
 */
export interface NotificationReviewLink {
 count:number;
 /** Opaque signed action token, if provided by the reminder. */
 token:string|null;
}

const REVIEW_HOST='mymayankyadav.github.io';
const REVIEW_MAX_AGE_SECONDS=48*60*60;
const REVIEW_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reject expired/malformed tokens without claiming to verify their HMAC. */
function reviewTokenWellFormed(token:string,nowMs:number):boolean {
 if(token.length>4096||!Number.isFinite(nowMs))return false;
 const parts=token.split('.');
 if(parts.length!==2||parts[1].length!==43||
   !/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))return false;
 try{
  const normalized=parts[0].replace(/-/g,'+').replace(/_/g,'/');
  if(normalized.length%4===1)return false;
  const json=atob(normalized+'='.repeat((4-normalized.length%4)%4));
  if(json.length>3000)return false;
  const value:unknown=JSON.parse(json);
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const p=value as Record<string,unknown>;
  if(Object.keys(p).some(k=>!['u','n','a','exp'].includes(k)))return false;
  if(typeof p.u!=='string'||!REVIEW_UUID.test(p.u)||
   !Number.isSafeInteger(p.n)||Number(p.n)<1||p.a!=='open'||
   !Number.isSafeInteger(p.exp))return false;
  const remaining=Number(p.exp)-Math.floor(nowMs/1000);
  return remaining>0&&remaining<=REVIEW_MAX_AGE_SECONDS;
 }catch{return false}
}

/** Only the app's own hash route is eligible. The optional token is checked
 * for shape and expiry here, never for authenticity in the browser.
 */
export function parseNotificationReviewLink(href:string,nowMs=Date.now()):NotificationReviewLink|null {
 if(typeof href!=='string'||href.length>6144||!href||
   /[\u0000-\u001f\u007f]/.test(href)||!Number.isFinite(nowMs))return null;
 let hash:string;
 if(href.startsWith('#/'))hash=href;
 else if(href.startsWith('/lemma/#/'))hash=href.slice('/lemma/'.length);
 else {
  try{
   const url=new URL(href);
   const official=url.protocol==='https:'&&url.hostname===REVIEW_HOST;
   const local=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
   if((!official&&!local)||url.username||url.password||
    url.pathname!=='/lemma/'||url.search)return null;
   hash=url.hash;
  }catch{return null}
 }
 if(!hash.startsWith('#/review?'))return null;
 const params=new URLSearchParams(hash.slice('#/review?'.length));
 const entries=[...params.entries()];
 if(entries.some(([key])=>key!=='start'&&key!=='token')||
  entries.filter(([key])=>key==='start').length!==1||
  entries.filter(([key])=>key==='token').length>1)return null;
 const rawCount=params.get('start');
 if(rawCount===null||!/^(?:[1-9]|[1-4]\d|50)$/.test(rawCount))return null;
 const token=params.get('token');
 if(token!==null&&!reviewTokenWellFormed(token,nowMs))return null;
 return {count:Number(rawCount),token};
}

/** Keep URL-only overrides inactive in the production/default-off app. */
export function enabledNotificationReviewLink(
 href:string, enabled:boolean,nowMs=Date.now(),
):NotificationReviewLink|null {
 return enabled?parseNotificationReviewLink(href,nowMs):null;
}
