// The v6 live StudyApi is lazily attached to the existing authenticated browser client.
// No owner ID is accepted from callers: all reads and commands run through Supabase RLS.
import { LemmaError } from '../api';
import type {
  CalendarBlockPatch, CalendarBlockRecord, ClosedStudyIntervalInput, NewCalendarBlock,
  NewManualStudyEntry, NewStudyEntry, StudyApi, StudyCorrectionPatch, StudyEntryRecord,
  StudyInterval, StudyRange, StudyReceipt,
} from './contract';

type ObjectRow = Record<string, unknown>;
type Resource = 'study_entries' | 'study_intervals' | 'calendar_blocks';
type Operation = 'create' | 'start' | 'pause' | 'resume' | 'break' | 'save' | 'discard' | 'update' | 'delete' |
  'create_manual' | 'correct' | 'split' | 'void' | 'restore' | 'take_lease' | 'next_phase' | 'exclude_minutes';
interface Changed { id: string; version: number }
interface CommandReceipt { status: 'ok' | 'conflict'; changed: Changed[]; actionNo?: number | null; conflict?: { currentVersion?: number } }
const LIMIT = 500;
const fail = (code: 'conflict' | 'invalid' | 'not_found', message: string): never => { throw new LemmaError(code, message); };
// Dynamic import means demo-only routes never parse the Supabase SDK.
async function client() { return (await import('../live/client')).liveClient(); }
function id(): string {
  // randomUUID is absent in some browsers (and jsdom); getRandomValues is sufficient for v4 UUIDs.
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function timestamp(value: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('invalid', 'Invalid time');
  return new Date(value).toISOString();
}
function bounds(range: StudyRange): StudyRange {
  const start = timestamp(range.start), end = timestamp(range.end);
  if (end <= start) fail('invalid', 'Range must be non-empty');
  return {start, end};
}
function mapError(error: {code?: string; message?: string}): LemmaError {
  const message = error.message ?? 'Study operation failed';
  if (error.code === '23505' || /version|already active|duplicate|conflict/i.test(message)) return new LemmaError('conflict', message);
  if (/not found|no rows/i.test(message)) return new LemmaError('not_found', message);
  if (error.code === '23503' || error.code === '23514' || error.code === '22P02' ||
      /invalid|unknown|constraint|unsupported|required|terminal/i.test(message)) return new LemmaError('invalid', message);
  return new LemmaError('server', message);
}
function unwrap<T>(result: {data: T | null; error: {code?: string; message?: string} | null}): T {
  if (result.error) throw mapError(result.error);
  return result.data as T;
}
function linkColumns(input: {subjectId?: string | null; projectId?: string | null; checkpointId?: string | null; sessionId?: string | null}): ObjectRow {
  const result: ObjectRow = {};
  for (const [from, to] of [
    ['subjectId','subject_id'], ['projectId','project_id'],
    ['checkpointId','checkpoint_id'], ['sessionId','session_id'],
  ] as const) if (input[from] !== undefined) result[to] = input[from];
  return result;
}
function mapIntervals(data: unknown): StudyInterval[] {
  return (Array.isArray(data) ? data : []).map((v: ObjectRow) => ({
    id: String(v.id), kind: v.kind as StudyInterval['kind'],
    start: String(v.started_at), end: v.ended_at == null ? null : String(v.ended_at),
  })).sort((a: StudyInterval, b: StudyInterval) => a.start.localeCompare(b.start));
}
function mapStudy(data: ObjectRow): StudyEntryRecord {
  return {
    id: String(data.id), intent: String(data.intent ?? ''),
    source: data.source as StudyEntryRecord['source'], status: data.status as StudyEntryRecord['status'],
    subjectId: data.subject_id as string | null, projectId: data.project_id as string | null,
    checkpointId: data.checkpoint_id as string | null, sessionId: data.session_id as string | null,
    reflection: data.reflection as string | null, rating: data.rating as StudyEntryRecord['rating'],
    version: Number(data.version), createdAt: String(data.created_at),
    updatedAt: String(data.updated_at), savedAt: data.saved_at == null ? null : String(data.saved_at),
    intervals: mapIntervals(data.study_intervals),
    ...(data.mode !== undefined ? {mode:data.mode as StudyEntryRecord['mode']} : {}),
    ...(data.preset_id !== undefined ? {presetId:data.preset_id as string | null} : {}),
    ...(data.config !== undefined ? {config:data.config as StudyEntryRecord['config']} : {}),
    ...(data.phase !== undefined ? {phase:data.phase as StudyEntryRecord['phase']} : {}),
    ...(data.cycle !== undefined ? {cycle:Number(data.cycle)} : {}),
    ...(data.phase_ends_at !== undefined ? {phaseEndsAt:data.phase_ends_at as string|null} : {}),
    ...(data.energy !== undefined ? {energy:data.energy as StudyEntryRecord['energy']} : {}),
    ...(data.lease_device !== undefined ? {leaseDevice:data.lease_device as string|null} : {}),
    ...(data.lease_version !== undefined ? {leaseVersion:Number(data.lease_version)} : {}),
    ...(data.lease_expires_at !== undefined ? {leaseExpiresAt:data.lease_expires_at as string|null} : {}),
    ...(data.excluded_intervals !== undefined ? {excludedIntervals:data.excluded_intervals as StudyEntryRecord['excludedIntervals']} : {}),
    ...(data.calendar_block_id!==undefined ? {calendarBlockId:(data.calendar_block_id??null) as string|null} : {}),
    ...(typeof data.approximate === 'boolean' ? {approximate:data.approximate} : {}),
    ...(data.voided_at !== undefined ? {voidedAt:data.voided_at as string | null} : {}),
  };
}
function mapBlock(data: ObjectRow): CalendarBlockRecord {
  return {
    id: String(data.id), kind: data.kind as CalendarBlockRecord['kind'], title: String(data.title),
    startsAt: String(data.starts_at), endsAt: String(data.ends_at),
    timeZone: String(data.time_zone), status: data.status as CalendarBlockRecord['status'],
    version: Number(data.version), subjectId: data.subject_id as string | null,
    projectId: data.project_id as string | null, checkpointId: data.checkpoint_id as string | null,
    sessionId: data.session_id as string | null,
    ...(data.task_id !== undefined ? {taskId:data.task_id as string | null} : {}),
  };
}
function blockPatch(patch: CalendarBlockPatch): ObjectRow {
  const columns: ObjectRow = {...linkColumns(patch)};
  for (const [from, to] of [
    ['kind','kind'],['title','title'],['startsAt','starts_at'],
    ['endsAt','ends_at'],['timeZone','time_zone'],['status','status'],['taskId','task_id'],
  ] as const) if (patch[from] !== undefined) columns[to] = patch[from];
  return columns;
}
/** N51 server correction uses a complete, timezone-explicit interval array. */
function absoluteTime(value:string):string {
 if (typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value))
  fail('invalid','N51 correction requires absolute ISO instants');
 return timestamp(value);
}
function closedIntervals(input:ClosedStudyIntervalInput[]):ObjectRow[] {
 if (!Array.isArray(input)||input.length<1||input.length>1000)
  fail('invalid','N51 requires 1–1000 closed intervals');
 const out=input.map((span)=>{
  if (!span||!['focus','break'].includes(span.kind))
   fail('invalid','Invalid study interval kind');
  const started_at=absoluteTime(span.start),ended_at=absoluteTime(span.end);
  if (ended_at<=started_at||Date.parse(ended_at)>Date.now())
   fail('invalid','Invalid corrected study interval bounds');
  return {kind:span.kind,started_at,ended_at};
 }).sort((a,b)=>a.started_at.localeCompare(b.started_at));
 for(let i=1;i<out.length;i++){
  if(out[i-1].ended_at>out[i].started_at)
   fail('invalid','Corrected study intervals overlap');
 }
 return out;
}
function correctionPatch(patch:StudyCorrectionPatch):ObjectRow {
 if (!patch||typeof patch!=='object'||!Object.keys(patch).length)
  fail('invalid','Correction patch must not be empty');
 const out:ObjectRow={...linkColumns(patch)};
 if(patch.intent!==undefined){
  if(typeof patch.intent!=='string'||!patch.intent.trim())
   fail('invalid','Saved entry intent must not be blank');
  out.intent=patch.intent.trim();
 }
 if(patch.reflection!==undefined){
  if(patch.reflection!==null&&typeof patch.reflection!=='string')
   fail('invalid','Reflection must be text');
  out.reflection=patch.reflection;
 }
 if(patch.rating!==undefined){
  if(patch.rating!==null&&![1,2,3,4,5].includes(patch.rating))
   fail('invalid','Rating must be 1–5');
  out.rating=patch.rating;
 }
 if(patch.intervals!==undefined)out.intervals=closedIntervals(patch.intervals);
 if(!Object.keys(out).length)fail('invalid','Correction patch must change at least one field');
 return out;
}
async function readStudy(key: string): Promise<StudyEntryRecord> {
  const api = await client();
  const row = unwrap<ObjectRow>(await api.from('study_entries')
    .select('*, study_intervals(*)').eq('id', key).maybeSingle());
  if (!row) fail('not_found', 'Study entry not found');
  return mapStudy(row);
}
async function readBlock(key: string): Promise<CalendarBlockRecord> {
  const api = await client();
  const row = unwrap<ObjectRow>(await api.from('calendar_blocks')
    .select('*').eq('id', key).maybeSingle());
  if (!row) fail('not_found', 'Calendar block not found');
  return mapBlock(row);
}
async function command(resource: Resource, operation: Operation, extra: ObjectRow = {}): Promise<CommandReceipt> {
  const api = await client();
  const envelope = {operationId: id(), schemaVersion: 1, resource, operation, ...extra};
  const response = unwrap<CommandReceipt>(await api.rpc('study_command', {p: envelope}));
  if (response.status === 'conflict') {
    fail('conflict', `Study version conflict (current ${response.conflict?.currentVersion ?? 'unknown'})`);
  }
  if (response.status !== 'ok' || !Array.isArray(response.changed) || response.changed.length < 1)
    fail('invalid', 'Unexpected study_command receipt');
  return response;
}
const receipt = <T>(record: T, response: CommandReceipt): StudyReceipt<T> => ({
  record, actionNo: Number.isSafeInteger(response.actionNo) ? response.actionNo! : null,
});
async function entryWrite(operation: Operation, key: string, expectedVersion: number, patch: ObjectRow = {}, lease: ObjectRow = {}) {
  const response = await command('study_entries', operation, {target: {id: key}, expectedVersion, patch, ...lease});
  return receipt(await readStudy(key), response);
}

