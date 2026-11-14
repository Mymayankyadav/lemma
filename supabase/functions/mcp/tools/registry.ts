// N37: dynamic, owner-scoped MCP discovery and bounded registered reads.
// All table identifiers come from service-only lemma_command_resources, never
// from caller-supplied table/function names. Context.userId comes from auth.
import type {Context} from '../db.ts';

const RESOURCE=/^[a-z][a-z0-9_]{0,60}$/;
// Incident #1402: registered write-fields are command payload keys, and two registered commands use camelCase
// (reviewedAt, hintLevel, ...). Resource and operation names stay lower-case; HIDDEN still filters secrets.
const FIELD=/^[A-Za-z][A-Za-z0-9_]{0,60}$/;
export const SAVED_TIME_OPERATIONS:Record<string,string[]>={
 study_entries:['create_manual','correct','split','void','restore']};
// Reject both flat and nested service metadata. A registered write-field is
// not automatically a safe output field (e.g. connectorSecret or access_token).
const HIDDEN=/(?:secret|token|password|credential|api_?key|private_?key)|^(?:user_id|userId|owner_id|ownerId)$/i;
const TEXT_FIELDS=['title','label','name','text','intent','description','body',
 'summary','note','front','back','response','status'];
const MAX_OFFSET=1_000_000;
type RecordMap=Record<string,unknown>;
type Meta={resource:string;fields:string[];operations:string[]};
type Cursor={v:1;mode:'get'|'search';resource:string;query:string|null;
 status:string|null;id:string|null;offset:number};
export type GenericMode='get'|'search';
export type GenericReadArgs={what?:string;resource?:string;id?:string;
 limit?:number;cursor?:string;query?:string;status?:string;project?:string;
 start?:string;end?:string;source?:string};
const safeStrings=(v:unknown,pattern:RegExp=RESOURCE):string[]=>
 Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&
   pattern.test(x)).slice(0,100):[];
function sanitize(value:unknown,depth=0):unknown{
 if(typeof value==='string')return value.slice(0,4000);
 if(value===null||typeof value!=='object')return value;
 if(depth>=5)return '[nested data omitted]';
 if(Array.isArray(value))return value.slice(0,100).map(x=>sanitize(x,depth+1));
 const out:Record<string,unknown>={};
 for(const [key,entry] of Object.entries(value as Record<string,unknown>).slice(0,120))
  if(!HIDDEN.test(key))out[key]=sanitize(entry,depth+1);
 return out;
}

function readSchema(row:RecordMap):Meta{
 const resource=row.resource;
 if(typeof resource!=='string'||!RESOURCE.test(resource)||row.mcp_ok!==true)
  throw Error('Malformed registered resource metadata');
 let raw=row.schema;
 if(typeof raw==='string'){
  try{raw=JSON.parse(raw)}catch{throw Error('Malformed resource schema')}
 }
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw Error('Malformed resource schema');
 const schema=raw as RecordMap;
 if(!Array.isArray(schema.fields)||!Array.isArray(schema.operations)||
  schema.fields.some(x=>typeof x!=='string'||!FIELD.test(x))||
  schema.operations.some(x=>typeof x!=='string'||!RESOURCE.test(x)))
  throw Error('Malformed registered resource field or operation');
 return {resource,fields:safeStrings(schema.fields,FIELD),
  operations:safeStrings(schema.operations)};
}
async function metadata(c:Context,resource:string):Promise<Meta>{
 if(!c.userId)throw Error('Authenticated owner required');
 if(!RESOURCE.test(resource))throw Error('Invalid registered resource');
 // Registry is readable only by the privileged Edge connector; it cannot
 // authorize a tenant row from another owner.
 const {data,error}=await c.db.from('lemma_command_resources')
  .select('resource,mcp_ok,schema').eq('resource',resource)
  .eq('mcp_ok',true).maybeSingle();
 if(error)throw Error(error.message);
 if(!data)throw Error('Unknown or disabled registered resource');
 return readSchema(data as RecordMap);
}
export async function registeredResources(c:Context):Promise<string>{
 if(!c.userId)throw Error('Authenticated owner required');
 const {data,error}=await c.db.from('lemma_command_resources')
  .select('resource,mcp_ok,schema').eq('mcp_ok',true)
  .order('resource',{ascending:true}).limit(100);
 if(error)throw Error(error.message);
 if(!Array.isArray(data))throw Error('Invalid registered resource inventory');
 // N160: saved-time corrections run through study_command (N91) and are not in
 // the registry row, which is seeded and cannot be edited by a migration. They are
 // listed here so chat can discover them; study_command enforces them.
 return JSON.stringify({resources:data.map(x=>{
  const meta=readSchema(x as RecordMap);
  const extra=SAVED_TIME_OPERATIONS[meta.resource];
  return extra?{...meta,operations:[...meta.operations,...extra.filter(o=>!meta.operations.includes(o))]}:meta;
 })});
}
const safeLike=(s:string)=>s.replace(/[\\%_]/g,'\\$&');
function pageLimit(raw:unknown,mode:GenericMode):number{
 const max=mode==='get'?50:8;
 const n=raw??(mode==='get'?20:5);
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1||n>max)
  throw Error('Registered resource page limit must be 1..'+max);
 return n;
}
function cursorEncode(c:Cursor):string{
 // btoa expects Latin-1, but owner search terms may contain Greek/Devanagari
 // or other UTF-8 text. Encode the JSON as bytes before base64url.
 const bytes=new TextEncoder().encode(JSON.stringify(c));
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return 'rg1:'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function cursorDecode(raw:unknown,base:Omit<Cursor,'offset'>):number{
 if(raw==null)return 0;
 if(typeof raw!=='string'||raw.length>4096||!/^rg1:[A-Za-z0-9_-]+$/.test(raw))
  throw Error('Invalid registered resource cursor');
 try{
  const token=raw.slice(4);
  const binary=atob(token.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-token.length%4)%4));
  const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Cursor;
  if(value.v!==1||value.mode!==base.mode||value.resource!==base.resource||
   value.query!==base.query||value.status!==base.status||value.id!==base.id||
   !Number.isSafeInteger(value.offset)||value.offset<0||value.offset>MAX_OFFSET)
   throw Error('Cursor filter mismatch');
  return value.offset;
 }catch{throw Error('Invalid registered resource cursor or filters')}
}
function projection(row:RecordMap,fields:readonly string[]):RecordMap{
 const allowed=new Set(['id','version',...fields.filter(f=>!HIDDEN.test(f))]);
 const visible:RecordMap={};
 for(const key of allowed){
  if(key in row) {
   const value=row[key];
   visible[key]=sanitize(value);
  }
 }
 return visible;
}
/** One exact filtered count plus an ordered owner-filtered page, at most 50
 * rows per call (8 for search). Never expose user_id or unknown columns. */
