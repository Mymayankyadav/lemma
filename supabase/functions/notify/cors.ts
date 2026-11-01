/**
 * NOTIF-4b6a: CORS headers for the notification Edge Function.
 * Only the real Lemma origin and explicit localhost development ports may
 * read responses. Never use '*' or Access-Control-Allow-Credentials.
 *
 * Route integration must still authenticate every route separately:
 * CORS is a browser policy, not a replacement for the cron secret or JWT.
 */
const PRODUCTION_ORIGIN='https://mymayankyadav.github.io';
const LOCAL_ORIGIN=/^http:\/\/localhost:([1-9][0-9]{0,4})$/;

export function notifyCorsHeaders(origin:string|null):Record<string,string>{
 const headers:Record<string,string>={Vary:'Origin'};
 const local=origin?.match(LOCAL_ORIGIN);
 const allowed=origin===PRODUCTION_ORIGIN||
  (local!==null&&local!==undefined&&Number(local[1])<=65535);
 if(!allowed||!origin)return headers;
 headers['Access-Control-Allow-Origin']=origin;
 headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
 headers['Access-Control-Allow-Headers']='authorization, content-type';
 return headers;
}


/**
 * OPTIONS must not invoke cron or JWT auth. When the Edge route passes the
 * browser's requested method/headers, reject unexpected privileged headers
 * explicitly rather than relying only on browser-side CORS enforcement.
 * Optional arguments retain compatibility with the origin-only caller.
 */
export function notifyPreflight(
 origin:string|null,
 requestMethod?:string|null,
 requestHeaders?:string|null,
):{status:204|403;headers:Record<string,string>}{
 const headers=notifyCorsHeaders(origin);
 const methodAllowed=requestMethod==null||
  ['GET','POST','OPTIONS'].includes(requestMethod.toUpperCase());
 const requested=requestHeaders==null||requestHeaders===''?[]:
  requestHeaders.split(',').map(header=>header.trim().toLowerCase());
 const headersAllowed=requested.every(header=>
  header==='authorization'||header==='content-type');
 if(!headers['Access-Control-Allow-Origin']||!methodAllowed||!headersAllowed)
  return {status:403,headers:{Vary:'Origin'}};
 return {status:204,headers};
}
