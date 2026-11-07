// N61.2.2.1: read-only owner-RLS overlap acknowledgement adapter.
// N61.2.2.2 owns versioned command writes and the mode-aware facade.
import {OverlapError} from './contract';
import type {NewOverlapAcknowledgement,OverlapAcknowledgement,OverlapApi,
  OverlapPage,OverlapParticipant,OverlapPatch,OverlapQuery,ValidatedOverlap} from './contract';
import {overlapIsStale,validateNewOverlap,validateOverlapPatch,
  validateOverlapQuery} from './validate';

type Row=Record<string,unknown>;
type DbError={code?:string;message?:string};
type Changed={id:string;version:number};
type CommandReceipt={status:'ok'|'conflict';changed?:Changed[];
  actionNo?:number|null;conflict?:{currentVersion?:number;reason?:string}};
type Operation='create'|'update'|'delete';
type CommandEnvelope={operationId:string;schemaVersion:1;
  resource:'overlap_acknowledgements';operation:Operation;
  target?:{id:string};expectedVersion?:number;patch:Row};
type Cursor={v:1;filter:string;start:string;id:string};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const BATCH=50;
const MAX_ROWS=20000;
const clone=<T>(value:T):T=>structuredClone(value);
const fail=(code:'invalid'|'not_found'|'conflict',message:string):never=>{
  throw new OverlapError(code,message);
};
const server=(message:string):never=>{throw new Error('Live overlaps: '+message)};
async function client(){return (await import('../live/client')).liveClient()}
function id(value:unknown):string{
  if(typeof value!=='string'||!UUID.test(value))
    return fail('invalid','Expected overlap acknowledgement UUID');
  return value.toLowerCase();
}
function fromInstant(value:unknown):string{
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))
    return server('Malformed timestamp in owner-visible row');
  const normalized=new Date(value).toISOString();
  // Require explicit instant syntax: never reinterpret server-local civil time.
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value))
    return server('Server returned a timezone-naive timestamp');
  return normalized;
}
function int4(value:unknown):number{
  if(typeof value!=='number'||!Number.isInteger(value)||
     value<1||value>2147483647)
    return server('Invalid version in owner-visible row');
  return value;
}
function mapRow(row:Row):Omit<OverlapAcknowledgement,'stale'>{
  if(typeof row.id!=='string'||!UUID.test(row.id))
    return server('Invalid row ID');
  const typed=validateNewOverlap({
    participants:row.participants as OverlapParticipant[],
    startsAt:fromInstant(row.starts_at),
    endsAt:fromInstant(row.ends_at),
    reason:row.reason as string|null,
    disposition:row.disposition as NewOverlapAcknowledgement['disposition'],
    attributedTo:row.attributed_to as NewOverlapAcknowledgement['attributedTo'],
  });
  if(!['app','mcp','worker'].includes(String(row.source)))
    return server('Invalid source in owner-visible row');
  return {
    ...typed,id:row.id.toLowerCase(),version:int4(row.version),
    source:row.source as 'app'|'mcp'|'worker',
    createdAt:fromInstant(row.created_at),updatedAt:fromInstant(row.updated_at),
  };
}
function error(result:{error:DbError|null}):void{
  if(result.error){
    const e=result.error;
    if(e.code==='22P02'||e.code==='23514')
      fail('invalid',e.message||'Invalid overlap read');
    server(e.message||'Owner-scoped overlap read failed');
  }
}
function encode(c:Cursor):string{
  return btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_')
    .replace(/=+$/,'');
}
function decode(raw:string|null|undefined,filter:string):Cursor|null{
  if(raw==null)return null;
  try{
    if(typeof raw!=='string'||raw.length>4096||
       !/^[A-Za-z0-9_-]+$/.test(raw))return fail('invalid','Invalid overlap cursor');
    const decoded=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
      '='.repeat((4-raw.length%4)%4))) as unknown;
    if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))
      return fail('invalid','Invalid overlap cursor');
    const c=decoded as Cursor;
    if(c.v!==1||c.filter!==filter||typeof c.start!=='string'||
       !Number.isFinite(Date.parse(c.start))||!UUID.test(c.id))
      return fail('invalid','Cursor belongs to a different overlap filter');
    return c;
  }catch{return fail('invalid','Invalid overlap cursor')}
}
function compare(a:Pick<OverlapAcknowledgement,'startsAt'|'id'>,
  b:Pick<OverlapAcknowledgement,'startsAt'|'id'>):number{
  return a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id);
}
function filterKey(query:OverlapQuery):string{
  return JSON.stringify({from:query.from??null,to:query.to??null,
    stale:query.stale??null});
}
function chunks<T>(values:T[],size=BATCH):T[][]{
  const out:T[][]=[];
  for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));
  return out;
}
function refuse():never{
  return server('Versioned overlap writes require N61.2.2.2 and N47.2.3; no mutation sent');
}


