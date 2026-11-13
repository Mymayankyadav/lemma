import type {Context} from '../db.ts';

/** N160 (areas 2, 24, 27): Today, progress reports and the owner export, read
 * through the service-role mcp_read function with the owner set by the server,
 * never by an argument. Read-only and bounded. */
export type ContextReadArgs={what?:string;start?:string;end?:string;limit?:number;
 cursor?:string;id?:string;project?:string;status?:string};
export const CONTEXT_WHAT=['today','progress','export','connection'] as const;
const TABLE=/^[a-z][a-z0-9_]{0,60}$/;

export function contextArgs(a:ContextReadArgs,now=Date.now()):{what:string;args:Record<string,unknown>}{
 const raw=a as unknown as Record<string,unknown>;
 if(['owner','ownerId','user_id','userId'].some(k=>k in raw))
  throw new Error('Context reads use the authenticated owner; omit owner arguments');
 if(a.what==='today'||a.what==='connection')return {what:a.what,args:{}};
 if(a.what==='progress'){
  // The report covers the last N days up to today. `start` (YYYY-MM-DD) sets N.
  let days=30;
  if(a.start!==undefined){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(a.start)||!Number.isFinite(Date.parse(a.start)))
    throw new Error('progress start must be a date (YYYY-MM-DD)');
   days=Math.floor((now-Date.parse(a.start))/86400000)+1;
   if(days<1||days>365)throw new Error('progress covers 1 to 365 days back from today');
  }
  return {what:'progress',args:{days}};
 }
 if(a.what==='export'){
  if(a.id!==undefined&&!TABLE.test(a.id))throw new Error('export id must be a table name from the registry');
  const limit=a.limit??50;
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error('export page limit must be 1..50');
  if(a.cursor!==undefined&&(typeof a.cursor!=='string'||a.cursor.length>2000))throw new Error('Invalid export cursor');
  return {what:'export',args:{table:a.id??null,cursor:a.cursor??null,limit}};
 }
 throw new Error('Unknown context read');
}

export async function readContext(c:Context,a:ContextReadArgs):Promise<string>{
 if(!c.userId)throw new Error('Authenticated owner required');
 const {what,args}=contextArgs(a);
 const {data,error}=await c.db.rpc('mcp_read',{p_user:c.userId,p_what:what,p_args:args});
 if(error)throw new Error(error.message);
 const text=JSON.stringify(data);
 if(text.length>60000)throw new Error('Report too large; request fewer days or a smaller export page');
 return text;
}
