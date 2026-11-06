// N24 live task adapter; all reads run under the browser client's owner RLS.
import { LemmaError } from '../api';
import type { NewTask, TaskApi, TaskDue, TaskPatch, TaskPriority, TaskQuery, TaskRecord, TaskStatus } from './contract';
import type { StudyReceipt } from '../study/contract';

type Row = Record<string, unknown>;
type Operation = 'create' | 'update' | 'delete';
type SqlError = { code?: string; message?: string };
type Changed = { id: string; version: number };
type CommandReceipt = { status: 'ok' | 'conflict'; changed: Changed[]; actionNo?: number | null; conflict?: {currentVersion?: number} };
type Cursor = { v: 1; f: string; s: TaskStatus; p: number; t: string; i: string };
const statuses: TaskStatus[] = ['backlog', 'in_progress', 'completed', 'cancelled'];
const priorities: TaskPriority[] = ['low', 'normal', 'high'];
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timePattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const fail = (code: 'invalid' | 'conflict' | 'not_found' | 'server', message: string): never => {
  throw new LemmaError(code, message);
};
// Demo mode never loads the SDK.
async function client() { return (await import('../live/client')).liveClient(); }
function uuid(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (!crypto?.getRandomValues) return fail('server', 'Secure UUID generation unavailable');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function mapError(error: SqlError): LemmaError {
  const message = error.message || 'Task operation failed';
  if (error.code === '23505' || /conflict|version|duplicate|already exists/i.test(message)) return new LemmaError('conflict',message);
  if (/not found|no rows/i.test(message)) return new LemmaError('not_found',message);
  if (['23503','23514','22P02'].includes(error.code ?? '') || /invalid|unknown|required|constraint|unsupported|must be/i.test(message))
    return new LemmaError('invalid',message);
  return new LemmaError('server',message);
}
function unwrap<T>(response: {data: T | null; error: SqlError | null}): T {
  if (response.error) throw mapError(response.error);
  return response.data as T;
}
function dueFromRow(row: Row): TaskDue {
  if (row.due_kind === 'date') return {kind:'date',date:String(row.due_date)};
  if (row.due_kind === 'instant') return {kind:'instant',at:String(row.due_at)};
  return {kind:'none'};
}
function mapTask(row: Row): TaskRecord {
  return {
    id:String(row.id), title:String(row.title), body:String(row.body ?? ''),
    subjectId:row.subject_id == null ? null : String(row.subject_id),
    projectId:row.project_id == null ? null : String(row.project_id),
    checkpointId:row.checkpoint_id == null ? null : String(row.checkpoint_id),
    estimateMinutes:row.estimate_minutes == null ? null : Number(row.estimate_minutes),
    priority:row.priority as TaskPriority,due:dueFromRow(row),
    position:Number(row.position),status:row.status as TaskStatus,
    completedAt:row.completed_at == null ? null : String(row.completed_at),
    version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
  };
}
function dateOnly(value: string): boolean {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) &&
    Number.isFinite(Date.parse(value+'T00:00:00Z')) &&
    new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
function duePatch(due: TaskDue): Row {
  if (!due || typeof due !== 'object') fail('invalid','Invalid task due value');
  if (due.kind === 'none') return {due_kind:'none',due_date:null,due_at:null};
  if (due.kind === 'date') {
    if (!dateOnly(due.date)) fail('invalid','Invalid task due date');
    return {due_kind:'date',due_date:due.date,due_at:null};
  }
  if (due.kind === 'instant') {
    if (typeof due.at !== 'string' || !timePattern.test(due.at) || !Number.isFinite(Date.parse(due.at)))
      fail('invalid','Task due instant requires a timezone');
    return {due_kind:'instant',due_date:null,due_at:due.at};
  }
  return fail('invalid','Unknown task due kind');
}
function patchColumns(patch: TaskPatch): Row {
  const out:Row={};
  for (const [key,column] of [['title','title'],['body','body']] as const) {
    const value=patch[key];
    if (value!==undefined) {
      if (typeof value!=='string' || (key==='title' && !value.trim())) fail('invalid','Invalid task '+key);
      out[column]=key==='title'?value.trim():value;
    }
  }
  for(const [key,column] of [['subjectId','subject_id'],['projectId','project_id'],['checkpointId','checkpoint_id']] as const)
    if (patch[key]!==undefined) out[column]=patch[key];
  if (patch.estimateMinutes!==undefined) {
    if (patch.estimateMinutes!==null && (!Number.isInteger(patch.estimateMinutes) ||
        patch.estimateMinutes<0 || patch.estimateMinutes>2147483647)) fail('invalid','Invalid estimate');
    out.estimate_minutes=patch.estimateMinutes;
  }
  if(patch.priority!==undefined) {
    if(!priorities.includes(patch.priority)) fail('invalid','Invalid priority');
    out.priority=patch.priority;
  }
  if(patch.status!==undefined) {
    if(!statuses.includes(patch.status)) fail('invalid','Invalid status');
    out.status=patch.status;
  }
  if(patch.position!==undefined) {
    if(!Number.isInteger(patch.position) || patch.position<-2147483648 || patch.position>2147483647)
      fail('invalid','Invalid position');
    out.position=patch.position;
  }
  if(patch.due!==undefined) Object.assign(out,duePatch(patch.due));
  return out;
}
function normalize(query:TaskQuery):{limit:number;filter:TaskStatus[];cursor:Cursor|null} {
  const limit=query.limit??20;
  if(!Number.isSafeInteger(limit)||limit<1||limit>50) fail('invalid','Task page size must be 1..50');
  const filter=query.status===undefined?['backlog','in_progress'] as TaskStatus[]:query.status;
  if(!Array.isArray(filter)||filter.some(s=>!statuses.includes(s))) fail('invalid','Invalid task status filter');
  const selected=[...new Set(filter)].sort();
  const signature=selected.join(',');
  let cursor:Cursor|null=null;
  if(query.cursor!=null) {
    try {
      if(typeof query.cursor!=='string'||!/^[A-Za-z0-9_-]{4,900}$/.test(query.cursor)) fail('invalid','Invalid cursor');
      const padded=query.cursor.replace(/-/g,'+').replace(/_/g,'/');
      const value:unknown=JSON.parse(atob(padded+'='.repeat((4-padded.length%4)%4)));
      if(!value||typeof value!=='object') fail('invalid','Invalid cursor');
      const token=value as Cursor;
      if(token.v!==1||token.f!==signature||!statuses.includes(token.s)||
         !Number.isInteger(token.p)||token.p<-2147483648||token.p>2147483647||
         typeof token.t!=='string'||!timePattern.test(token.t)||!Number.isFinite(Date.parse(token.t))||
         typeof token.i!=='string'||!idPattern.test(token.i)) fail('invalid','Invalid or mismatched task cursor');
      cursor=token;
    }catch { fail('invalid','Invalid or mismatched task cursor'); }
  }
  return {limit,filter:selected,cursor};
}
function makeCursor(row:TaskRecord,filter:TaskStatus[]):string {
  const value:Cursor={v:1,f:filter.join(','),s:row.status,p:row.position,t:row.createdAt,i:row.id};
  return btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function after(cursor:Cursor):string {
  const {s,p,t,i}=cursor;
  // Exact lexicographic successor to status, position, created_at, id.
  return [
    'status.gt.'+s,
    'and(status.eq.'+s+',position.gt.'+p+')',
    'and(status.eq.'+s+',position.eq.'+p+',created_at.gt.'+t+')',
    'and(status.eq.'+s+',position.eq.'+p+',created_at.eq.'+t+',id.gt.'+i+')',
  ].join(',');
}
function version(expected:number):void {
  if(!Number.isSafeInteger(expected)||expected<=0) fail('invalid','Expected task version must be positive');
}

export function createLiveTaskApi():TaskApi {
  // Retry one unknown outcome with the original operationId. Confirmed results
  // clear the slot, so intentional repeated creates get fresh operation IDs.
  const retryIds=new Map<string,string>();
  async function readTask(key:string):Promise<TaskRecord|null> {
    const api=await client();
    const row=unwrap<Row|null>(await api.from('tasks').select('*').eq('id',key).maybeSingle());
    return row?mapTask(row):null;
  }
  async function write<T>(
    operation:Operation,args:Row,resolve:(changed:Changed)=>Promise<T>,
  ):Promise<StudyReceipt<T>> {
    const base={schemaVersion:1,resource:'tasks',operation,...args};
    const key=JSON.stringify(base);
    const operationId=retryIds.get(key)??uuid();
    const envelope={operationId,...base};
    let applied=false;
    try {
      const api=await client();
      const response=unwrap<CommandReceipt>(await api.rpc('task_command',{p:envelope}));
      if(response?.status==='conflict')
        fail('conflict','Task version conflict (current '+(response.conflict?.currentVersion??'unknown')+')');
      if(response?.status!=='ok'||!Array.isArray(response.changed)||response.changed.length!==1||
        typeof response.changed[0].id!=='string'||!Number.isSafeInteger(response.changed[0].version))
        fail('server','Invalid task_command receipt');
      applied=true;
      const record=await resolve(response.changed[0]);
      retryIds.delete(key);
      return {record,actionNo:Number.isSafeInteger(response.actionNo)?response.actionNo!:null};
    }catch(error) {
      // A database write may have succeeded despite an ambiguous network/read error.
      if(applied||!(error instanceof LemmaError)||error.code==='server'||error.code==='offline')
        retryIds.set(key,operationId);
      else retryIds.delete(key);
      throw error;
    }
  }
  return {
    mode:'live',
    async listTasks(query:TaskQuery={}) {
      const {limit,filter,cursor}=normalize(query);
      if(!filter.length) return {items:[],total:0,nextCursor:null};
      const api=await client();
      // Exact total across all matching rows, independent of this keyset page.
      const counted=await api.from('tasks').select('id',{count:'exact',head:true}).in('status',filter);
      if(counted.error) throw mapError(counted.error);
      const total=counted.count;
      if(!Number.isSafeInteger(total)||total===null||total<0) fail('server','Task total unavailable');
      let q=api.from('tasks').select('*').in('status',filter);
      if(cursor) q=q.or(after(cursor));
      const rows=unwrap<Row[]>(await q.order('status',{ascending:true}).order('position',{ascending:true})
        .order('created_at',{ascending:true}).order('id',{ascending:true}).limit(limit+1));
      const items=rows.slice(0,limit).map(mapTask);
      const nextCursor=rows.length>limit&&items.length?makeCursor(items[items.length-1],filter):null;
      return {items,total:total!,nextCursor};
    },
    getTask:readTask,
    async createTask(input:NewTask) {
      const patch=patchColumns({...input,due:input.due??{kind:'none'}});
      return write('create',{patch},async changed=>(await readTask(changed.id))??fail('not_found','Created task not found'));
    },
    async updateTask(key:string,expectedVersion:number,patch:TaskPatch) {
      version(expectedVersion);
      const columns=patchColumns(patch);
      return write('update',{target:{id:key},expectedVersion,patch:columns},
        async changed=>(await readTask(changed.id))??fail('not_found','Updated task not found'));
    },
    async deleteTask(key:string,expectedVersion:number) {
      version(expectedVersion);
      return write('delete',{target:{id:key},expectedVersion,patch:{}},async changed=>({id:changed.id}));
    },
  };
}
