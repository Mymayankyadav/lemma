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


/** The Edge route can use this for OPTIONS without invoking cron or JWT auth. */
export function notifyPreflight(origin:string|null):{
 status:204|403;headers:Record<string,string>;
}{
 const headers=notifyCorsHeaders(origin);
 return {
  status:headers['Access-Control-Allow-Origin']?204:403,
  headers,
 };
}
