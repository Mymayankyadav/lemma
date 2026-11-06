// N55/D8(c): owner-RLS live adapter for the N41 presets_command envelope.
// No service-role credentials and no direct client-side writes to public.presets.
import { LemmaError } from '../api';
import type { StudyReceipt } from '../study/contract';
import type { NewPreset, PresetApi, PresetArchive, PresetPatch, PresetQuery, PresetRecord } from './contract';
import { checkId, checkPosition, checkVersion, decodeCursor, encodeCursor,
  invalid, normalize, normalizeQuery } from './validate';

type Row = Record<string, unknown>;
type SqlError = {code?:string;message?:string};
type Changed = {id:string;version:number};
type CommandReceipt = {
  status:'ok'|'conflict';changed:Changed[];actionNo?:number|null;
  conflict?:{currentVersion?:number};
};
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function client(){return (await import('../live/client')).liveClient();}
function uuid():string {
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  if(!globalThis.crypto?.getRandomValues)throw new LemmaError('server','Secure UUID generation unavailable');
  const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function sqlError(e:SqlError):LemmaError {
  const message=e.message||'Preset operation failed';
  if(e.code==='23505'||/conflict|version|already exists|duplicate/i.test(message))
    return new LemmaError('conflict',message);
  if(/not found|no rows/i.test(message))return new LemmaError('not_found',message);
  if(['23503','23514','22P02','22007'].includes(e.code??'')||
    /invalid|required|constraint|unsupported|unknown|must be/i.test(message))
    return new LemmaError('invalid',message);
  return new LemmaError('server',message);
}
function unwrap<T>(response:{data:T|null;error:SqlError|null}):T {
  if(response.error)throw sqlError(response.error);
  return response.data as T;
}
function liveId(id:string):string {
  checkId(id);
  if(!uuidPattern.test(id))invalid('Invalid preset ID');
  return id;
}
function mapPreset(row:Row):PresetRecord {
  return {
    id:String(row.id),label:String(row.label),
    subjectId:row.subject_id==null?null:String(row.subject_id),
    projectId:row.project_id==null?null:String(row.project_id),
    checkpointId:row.checkpoint_id==null?null:String(row.checkpoint_id),
    mode:row.mode as PresetRecord['mode'],
    focusMinutes:Number(row.focus_minutes),breakMinutes:Number(row.break_minutes),
    longBreakMinutes:Number(row.long_break_minutes),cycles:Number(row.cycles),
    position:Number(row.position),
    archivedAt:row.archived_at==null?null:String(row.archived_at),
    version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
  };
}
function snake(input:object):Row {
  const columns:Record<string,string>={
    label:'label',mode:'mode',focusMinutes:'focus_minutes',
    breakMinutes:'break_minutes',longBreakMinutes:'long_break_minutes',cycles:'cycles',
    position:'position',subjectId:'subject_id',projectId:'project_id',checkpointId:'checkpoint_id',
  };
  const result:Row={};
  for(const [key,value] of Object.entries(input)) {
    if(!(key in columns))invalid('Unsupported preset field '+key);
    result[columns[key]]=value;
  }
  return result;
}
function filterQuery<T extends {is:(name:string,value:null)=>T;not:(name:string,op:string,value:null)=>T}>(
  q:T,archived:PresetArchive
):T {
  if(archived==='active')return q.is('archived_at',null);
  if(archived==='archived')return q.not('archived_at','is',null);
  return q;
}
function after(cursor:{position:number;createdAt:string;id:string}):string {
  const p=cursor.position,t=cursor.createdAt,id=cursor.id;
  return [
    'position.gt.'+p,
    'and(position.eq.'+p+',created_at.gt.'+t+')',
    'and(position.eq.'+p+',created_at.eq.'+t+',id.gt.'+id+')',
  ].join(',');
}

export function createLivePresetApi():PresetApi {
  // An ambiguous result is retried with the same operationId and same payload.
  // A confirmed response or validation conflict releases that ID.
  const retries=new Map<string,string>();
  async function read(id:string):Promise<PresetRecord|null> {
    // Validate before creating a query builder: malformed IDs must never
    // initiate even an owner-scoped read from the live SDK.
    const validId=liveId(id);
    const api=await client();
    const row=unwrap<Row|null>(await api.from('presets').select('*')
      .eq('id',validId).maybeSingle());
    return row?mapPreset(row):null;
  }
  async function requiredRead(id:string):Promise<PresetRecord> {
    const record=await read(id);
    if(!record)throw new LemmaError('not_found','Saved preset not found after the command');
    return record;
  }
  async function write<T>(
    operation:'create'|'update'|'reorder'|'archive'|'restore'|'delete',args:Row,
    resolve:(changed:Changed)=>Promise<T>
  ):Promise<StudyReceipt<T>> {
    const base={schemaVersion:1,resource:'presets',operation,...args};
    const key=JSON.stringify(base);
    const operationId=retries.get(key)??uuid();
    let applied=false;
    try {
      const api=await client();
      const receipt=unwrap<CommandReceipt>(await api.rpc('presets_command',{p:{operationId,...base}}));
      if(receipt?.status==='conflict')
        throw new LemmaError('conflict','Preset changed elsewhere (current version '+
          (receipt.conflict?.currentVersion??'unknown')+')');
      if(receipt?.status!=='ok'||!Array.isArray(receipt.changed)||
        receipt.changed.length!==1||typeof receipt.changed[0].id!=='string'||
        !Number.isSafeInteger(receipt.changed[0].version))
        throw new LemmaError('server','Invalid presets_command receipt');
      applied=true;
      const record=await resolve(receipt.changed[0]);
      retries.delete(key);
      return {record,actionNo:Number.isSafeInteger(receipt.actionNo)?receipt.actionNo!:null};
    }catch(error) {
      if(applied||!(error instanceof LemmaError)||error.code==='server'||error.code==='offline')
        retries.set(key,operationId);
      else retries.delete(key);
      throw error;
    }
  }
  return {
    mode:'live',
    async listPresets(query:PresetQuery={}){
      const {archived,limit}=normalizeQuery(query);
      const cursor=decodeCursor(query.cursor,archived);
      if(cursor&&!uuidPattern.test(cursor.id))invalid('Invalid preset cursor ID');
      const api=await client();
      const counted=await filterQuery(api.from('presets').select('id',{count:'exact',head:true}),archived);
      if(counted.error)throw sqlError(counted.error);
      const total=counted.count;
      if(total===null||!Number.isSafeInteger(total)||total<0)
        throw new LemmaError('server','Preset total unavailable');
      let q=filterQuery(api.from('presets').select('*'),archived);
      if(cursor)q=q.or(after(cursor));
      const result=await q.order('position',{ascending:true})
        .order('created_at',{ascending:true}).order('id',{ascending:true}).limit(limit+1);
      const rows=unwrap<Row[]>(result);
      const items=rows.slice(0,limit).map(mapPreset);
      return {items,total,nextCursor:rows.length>limit&&items.length?
        encodeCursor(items[items.length-1],archived):null};
    },
    getPreset:read,
    async createPreset(input:NewPreset){
      const n=normalize(input,true);
      const columns=snake({
        label:n.label!,mode:n.mode??'pomodoro',focusMinutes:n.focusMinutes??25,
        breakMinutes:n.breakMinutes??5,longBreakMinutes:n.longBreakMinutes??15,
        cycles:n.cycles??4,position:n.position??0,
        subjectId:n.subjectId??null,projectId:n.projectId??null,
        checkpointId:n.checkpointId??null,
      });
      return write('create',{patch:columns},async changed=>
        requiredRead(changed.id)
      );
    },
    async updatePreset(id:string,expectedVersion:number,patch:PresetPatch){
      liveId(id);checkVersion(expectedVersion);
      const columns=snake(normalize(patch,false));
      return write('update',{target:{id},expectedVersion,patch:columns},async changed=>
        requiredRead(changed.id)
      );
    },
    async reorderPreset(id:string,expectedVersion:number,position:number){
      liveId(id);checkVersion(expectedVersion);checkPosition(position);
      return write('reorder',{target:{id},expectedVersion,patch:{position}},async changed=>
        requiredRead(changed.id)
      );
    },
    async archivePreset(id:string,expectedVersion:number){
      liveId(id);checkVersion(expectedVersion);
      return write('archive',{target:{id},expectedVersion,patch:{}},async changed=>
        requiredRead(changed.id)
      );
    },
    async restorePreset(id:string,expectedVersion:number){
      liveId(id);checkVersion(expectedVersion);
      return write('restore',{target:{id},expectedVersion,patch:{}},async changed=>
        requiredRead(changed.id)
      );
    },
    async deletePreset(id:string,expectedVersion:number){
      liveId(id);checkVersion(expectedVersion);
      return write('delete',{target:{id},expectedVersion,patch:{}},async changed=>({id:changed.id}));
    },
  };
}