function newOperationId():string{
  const crypto=globalThis.crypto;
  if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
  if(!crypto?.getRandomValues)return server('Secure command ID generation unavailable');
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
    hex.slice(16,20),hex.slice(20)].join('-');
}
function expectedVersion(value:number):number{
  if(!Number.isInteger(value)||value<1||value>2147483647)
    return fail('invalid','Expected acknowledgement version must be a positive int32');
  return value;
}
function columns(input:Partial<ValidatedOverlap>):Row{
  const out:Row={};
  const map={participants:'participants',startsAt:'starts_at',
    endsAt:'ends_at',reason:'reason',disposition:'disposition',
    attributedTo:'attributed_to'} as const;
  for(const field of Object.keys(map) as Array<keyof typeof map>)
    if(Object.prototype.hasOwnProperty.call(input,field))
      out[map[field]]=clone(input[field]);
  return out;
}
function rpcError(err:DbError):Error{
  const message=err.message||'Overlap command failed',code=err.code||'';
  if(code==='42883'||code==='PGRST202'||/function .*not found|undefined function/i.test(message))
    return new Error('Live overlaps: N47.2.3 command is not deployed; no mutation applied');
  if(code==='23505'||/conflict|version|stale|operation.?id|changed.?payload|already exists/i.test(message))
    return new OverlapError('conflict',message);
  if(/not found|missing owner row/i.test(message))
    return new OverlapError('not_found',message);
  if(['22P02','23514','23503','22007','22008'].includes(code)||
    /invalid|unknown|required|unsupported|forbidden|must be/i.test(message))
    return new OverlapError('invalid',message);
  return new Error('Live overlaps: '+message);
}
/** Default direct callers remain read-only until audited SQL is deployed.
 * The module facade opts into RPC and still fails closed if N47.2.3 is absent.
 */