export async function readRegisteredResource(c:Context,args:GenericReadArgs,mode:GenericMode):Promise<string>{
 if(!c.userId)throw Error('Authenticated owner required');
 const raw=args as RecordMap;
 if(['owner','ownerId','user_id','userId'].some(k=>k in raw))
  throw Error('Registered reads use authenticated owner; omit owner arguments');
 const resource=(mode==='get'?args.what:args.resource)??'';
 const info=await metadata(c,resource);
 if(args.project!==undefined||args.start!==undefined||args.end!==undefined||
    args.source!==undefined)
  throw Error('This registered resource does not expose project/time/source filters');
 const limit=pageLimit(args.limit,mode);
 const id=args.id??null;
 if(id!==null&&(typeof id!=='string'||!id.length||id.length>80))
  throw Error('Invalid registered record ID');
 const status=args.status??null;
 if(status!==null&&(!info.fields.includes('status')||
  typeof status!=='string'||status.length>80))
  throw Error('Status filter is not registered for this resource');
 const query=mode==='search'?args.query?.trim()??null:null;
 if(mode==='search'&&(!query||query.length<2||query.length>120))
  throw Error('Registered text search requires 2..120 characters');
 const textField=mode==='search'?TEXT_FIELDS.find(k=>info.fields.includes(k))??null:null;
 if(mode==='search'&&!textField)throw Error('No registered searchable text field');
 const base={v:1 as const,mode,resource,query,status,id};
 const offset=cursorDecode(args.cursor,base);
 if(offset+limit>MAX_OFFSET+50)throw Error('Registered page offset exceeded');
 // Only mcp_ok registry entries may authorize this table name. Owner filter
 // is part of the database query, not post-fetch filtering of an unscoped page.
 let q=c.db.from(info.resource).select('*',{count:'exact'}).eq('user_id',c.userId);
 if(id!==null)q=q.eq('id',id);
 if(status!==null)q=q.eq('status',status);
 if(query!==null&&textField!==null)q=q.ilike(textField,'%'+safeLike(query)+'%');
 const {data,error,count}=await q.order('id',{ascending:true})
  .range(offset,offset+limit-1);
 if(error)throw Error(error.message);
 if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||
  data.length>limit)throw Error('Invalid bounded registered read response');
 const items=data.map(row=>projection(row as RecordMap,info.fields));
 return JSON.stringify({resource,items,total:count,
  nextCursor:offset+items.length<count?
   cursorEncode({...base,offset:offset+items.length}):null});
}
