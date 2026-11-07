// N61.2.2.1: read-only owner-RLS overlap acknowledgement adapter.
// N61.2.2.2 owns versioned command writes and the mode-aware facade.
import {OverlapError} from './contract';
import type {NewOverlapAcknowledgement,OverlapAcknowledgement,OverlapApi,
  OverlapPage,OverlapParticipant,OverlapPatch,OverlapQuery} from './contract';
import {overlapIsStale,validateNewOverlap,validateOverlapPatch,validateOverlapQuery} from './validate';
import type {ValidatedOverlap} from './contract';

type Row=Record<string,unknown>;
type DbError={code?:string;message?:string};
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


type Operation='create'|'update'|'delete';
type Envelope={
  operationId:string;schemaVersion:1;resource:'overlap_acknowledgements';
  operation:Operation;target?:{id:string};expectedVersion?:number;
  patch:Record<string,unknown>;
};
type CommandReceipt={
  operationId:string;status:string;actionNo:number|null;
  changed?:Array<{id:string;version:number}>;
  conflict?:{reason?:string;currentVersion?:number};
};
function newOperationId():string{
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  if(!globalThis.crypto?.getRandomValues)
    return fail('invalid','Secure overlap operation IDs unavailable');
  const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
    hex.slice(16,20),hex.slice(20)].join('-');
}
function serverPatch(value:Partial<ValidatedOverlap>):Record<string,unknown>{
  const patch:Record<string,unknown>={};
  for(const [key,field] of [
    ['participants','participants'],['startsAt','starts_at'],
    ['endsAt','ends_at'],['reason','reason'],
    ['disposition','disposition'],['attributedTo','attributed_to'],
  ] as const)if(Object.prototype.hasOwnProperty.call(value,key))
    patch[field]=clone(value[key]);
  return patch;
}
async function command(envelope:Envelope):Promise<CommandReceipt>{
  const api=await client();
  // Recreate only from these frozen bytes: a retry never invents an ID,
  // changes a version or substitutes another patch after an uncertain write.
  const serialized=JSON.stringify(envelope);
  const invoke=()=>api.rpc('overlap_acknowledgements_command',
    {p:JSON.parse(serialized) as Envelope});
  let response=await invoke();
  if((response.error&&(!response.error.code||
       response.error.code==='0'||response.error.code==='NETWORK_ERROR'))||
     (!response.error&&response.data==null))
    response=await invoke();
  if(response.error){
    const e=response.error;
    if(e.code==='PGRST202'||e.code==='42883'||/function .*does not exist/i.test(e.message||''))
      return server('Overlap command is not deployed; nothing was saved');
    if(e.code==='23503'||e.code==='23514'||e.code==='22P02')
      return fail('invalid',e.message||'Invalid overlap command');
    if(e.code==='40001')return fail('conflict',e.message||'Overlap was changed');
    return server(e.message||'Overlap command outcome could not be confirmed');
  }
  if(!response.data||typeof response.data!=='object'||Array.isArray(response.data))
    return server('Overlap command returned no durable receipt');
  const receipt=response.data as CommandReceipt;
  if(receipt.operationId!==envelope.operationId)
    return server('Overlap receipt has a mismatched operationId');
  if(receipt.status==='conflict')return fail('conflict',
    receipt.conflict?.currentVersion!==undefined
      ?'Overlap version conflict; currentVersion='+receipt.conflict.currentVersion
      :(receipt.conflict?.reason||'Overlap operationId conflict'));
  if(receipt.status!=='ok'||typeof receipt.actionNo!=='number'||
     !Number.isSafeInteger(receipt.actionNo)||receipt.actionNo<1)
    return server('Overlap command returned no auditable success');
  return receipt;
}

export function createLiveOverlapApi(enableCommands=false):OverlapApi{
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
  async function readOne(key:string):Promise<OverlapAcknowledgement|null>{
    const api=await client();
    const response=await api.from('overlap_acknowledgements')
      .select('*').eq('id',id(key)).maybeSingle();
    error(response);
    if(response.data===null)return null;
    if(!response.data||Array.isArray(response.data)||
      typeof response.data!=='object')return server('Malformed overlap record');
    const records=await withStaleness([mapRow(response.data as Row)]);
    return records[0];
  }

  return {
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
    getAcknowledgement:readOne,
    async createAcknowledgement(input:NewOverlapAcknowledgement){
      if(!enableCommands)return refuse();
      const valid=validateNewOverlap(input);
      const receipt=await command({
        operationId:newOperationId(),schemaVersion:1,
        resource:'overlap_acknowledgements',operation:'create',
        patch:serverPatch(valid),
      });
      const key=receipt.changed?.[0]?.id;
      if(!key)return server('Create receipt omitted the new record ID');
      const record=await readOne(id(key));
      if(!record)return server('Created overlap is not owner-readable');
      return {record,actionNo:receipt.actionNo};
    },
    async updateAcknowledgement(key:string,expectedVersion:number,patch:OverlapPatch){
      if(!enableCommands)return refuse();
      const target=id(key);
      if(!Number.isInteger(expectedVersion)||expectedVersion<1||
         expectedVersion>2147483647)
        return fail('invalid','Expected overlap version must be a positive int32');
      const existing=await readOne(target);
      if(!existing)return fail('not_found','Overlap acknowledgement not found');
      if(existing.version!==expectedVersion)
        return fail('conflict','Overlap version conflict; currentVersion='+existing.version);
      const original={participants:existing.participants,
        startsAt:existing.startsAt,endsAt:existing.endsAt,
        reason:existing.reason,disposition:existing.disposition,
        attributedTo:existing.attributedTo};
      const validated=validateOverlapPatch(original,patch);
      const receipt=await command({
        operationId:newOperationId(),schemaVersion:1,
        resource:'overlap_acknowledgements',operation:'update',
        target:{id:target},expectedVersion,patch:serverPatch(validated),
      });
      const record=await readOne(target);
      if(!record)return server('Updated overlap is not owner-readable');
      return {record,actionNo:receipt.actionNo};
    },
    async deleteAcknowledgement(key:string,expectedVersion:number){
      if(!enableCommands)return refuse();
      const target=id(key);
      if(!Number.isInteger(expectedVersion)||expectedVersion<1||
         expectedVersion>2147483647)
        return fail('invalid','Expected overlap version must be a positive int32');
      const receipt=await command({
        operationId:newOperationId(),schemaVersion:1,
        resource:'overlap_acknowledgements',operation:'delete',
        target:{id:target},expectedVersion,patch:{},
      });
      if(await readOne(target))return server('Deleted overlap is still owner-readable');
      return {record:{id:target},actionNo:receipt.actionNo};
    },
  };
}
