// N89: bounded, owner-filtered notification reads. Credential columns never
// appear in SELECT, projection, search, or any command receipt.
import type {Context} from '../db.ts';

export type NotificationReadArgs={
  what?:string;resource?:string;id?:string;limit?:number;cursor?:string;
  query?:string;status?:string;project?:string;start?:string;end?:string;
  source?:string;
};
type Mode='get'|'search';
type Row=Record<string,unknown>;
const columns={
  push_devices:['id','label','platform','created_at','last_seen_at','last_ok_at',
    'failures','disabled_at','disabled_reason','version'],
  notify_holds:['scope','until','created_at','version'],
  notifications:['id','kind','title','status','reason','due_at','sent_at',
    'opened_at','action','action_at'],
} as const;
type Resource=keyof typeof columns;
const resources=Object.keys(columns) as Resource[];
const safeLike=(v:string)=>v.replace(/[\\%_]/g,'\\$&');
const safeValue=(v:unknown):unknown=>typeof v==='string'?v.slice(0,500):v;
const onlySafe=(resource:Resource,row:Row):Row=>{
  const out:Row={};
  for(const key of columns[resource])if(Object.hasOwn(row,key))
    out[key]=safeValue(row[key]);
  return out;
};
type Cursor={v:1;resource:Resource;mode:Mode;id:string|null;
  query:string|null;status:string|null;offset:number};
function encodeCursor(v:Cursor):string{
 const bytes=new TextEncoder().encode(JSON.stringify(v));
 let data='';
 for(const byte of bytes)data+=String.fromCharCode(byte);
 return 'no1:'+btoa(data).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function offsetFor(value:unknown,base:Omit<Cursor,'offset'>):number{
 if(value==null)return 0;
 if(typeof value!=='string'||!/^no1:[a-zA-Z0-9_-]{1,400}$/.test(value))
  throw Error('Invalid notification cursor');
 try{
  const chars=value.slice(4).replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(chars+'='.repeat((4-chars.length%4)%4));
  const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(
    Uint8Array.from(binary,ch=>ch.charCodeAt(0)))) as Cursor;
  if(decoded.v!==1||decoded.resource!==base.resource||decoded.mode!==base.mode||
    decoded.id!==base.id||decoded.query!==base.query||
    decoded.status!==base.status||!Number.isSafeInteger(decoded.offset)||
    decoded.offset<0||decoded.offset>10000)throw Error('Cursor mismatch');
  return decoded.offset;
 }catch{throw Error('Invalid notification cursor or filters')}
}
/** Read-only: registered device/hold command metadata is not a license to
 * return push credentials or notification transport payloads. */
export async function readNotificationRecords(
 c:Context,args:NotificationReadArgs,mode:Mode
):Promise<string>{
 if(!c.userId)throw Error('Authenticated owner required');
 const raw=args as Record<string,unknown>;
 if(['owner','ownerId','user_id','userId'].some(k=>k in raw))
   throw Error('Notification reads use the authenticated owner');
 if(args.project!==undefined||args.start!==undefined||args.end!==undefined||
    args.source!==undefined)throw Error('Unsupported notification filter');
 const resource=(mode==='get'?args.what:args.resource) as Resource;
 if(!resources.includes(resource))throw Error('Unknown notification resource');
 const maximum=mode==='get'?50:8;
 const limit=args.limit??(mode==='get'?20:5);
 if(!Number.isSafeInteger(limit)||limit<1||limit>maximum)
   throw Error('Notification limit must be 1..'+maximum);
 const id=args.id??null;
 if(id!==null&&(typeof id!=='string'||id.length<1||id.length>120))
   throw Error('Invalid notification id');
 if(id!==null&&resource==='notifications'&&!/^[1-9][0-9]{0,18}$/.test(id))
   throw Error('Invalid notification id');
 const status=args.status??null;
 if(status!==null&&(resource!=='notifications'||typeof status!=='string'||
   !['queued','sent','skipped','suppressed','failed'].includes(status)))
   throw Error('Unsupported notification status');
 const query=mode==='search'?args.query?.trim()??null:null;
 if(mode==='search'&&(!query||query.length<2||query.length>120))
   throw Error('Notification search requires 2..120 characters');
 const base={v:1 as const,resource,mode,id,query,status};
 const offset=offsetFor(args.cursor,base);
 const column=resource==='notify_holds'?'scope':'id';
 let q=c.db.from(resource).select(columns[resource].join(','),{count:'exact'})
   .eq('user_id',c.userId);
 if(id!==null)q=q.eq(column,id);
 if(status!==null)q=q.eq('status',status);
 if(query!==null){
   const searchColumn=resource==='push_devices'?'label':
     resource==='notify_holds'?'scope':'title';
   q=q.ilike(searchColumn,'%'+safeLike(query)+'%');
 }
 const {data,error,count}=await q.order(column,{ascending:resource!=='notifications'})
   .range(offset,offset+limit-1);
 if(error)throw Error(error.message);
 if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||
   data.length>limit)throw Error('Invalid notification read result');
 const items=data.map(x=>onlySafe(resource,x as Row));
 return JSON.stringify({resource,items,total:count,
  nextCursor:offset+items.length<count?
   encodeCursor({...base,offset:offset+items.length}):null});
}