// Stable within this browser tab; no owner token or server credential is stored.
let tabDevice: string | null = null;
function deviceToken(): string { return tabDevice ??= id(); }

export function createLiveStudyApi(): StudyApi {
  const device = deviceToken();
  let owned: {id:string;version:number;leaseVersion:number} | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let listening = false;
  const visible = () => typeof document !== 'undefined' && document.visibilityState === 'visible';
  const cancel = () => {
    if(timeout!==null){clearTimeout(timeout);timeout=null;}
  };
  const stop = () => {
    cancel(); owned=null;
    if(listening && typeof document!=='undefined'){
      document.removeEventListener('visibilitychange',onVisibility);
      listening=false;
    }
  };
  const renewLater = () => {
    cancel();
    if(owned && visible())timeout=setTimeout(()=>{void renew();},60_000);
  };
  async function renew(){
    const current=owned;
    if(!current||!visible())return;
    try{
      const result=await command('study_entries','take_lease',{
        target:{id:current.id},expectedVersion:current.version,
        patch:{device,lease_minutes:2},
      });
      const after=await readStudy(current.id);
      if(after.status!=='running'&&after.status!=='paused'&&after.status!=='draft'){
        stop();return;
      }
      owned={id:current.id,version:result.changed[0].version,
        leaseVersion:after.leaseVersion??current.leaseVersion+1};
    }catch{
      // Stale owner/version/device must not be silently reclaimed.
      stop();return;
    }
    renewLater();
  }
  function onVisibility(){
    if(!visible())cancel();
    else if(owned)void renew();
  }
  const keep = (record:StudyEntryRecord,latestVersion:number) => {
    owned={id:record.id,version:latestVersion,leaseVersion:record.leaseVersion??0};
    if(!listening && typeof document!=='undefined'){
      document.addEventListener('visibilitychange',onVisibility);
      listening=true;
    }
    renewLater();
  };
  const leaseEnvelope = (key:string):ObjectRow =>
    owned?.id===key ? {device,leaseVersion:owned.leaseVersion} : {};
  const withLease = async (operation:Operation,key:string,expectedVersion:number,patch:ObjectRow={}) => {
    const output=await entryWrite(operation,key,expectedVersion,patch,leaseEnvelope(key));
    if(owned?.id===key){
      if(['saved','discarded'].includes(output.record.status))stop();
      else owned.version=output.record.version;
    }
    return output;
  };
  return {
    mode: 'live',
    async listStudyEntries(range) {
      const {start,end} = bounds(range);
      const api = await client();
      // Query interval IDs first; a study entry may start before the selected range.
      const matching = unwrap<ObjectRow[]>(await api.from('study_intervals').select('entry_id')
        .lt('started_at', end).or(`ended_at.is.null,ended_at.gt.${start}`).limit(LIMIT));
      const active = unwrap<ObjectRow[]>(await api.from('study_entries').select('id')
        .in('status', ['running','paused']).limit(LIMIT));
      const ids = [...new Set([...matching, ...active].map(row => String(row.entry_id ?? row.id)))];
      if (!ids.length) return [];
      if (ids.length > LIMIT) fail('invalid', 'Study range exceeds live page limit');
      const rows = unwrap<ObjectRow[]>(await api.from('study_entries')
        .select('*, study_intervals(*)').in('id', ids).order('created_at', {ascending: true}).limit(LIMIT));
      return rows.map(mapStudy);
    },
    async activeStudyEntry() {
      const api = await client();
      const row = unwrap<ObjectRow>(await api.from('study_entries')
        .select('*, study_intervals(*)').in('status', ['running','paused']).limit(1).maybeSingle());
      return row ? mapStudy(row) : null;
    },
    async startStudyEntry(input: NewStudyEntry) {
      if (!input.intent?.trim() || !['timer','manual'].includes(input.source)) fail('invalid', 'Study intent and source required');
      // SQL requires draft creation followed by start. Each call has a distinct operationId.
      const created = await command('study_entries','create', {patch: {
        intent: input.intent.trim(), source: input.source, ...linkColumns(input),
      }});
      const row = created.changed[0];
      let started: CommandReceipt;
      let startVersion=row.version;
      try {
        const draftPatch:ObjectRow={};
        if(input.calendarBlockId!==undefined&&input.calendarBlockId!==null){
          if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.calendarBlockId))
            fail('invalid','Calendar block ID must be a UUID');
          // Only the owner can update the newly created draft. The database's
          // (user_id,calendar_block_id) FK refuses a different owner's block;
          // link before start so a failed FK never leaves a running timer.
          draftPatch.calendar_block_id=input.calendarBlockId;
        }
        if(input.presetId!==undefined){
          if(input.presetId!==null&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.presetId))
            fail('invalid','Preset ID must be a UUID');
          draftPatch.preset_id=input.presetId;
        }
        if(Object.keys(draftPatch).length){
          const db=await client();
          const linked=unwrap<{version:number}>(await db.from('study_entries')
            .update(draftPatch).eq('id',row.id)
            .select('version').single());
          startVersion=Number(linked.version);
        }
        started = await command('study_entries','start', {
          target:{id:row.id}, expectedVersion:startVersion, patch:{},
        });
      } catch (error) {
        // The two RPCs are separate transactions. If the start conflicts with
        // another active timer, do not strand this freshly created draft.
        // Delete only its original version: if start actually succeeded but
        // its acknowledgement was lost, version 2 prevents this cleanup from
        // deleting a running timer. Preserve the original start error.
        try {
          await command('study_entries','delete', {
            target:{id:row.id}, expectedVersion:startVersion, patch:{},
          });
        } catch { /* best effort; a changed draft is not ours to overwrite */ }
        throw error;
      }
      return receipt(await readStudy(row.id), started);
    },
    async takeLease(key, expectedVersion, leaseMinutes = 2) {
      if(!Number.isSafeInteger(leaseMinutes)||leaseMinutes<1||leaseMinutes>30)
        fail('invalid','Lease minutes must be 1–30');
      const response=await command('study_entries','take_lease',{
        target:{id:key},expectedVersion,patch:{device,lease_minutes:leaseMinutes},
      });
      const record=await readStudy(key);
      keep(record,response.changed[0].version);
      return receipt(record,response);
    },
    async nextPhase(key,expectedVersion,energy){
      const current=await readStudy(key);
      if(current.version!==expectedVersion)fail('conflict','Study version changed elsewhere');
      if(!owned||owned.id!==key||current.leaseDevice!==device||
          current.leaseVersion!==owned.leaseVersion||
          !current.leaseExpiresAt||Date.parse(current.leaseExpiresAt)<=Date.now())
        throw new LemmaError('conflict','Current tab must take the timer lease');
      if(energy!==undefined&&energy!==null&&!['low','steady','high'].includes(energy))
        fail('invalid','Invalid timer energy');
      const response=await command('study_entries','next_phase',{
        target:{id:key},expectedVersion,
        patch:{device,lease_version:owned.leaseVersion,...(energy!==undefined?{energy}:{} )},
      });
      const record=await readStudy(key);
      keep(record,response.changed[0].version);
      return receipt(record,response);
    },
    async excludeMinutes(key,expectedVersion,minutes,reason){
      if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440)
        fail('invalid','Excluded minutes must be 1–1440');
      if(typeof reason!=='string'||!reason.trim()||reason.trim().length>200)
        fail('invalid','Exclusion reason required (1–200 characters)');
      const current=await readStudy(key);
      if(current.version!==expectedVersion)fail('conflict','Study version changed elsewhere');
      const lease=(current.status==='running'||current.status==='paused')&&
        current.leaseExpiresAt&&Date.parse(current.leaseExpiresAt)>Date.now()
        ? (owned?.id===key&&current.leaseDevice===device&&
            current.leaseVersion===owned.leaseVersion?{device,lease_version:owned.leaseVersion}:null)
        : {};
      if(lease===null)fail('conflict','Current tab must take the timer lease');
      const response=await command('study_entries','exclude_minutes',{
        target:{id:key},expectedVersion,
        patch:{...lease,minutes,reason:reason.trim()},
      });
      const record=await readStudy(key);
      if(owned?.id===key)keep(record,response.changed[0].version);
      return receipt(record,response);
    },
    pauseStudyEntry(key, expectedVersion, at) {
      void at; // All live interval boundaries use the trusted database clock.
      return withLease('pause',key,expectedVersion);
    },
    resumeStudyEntry(key, expectedVersion, at) { void at; return withLease('resume',key,expectedVersion); },
    breakStudyEntry(key, expectedVersion, at) { void at; return withLease('break',key,expectedVersion); },
    async saveStudyEntry(key, expectedVersion, patch = {}) {
      // SQL's save is not idempotent for a new operationId, so guard its terminal state.
      const existing = await readStudy(key);
      if (existing.status === 'saved') return {record: existing, actionNo: null};
      if (existing.version !== expectedVersion) fail('conflict', 'Study version changed elsewhere');
      if (existing.status === 'discarded') fail('conflict', 'Cannot save a discarded study entry');
      let currentVersion = expectedVersion;
      if (patch.minutes !== undefined) {
        if (!Number.isFinite(patch.minutes) || patch.minutes < 0) fail('invalid', 'Saved minutes must be non-negative');
        // The SQL command accepts interval edits, not a 'minutes' field. Close open
        // intervals using the database clock before constructing the edited duration.
        if (existing.status === 'running') {
          const paused = await command('study_entries', 'pause', {target:{id:key},expectedVersion:currentVersion,patch:{}});
          currentVersion = paused.changed[0].version;
        } else if (existing.status === 'paused' && existing.intervals.some(i => i.kind === 'break' && i.end === null)) {
          const resumed = await command('study_entries', 'resume', {target:{id:key},expectedVersion:currentVersion,patch:{}});
          currentVersion = resumed.changed[0].version;
          const paused = await command('study_entries', 'pause', {target:{id:key},expectedVersion:currentVersion,patch:{}});
          currentVersion = paused.changed[0].version;
        }
        const spans = (await readStudy(key)).intervals.filter(i => i.kind === 'focus' && i.end !== null);
        const duration = spans.reduce((sum, span) => sum + Date.parse(span.end!) - Date.parse(span.start), 0);
        let difference = Math.round(patch.minutes * 60_000) - duration;
        if (difference < 0) {
          for (const span of [...spans].reverse()) {
            if (difference >= 0) break;
            const length = Date.parse(span.end!) - Date.parse(span.start);
            const operation = -difference >= length ? 'delete' : 'update';
            const change = operation === 'delete' ? {} :
              {ended_at: new Date(Date.parse(span.end!) + difference).toISOString()};
            const edited = await command('study_intervals', operation, {
              target: {id:span.id}, expectedVersion:currentVersion, patch:change,
            });
            currentVersion = edited.changed[0].version;
            difference += Math.min(-difference, length);
          }
        } else if (difference > 0) {
          const anchor = spans.length ? Math.min(...spans.map(i => Date.parse(i.start))) : Date.now();
          const added = await command('study_intervals','create',{patch:{
            entry_id:key, kind:'focus', started_at:new Date(anchor - difference).toISOString(),
            ended_at:new Date(anchor).toISOString(),
          }});
          currentVersion = added.changed[0].version;
        }
      }
      const change: ObjectRow = {};
      if (patch.reflection !== undefined) change.reflection = patch.reflection;
      if (patch.rating !== undefined) change.rating = patch.rating;
      return withLease('save', key, currentVersion, change);
    },
    discardStudyEntry(key, expectedVersion) { return withLease('discard', key, expectedVersion); },
    async correctStudyEntry(key, expectedVersion, patch) {
      return entryWrite('correct',key,expectedVersion,correctionPatch(patch));
    },
    async splitStudyEntry(key, expectedVersion, at) {
      const response=await command('study_entries','split',{
        target:{id:key},expectedVersion,patch:{at:absoluteTime(at)},
      });
      if(response.changed.length!==2 || response.changed[0].id!==key ||
         !response.changed[1].id || response.changed[1].id===key)
        fail('invalid','Unexpected split receipt');
      // Read both server-specified IDs in a deterministic sequence.
      // Avoid racing two lazy Supabase client imports on a cold live route.
      const original=await readStudy(key);
      const created=await readStudy(response.changed[1].id);
      return receipt({original,created},response);
    },
    voidStudyEntry(key, expectedVersion) {
      return entryWrite('void',key,expectedVersion);
    },
    restoreStudyEntry(key, expectedVersion) {
      return entryWrite('restore',key,expectedVersion);
    },
    async createManualStudyEntry(input) {
      if (!input || typeof input.intent!=='string'||!input.intent.trim())
        fail('invalid','Manual study entry needs an intent');
      const patch=correctionPatch(input);
      // N51 always stores source=manual, status=saved and approximate=true;
      // never permit owner/source/approximate to be forged by an app envelope.
      const result=await command('study_entries','create_manual',{patch});
      const record=await readStudy(result.changed[0].id);
      if (record.source!=='manual'||record.status!=='saved'||record.approximate!==true)
        fail('invalid','Manual entry receipt does not match the saved server record');
      return receipt(record,result);
    },
    async listCalendarBlocks(range) {
      const {start,end} = bounds(range);
      const api = await client();
      const rows = unwrap<ObjectRow[]>(await api.from('calendar_blocks')
        .select('*').lt('starts_at', end).gt('ends_at', start).order('starts_at', {ascending:true}).limit(LIMIT));
      return rows.map(mapBlock);
    },
    async createCalendarBlock(input: NewCalendarBlock) {
      if (input.taskId!==undefined && input.taskId!==null &&
         (typeof input.taskId!=='string'||!input.taskId.trim()))
        fail('invalid','Invalid task association');
      const response = await command('calendar_blocks','create',{patch:{
        kind: input.kind, title: input.title, starts_at: input.startsAt, ends_at: input.endsAt,
        time_zone: input.timeZone, ...linkColumns(input),
        ...(input.taskId!==undefined ? {task_id:input.taskId} : {}),
      }});
      return receipt(await readBlock(response.changed[0].id), response);
    },
    async updateCalendarBlock(key, expectedVersion, patch: CalendarBlockPatch) {
      if (patch.taskId!==undefined && patch.taskId!==null &&
         (typeof patch.taskId!=='string'||!patch.taskId.trim()))
        fail('invalid','Invalid task association');
      const response = await command('calendar_blocks','update',{
        target:{id:key}, expectedVersion, patch:blockPatch(patch),
      });
      return receipt(await readBlock(key), response);
    },
    async deleteCalendarBlock(key, expectedVersion) {
      const response = await command('calendar_blocks','delete',{target:{id:key},expectedVersion,patch:{}});
      return receipt({id:key},response);
    },
  };
}