export function createLiveOverlapApi(options:{commandReady?:boolean}={}):OverlapApi{
  async function currentParticipants(rows:ReadonlyArray<
    Pick<OverlapAcknowledgement,'participants'>>):Promise<OverlapParticipant[]>{
    // Each query is owner-RLS scoped by the authenticated browser session.
    // We never accept, filter by or send a caller-supplied user ID.
    const all=new Map<'entry'|'block',Set<string>>([
      ['entry',new Set()],['block',new Set()],
    ]);
    for(const row of rows)for(const p of row.participants)
      all.get(p.kind)?.add(p.id);
    const api=await client();
    const result:OverlapParticipant[]=[];
    for(const [kind,table] of [
      ['entry','study_entries'],['block','calendar_blocks'],
    ] as const){
      for(const ids of chunks([...all.get(kind)!])){
        const response=await api.from(table).select('id,version').in('id',ids);
        error(response);
        if(!Array.isArray(response.data))return server('Invalid participant read');
        for(const row of response.data as Row[]){
          if(typeof row.id!=='string'||!UUID.test(row.id))
            return server('Invalid participant ID');
          result.push({kind,id:row.id.toLowerCase(),version:int4(row.version)});
        }
      }
    }
    return result;
  }
  async function withStaleness(
    rows:Array<Omit<OverlapAcknowledgement,'stale'>>
  ):Promise<OverlapAcknowledgement[]>{
    if(!rows.length)return [];
    const versions=await currentParticipants(rows);
    return rows.map(row=>clone({...row,stale:overlapIsStale(row.participants,versions)}));
  }
  async function listRows(query:OverlapQuery):Promise<Array<
    Omit<OverlapAcknowledgement,'stale'>>>{
    const api=await client(),rows:Row[]=[];
    for(let offset=0;offset<=MAX_ROWS;offset+=BATCH){
      let request=api.from('overlap_acknowledgements').select('*')
        .order('starts_at',{ascending:true}).order('id',{ascending:true})
        .range(offset,offset+BATCH-1);
      if(query.from)request=request.gt('ends_at',query.from);
      if(query.to)request=request.lt('starts_at',query.to);
      const response=await request;
      error(response);
      if(!Array.isArray(response.data))
        return server('Malformed overlap page');
      const page=response.data as Row[];
      if(page.length>BATCH)return server('Owner page exceeded 50 records');
      rows.push(...page);
      if(page.length<BATCH)return rows.map(mapRow);
    }
    return server('Too many acknowledgements for bounded owner scan');
  }

  // A transient error or failed post-receipt readback may follow a commit.
  // Retain the byte-identical RPC envelope for a later identical retry.
  const pending=new Map<string,CommandEnvelope>();
  async function write<T>(operation:Operation,
    fields:Pick<CommandEnvelope,'patch'|'target'|'expectedVersion'>,
    resolve:(change:Changed)=>Promise<T>):Promise<{record:T;actionNo:number|null}>{
    const base={schemaVersion:1 as const,resource:'overlap_acknowledgements' as const,
      operation,...fields};
    const key=JSON.stringify(base);
    const envelope:CommandEnvelope=pending.get(key)??{
      ...base,operationId:newOperationId(),
    };
    pending.set(key,envelope);
    try{
      const api=await client();
      const response=await api.rpc('overlap_acknowledgements_command',{p:envelope});
      if(response.error)throw rpcError(response.error);
      const receipt=response.data as CommandReceipt|null;
      if(receipt?.status==='conflict'){
        const current=receipt.conflict?.currentVersion;
        throw new OverlapError('conflict',
          'Overlap command conflict'+(current===undefined?'':` (current ${current})`),
          Number.isInteger(current)?current:undefined,receipt.conflict?.reason);
      }
      if(receipt?.status!=='ok'||!Array.isArray(receipt.changed)||
        receipt.changed.length!==1||
        typeof receipt.changed[0].id!=='string'||!UUID.test(receipt.changed[0].id)||
        !Number.isInteger(receipt.changed[0].version)||
        receipt.changed[0].version<1||receipt.changed[0].version>2147483647||
        !Number.isSafeInteger(receipt.actionNo)||receipt.actionNo!<1)
        return server('Invalid or unaudited overlap command receipt');
      const change={id:id(receipt.changed[0].id),
        version:receipt.changed[0].version};
      const record=await resolve(change);
      pending.delete(key);
      return {record:clone(record),actionNo:receipt.actionNo!};
    }catch(cause){
      // Definitive conflicts/invalid commands may be retried as new actions;
      // unknown transport/readback outcomes must retain the same operationId.
      if(cause instanceof OverlapError||
        (cause instanceof Error&&cause.message.includes('N47.2.3 command is not deployed')))
        pending.delete(key);
      throw cause;
    }
  }
  const adapter:OverlapApi={
    mode:'live',
    async listAcknowledgements(query:OverlapQuery={}):Promise<OverlapPage<OverlapAcknowledgement>>{
      const q=validateOverlapQuery(query),filter=filterKey(q);
      const cursor=decode(q.cursor,filter);
      // Exact stale-filter counts require examining current owner versions.
      // Each backing query remains bounded to at most 50 rows/IDs.
      const records=(await withStaleness(await listRows(q))).sort(compare);
      const matching=records.filter(row=>q.stale===undefined||row.stale===q.stale);
      const after=matching.filter(row=>!cursor||compare(row,{
        startsAt:cursor.start,id:cursor.id})>0);
      const size=q.limit??20,items=after.slice(0,size),last=items.at(-1);
      return {items:clone(items),total:matching.length,
        nextCursor:last&&after.length>size?
          encode({v:1,filter,start:last.startsAt,id:last.id}):null};
    },
    async getAcknowledgement(key:string):Promise<OverlapAcknowledgement|null>{
      const api=await client();
      const response=await api.from('overlap_acknowledgements')
        .select('*').eq('id',id(key)).maybeSingle();
      error(response);
      if(response.data===null)return null;
      if(!response.data||Array.isArray(response.data)||
        typeof response.data!=='object')return server('Malformed overlap record');
      const records=await withStaleness([mapRow(response.data as Row)]);
      return records[0];
    },
    async createAcknowledgement(input:NewOverlapAcknowledgement){
      if(!options.commandReady)return refuse();
      const normalized=validateNewOverlap(input);
      return write('create',{patch:columns(normalized)},async changed=>{
        const actual=await adapter.getAcknowledgement(changed.id);
        if(!actual||actual.version!==changed.version)
          return server('Created acknowledgement not visible after receipt');
        if(actual.source!=='app')return server('Unexpected overlap provenance');
        return actual;
      });
    },
    async updateAcknowledgement(key:string,expected:number,patch:OverlapPatch){
      if(!options.commandReady)return refuse();
      const target=id(key);
      expectedVersion(expected);
      const before=await adapter.getAcknowledgement(target);
      if(!before)return fail('not_found','Overlap acknowledgement not found');
      const validated=validateOverlapPatch(before,patch);
      return write('update',{target:{id:target},expectedVersion:expected,
        patch:columns(validated)},async changed=>{
        if(changed.id!==target)return server('Updated the wrong acknowledgement');
        const actual=await adapter.getAcknowledgement(target);
        if(!actual||actual.version!==changed.version)
          return server('Updated acknowledgement not visible after receipt');
        if(actual.source!=='app')return server('Unexpected overlap provenance');
        return actual;
      });
    },
    async deleteAcknowledgement(key:string,expected:number){
      if(!options.commandReady)return refuse();
      const target=id(key);
      expectedVersion(expected);
      return write('delete',{target:{id:target},expectedVersion:expected,
        patch:{}},async changed=>{
        if(changed.id!==target)return server('Deleted the wrong acknowledgement');
        if(await adapter.getAcknowledgement(target))
          return server('Deleted acknowledgement still visible after receipt');
        return {id:target};
      });
    },
  };
  return adapter;
}
