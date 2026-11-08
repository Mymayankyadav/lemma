// Tab-local v6 demo study data. All elapsed time comes from persisted interval timestamps.
import { LemmaError } from '../api';
import type {
  CalendarBlockPatch, CalendarBlockRecord, ClosedStudyIntervalInput, NewCalendarBlock,
  NewManualStudyEntry, NewStudyEntry, StudyApi, StudyCorrectionPatch, StudyEntryRecord,
  StudyInterval, StudyRange, StudyReceipt,
} from './contract';

const STORAGE_KEY = 'lemma.v6.demo.study.v1';
interface Snapshot { schema: 1; entries: StudyEntryRecord[]; blocks: CalendarBlockRecord[] }
const clone = <T>(value: T): T => structuredClone(value);
const fail = (code: 'invalid' | 'not_found' | 'conflict', message: string): never => {
  throw new LemmaError(code, message);
};
let sequence = 0;
function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `demo-study-${Date.now()}-${++sequence}`;
}
function instant(value: string, label = 'timestamp'): string {
  const time = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(time)) fail('invalid', `Invalid ${label}`);
  return new Date(time).toISOString();
}
function bounds(range: StudyRange): [number, number] {
  const start = Date.parse(instant(range.start, 'range start'));
  const end = Date.parse(instant(range.end, 'range end'));
  if (end <= start) fail('invalid', 'Range end must follow start');
  return [start, end];
}
function period(start: string, end: string): void {
  if (Date.parse(instant(end, 'end')) <= Date.parse(instant(start, 'start')))
    fail('invalid', 'End must follow start');
}
function version(actual: { version: number }, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected !== actual.version)
    fail('conflict', `Version changed elsewhere (current ${actual.version})`);
}
function asReceipt<T>(record: T): StudyReceipt<T> { return { record: clone(record), actionNo: null }; }
function links(input: { subjectId?: string | null; projectId?: string | null; checkpointId?: string | null; sessionId?: string | null }) {
  return {
    subjectId: input.subjectId ?? null, projectId: input.projectId ?? null,
    checkpointId: input.checkpointId ?? null, sessionId: input.sessionId ?? null,
  };
}
function weekSeed(now: Date): Snapshot {
  // Local calendar dates preserve "this week" when the device is not in UTC.
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
  const at = (day: number, hour: number, minute = 0): string =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, hour, minute).toISOString();
  const saved = (day: number, hour: number, duration: number, intent: string, subjectId: string, projectId: string): StudyEntryRecord => ({
    ...links({ subjectId, projectId }), id: id(), intent, source: 'timer', status: 'saved',
    reflection: null, rating: null, version: 1, createdAt: at(day, hour),
    updatedAt: at(day, hour, duration), savedAt: at(day, hour, duration),
    intervals: [{ id: id(), kind: 'focus', start: at(day, hour), end: at(day, hour, duration) }],
  });
  const block = (day: number, hour: number, kind: CalendarBlockRecord['kind'], title: string): CalendarBlockRecord => ({
    ...links({}), id: id(), kind, title, startsAt: at(day, hour), endsAt: at(day, hour + 1),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', status: 'planned', version: 1,
  });
  return {
    schema: 1,
    entries: [
      saved(0, 9, 25, 'Review continuity proofs', 'subject-analysis', 'project-analysis'),
      saved(2, 11, 40, 'Practice linear algebra', 'subject-linear', 'project-linear'),
      saved(4, 14, 30, 'Review topology', 'subject-topology', 'project-topology'),
    ],
    blocks: [block(1, 10, 'study', 'Solve analysis problems'), block(3, 15, 'busy', 'Other commitment')],
  };
}
function load(): Snapshot {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === 'object' && 'schema' in value && value.schema === 1 &&
          'entries' in value && Array.isArray(value.entries) &&
          'blocks' in value && Array.isArray(value.blocks)) return value as Snapshot;
    }
  } catch { /* private mode or invalid data: use a fresh in-memory fixture */ }
  return weekSeed(new Date());
}
function persist(snapshot: Snapshot): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); }
  catch { /* memory-only fallback when storage is blocked */ }
}
function latest(entry: StudyEntryRecord): StudyInterval | undefined { return entry.intervals.at(-1); }
function checkAt(entry: StudyEntryRecord, at: string): string {
  const time = instant(at);
  const last = latest(entry);
  const boundary = last ? (last.end ?? last.start) : entry.createdAt;
  if (Date.parse(time) < Date.parse(boundary)) fail('invalid', 'Study time cannot go backwards');
  return time;
}
function closeOpen(entry: StudyEntryRecord, at: string): StudyInterval[] {
  const last = latest(entry);
  if (!last || last.end !== null) return fail('invalid', 'No open study interval');
  period(last.start, at);
  return [...entry.intervals.slice(0, -1), { ...last, end: at }];
}
/** Editable saved minutes are represented as focus spans so loggedMinutes sees the edit. */
/** N51 accepts only fully closed, absolute, nonoverlapping intervals.
 * Validate the entire replacement before touching the persisted snapshot. */
function absolute(value: string, label: string): string {
 if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(value))
  fail('invalid', label + ' must be an absolute ISO instant');
 return instant(value, label);
}
function correctedIntervals(input: ClosedStudyIntervalInput[]): StudyInterval[] {
 if (!Array.isArray(input) || input.length < 1 || input.length > 1000)
  fail('invalid', 'Saved corrections require 1–1000 closed intervals');
 const rows = input.map((span): StudyInterval => {
  if (!span || !['focus','break'].includes(span.kind))
   fail('invalid', 'Invalid interval kind');
  const start = absolute(span.start, 'interval start');
  const end = absolute(span.end, 'interval end');
  period(start, end);
  if (Date.parse(end) > Date.now()) fail('invalid', 'Interval may not end in the future');
  return {id:id(),kind:span.kind,start,end};
 }).sort((a,b) => a.start.localeCompare(b.start));
 for (let i=1;i<rows.length;i++) {
  if (Date.parse(rows[i-1].end!) > Date.parse(rows[i].start))
   fail('invalid', 'Corrected study intervals must not overlap');
 }
 return rows;
}
function checkCorrection(input: StudyCorrectionPatch): void {
 if (!input || typeof input !== 'object' || !Object.keys(input).length)
  fail('invalid', 'Correction must change at least one field');
 if (input.intent !== undefined && (typeof input.intent !== 'string' || !input.intent.trim()))
  fail('invalid', 'Correction intent must not be blank');
 if (input.reflection !== undefined && input.reflection !== null && typeof input.reflection !== 'string')
  fail('invalid', 'Reflection must be text');
 if (input.rating !== undefined && input.rating !== null && ![1,2,3,4,5].includes(input.rating))
  fail('invalid', 'Rating must be 1–5');
}
function ensureSaved(entry: StudyEntryRecord): void {
 if (entry.status !== 'saved' || entry.voidedAt)
  fail('conflict', 'Only active saved entries can be edited, split or voided');
}
/** Editable saved minutes are represented as focus spans so loggedMinutes sees the edit. */
function withEditedMinutes(intervals: StudyInterval[], minutes: number, at: string): StudyInterval[] {
  if (!Number.isFinite(minutes) || minutes < 0) fail('invalid', 'Saved minutes must be non-negative');
  const wanted = Math.round(minutes * 60_000);
  // Match the effort metrics' half-open interval union. Summing raw focus
  // spans overcounts overlaps (for example after a restored timer or clock
  // correction), so an explicit 6-minute edit could display as only 4.
  const focus = intervals.filter(i => i.kind === 'focus' && i.end !== null)
    .map(i => [Date.parse(i.start), Date.parse(i.end!)] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);
  const union: Array<[number, number]> = [];
  for (const [start, end] of focus) {
    const last = union.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(end, last[1]);
    else union.push([start, end]);
  }
  // Breaks may overlap rehydrated focus spans. Metrics subtract them, so the
  // manual adjustment must use that same effective focus union.
  const breaks = intervals.filter(i => i.kind === 'break' && i.end !== null)
    .map(i => [Date.parse(i.start), Date.parse(i.end!)] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start);
  let effective = union;
  for (const [breakStart, breakEnd] of breaks) {
    effective = effective.flatMap(([start, end]): Array<[number, number]> => {
      if (end <= breakStart || start >= breakEnd) return [[start, end]];
      return [[start, Math.min(end, breakStart)], [Math.max(start, breakEnd), end]]
        .filter(([a, b]) => b > a) as Array<[number, number]>;
    });
  }
  const current = effective.reduce((total, [start, end]) => total + end - start, 0);
  if (wanted === current) return intervals;
  if (wanted > current) {
    // Add a non-overlapping manual adjustment immediately before the first interval.
    // This preserves real breaks and keeps the edited duration visible in the data contract.
    const anchor = Math.min(Date.parse(at), ...intervals.map(i => Date.parse(i.start)));
    return [{ id: id(), kind: 'focus', start: new Date(anchor - (wanted - current)).toISOString(),
      end: new Date(anchor).toISOString() }, ...intervals];
  }
  // Keep the earliest wanted portion of the union, rather than trimming
  // each original span independently (which can leave duplicate overlap).
  let remaining = wanted, cutoff = effective[0][0];
  for (const [start, end] of effective) {
    const span = end - start;
    if (remaining <= span) { cutoff = start + remaining; break; }
    remaining -= span;
  }
  return intervals.flatMap(span => {
    if (span.kind !== 'focus' || span.end === null) return [span];
    const end = Math.min(Date.parse(span.end), cutoff);
    return end > Date.parse(span.start)
      ? [{ ...span, end: new Date(end).toISOString() }] : [];
  });
}

// N66: demo uses the same captured phase/lease/exclusion shape as the owner SQL.
const demoDevice = id();
const defaults = {mode:'open' as const,focus_minutes:25,break_minutes:5,
 long_break_minutes:15,cycles:4,flowtime_break_ratio:0.2};
const count = (v:unknown,fallback:number):number =>
  typeof v==='number'&&Number.isFinite(v)?v:fallback;
function freeFocus(entry:StudyEntryRecord,now:number):Array<[number,number]> {
  const focus=entry.intervals.filter(i=>i.kind==='focus').map(i=>
    [Date.parse(i.start),Math.min(Date.parse(i.end??new Date(now).toISOString()),now)] as [number,number])
    .filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  const joined:Array<[number,number]>=[];
  for(const range of focus){
    const last=joined.at(-1);
    if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);
    else joined.push([...range]);
  }
  let available=joined;
  for(const removed of entry.excludedIntervals??[]){
    const from=Date.parse(removed.from),to=Date.parse(removed.to);
    available=available.flatMap(([a,b]):Array<[number,number]>=>{
      if(b<=from||a>=to)return [[a,b]];
      return [[a,Math.min(b,from)],[Math.max(a,to),b]].filter(([x,y])=>y>x) as Array<[number,number]>;
    });
  }
  return available;
}

export function createDemoStudyApi(): StudyApi {
  const snapshot = load();
  persist(snapshot);
  const entryById = (key: string): StudyEntryRecord => {
    const found = snapshot.entries.find(e => e.id === key);
    return found ?? fail('not_found', 'Study entry not found');
  };
  const blockById = (key: string): CalendarBlockRecord => {
    const found = snapshot.blocks.find(b => b.id === key);
    return found ?? fail('not_found', 'Calendar block not found');
  };
  const storeEntry = (record: StudyEntryRecord): StudyReceipt<StudyEntryRecord> => {
    snapshot.entries = snapshot.entries.map(e => e.id === record.id ? record : e);
    persist(snapshot);
    return asReceipt(record);
  };
  const storeBlock = (record: CalendarBlockRecord): StudyReceipt<CalendarBlockRecord> => {
    snapshot.blocks = snapshot.blocks.map(b => b.id === record.id ? record : b);
    persist(snapshot);
    return asReceipt(record);
  };
  return {
    mode: 'demo',
    async listStudyEntries(range) {
      const [start, end] = bounds(range);
      return clone(snapshot.entries.filter(e => e.status === 'running' || e.status === 'paused' ||
        e.intervals.some(i => Date.parse(i.start) < end && Date.parse(i.end ?? new Date().toISOString()) > start))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)));
    },
    async activeStudyEntry() {
      return clone(snapshot.entries.find(e => e.status === 'running' || e.status === 'paused') ?? null);
    },
    async startStudyEntry(input: NewStudyEntry) {
      if (snapshot.entries.some(e => e.status === 'running' || e.status === 'paused'))
        fail('conflict', 'Another study entry is already active');
      if (typeof input.intent !== 'string' || !input.intent.trim() || !['timer', 'manual'].includes(input.source))
        fail('invalid', 'Study intent and source are required');
      if(input.calendarBlockId!==undefined&&input.calendarBlockId!==null&&
        !snapshot.blocks.some(block=>block.id===input.calendarBlockId&&block.kind==='study'))
        fail('not_found','Calendar block does not belong to this demo study plan');
      const at = instant(input.startedAt ?? new Date().toISOString(), 'start');
      const preset=input.presetId
        ? await (await import('../presets')).getPresetApi().getPreset(input.presetId)
        : null;
      if(input.presetId&&!preset)fail('not_found','Selected timer preset is unavailable');
      if(preset?.archivedAt)fail('conflict','Archived timer preset cannot start');
      const config=preset?{
        mode:preset.mode,focus_minutes:preset.focusMinutes,
        break_minutes:preset.breakMinutes,long_break_minutes:preset.longBreakMinutes,
        cycles:preset.cycles,flowtime_break_ratio:defaults.flowtime_break_ratio,
      }: {...defaults};
      const timerMode=config.mode;
      const phaseEndsAt=timerMode==='pomodoro'
        ? new Date(Date.parse(at)+config.focus_minutes*60_000).toISOString():null;
      const record: StudyEntryRecord = {
        ...links(input), calendarBlockId:input.calendarBlockId??null,
        id: id(), intent: input.intent.trim(), source: input.source,
        status: 'running', reflection: null, rating: null, version: 1,
        createdAt: at, updatedAt: at, savedAt: null,
        presetId:input.presetId??null,mode:timerMode,config,phase:'focus',
        cycle:1,phaseEndsAt,energy:null,leaseDevice:null,leaseVersion:0,
        leaseExpiresAt:null,excludedIntervals:[],
        intervals: [{ id: id(), kind: 'focus', start: at, end: null }],
      };
      snapshot.entries.push(record);
      persist(snapshot);
      return asReceipt(record);
    },
    async pauseStudyEntry(key, expectedVersion, at = new Date().toISOString()) {
      const entry = entryById(key); version(entry, expectedVersion);
      if (entry.status !== 'running') fail('conflict', 'Only a running entry can be paused');
      const time = checkAt(entry, at);
      return storeEntry({ ...entry, status: 'paused', intervals: closeOpen(entry, time),
        updatedAt: time, version: entry.version + 1 });
    },
    async resumeStudyEntry(key, expectedVersion, at = new Date().toISOString()) {
      const entry = entryById(key); version(entry, expectedVersion);
      if (entry.status !== 'paused') fail('conflict', 'Only a paused entry can be resumed');
      const time = checkAt(entry, at);
      const intervals = latest(entry)?.end === null ? closeOpen(entry, time) : entry.intervals;
      return storeEntry({ ...entry, status: 'running', updatedAt: time, version: entry.version + 1,
        intervals: [...intervals, { id: id(), kind: 'focus', start: time, end: null }] });
    },
    async breakStudyEntry(key, expectedVersion, at = new Date().toISOString()) {
      const entry = entryById(key); version(entry, expectedVersion);
      if (entry.status !== 'running') fail('conflict', 'Only a running entry can take a break');
      const time = checkAt(entry, at);
      return storeEntry({ ...entry, status: 'paused', updatedAt: time, version: entry.version + 1,
        intervals: [...closeOpen(entry, time), { id: id(), kind: 'break', start: time, end: null }] });
    },
    async takeLease(key,expectedVersion,leaseMinutes=2){
      const entry=entryById(key);version(entry,expectedVersion);
      if(!['draft','running','paused'].includes(entry.status))
        fail('conflict','Finished study entry cannot take a lease');
      if(!Number.isSafeInteger(leaseMinutes)||leaseMinutes<1||leaseMinutes>30)
        fail('invalid','Lease duration must be 1–30 minutes');
      const at=new Date().toISOString();
      return storeEntry({...entry,leaseDevice:demoDevice,
        leaseVersion:(entry.leaseVersion??0)+1,
        leaseExpiresAt:new Date(Date.parse(at)+leaseMinutes*60_000).toISOString(),
        updatedAt:at,version:entry.version+1});
    },
    async nextPhase(key,expectedVersion,energy){
      const entry=entryById(key);version(entry,expectedVersion);
      if(!['running','paused'].includes(entry.status))
        fail('conflict','Only active timers have a next phase');
      const now=Date.now(),at=new Date(now).toISOString();
      if(entry.leaseDevice!==demoDevice||!entry.leaseExpiresAt||
         Date.parse(entry.leaseExpiresAt)<=now)
        fail('conflict','Current device lease is required');
      if(energy!==undefined&&energy!==null&&!['low','steady','high'].includes(energy))
        fail('invalid','Invalid energy');
      const open=latest(entry);
      if(!open||open.end!==null) throw new LemmaError('conflict','Expected one open timer interval');
      const mode=entry.mode??'open',config=entry.config??defaults;
      const focus=(entry.phase??'focus')==='focus';
      if(open.kind!==(focus?'focus':'break'))
        fail('conflict','Timer phase and open interval disagree');
      const ended=closeOpen(entry,at),cycle=entry.cycle??1;
      const long=mode==='pomodoro'&&cycle%count(config.cycles,4)===0;
      const nextPhase=focus?(long?'long_break':'break'):'focus';
      const minutes=focus
        ? (mode==='pomodoro'
          ? count(long?config.long_break_minutes:config.break_minutes,long?15:5)
          : mode==='flowtime'
          ? Math.max(1,Math.min(180,Math.ceil((now-Date.parse(open.start))/60_000*
              count(config.flowtime_break_ratio,0.2))))
          : null)
        : mode==='pomodoro'?count(config.focus_minutes,25):null;
      return storeEntry({...entry,status:focus?'paused':'running',
        phase:nextPhase,cycle:focus?cycle:cycle+1,
        phaseEndsAt:minutes===null?null:new Date(now+minutes*60_000).toISOString(),
        energy:energy===undefined?entry.energy??null:energy,
        intervals:[...ended,{id:id(),kind:focus?'break':'focus',start:at,end:null}],
        version:entry.version+1,updatedAt:at});
    },
    async excludeMinutes(key,expectedVersion,minutes,reason){
      const entry=entryById(key);version(entry,expectedVersion);
      if(!['running','paused','saved'].includes(entry.status))
        fail('conflict','Only active or saved focus can be excluded');
      if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440)
        fail('invalid','Excluded minutes must be 1–1440');
      if(typeof reason!=='string'||!reason.trim()||reason.trim().length>200)
        fail('invalid','Exclusion reason must be 1–200 characters');
      const now=Date.now();
      if(['running','paused'].includes(entry.status)&&entry.leaseExpiresAt&&
        Date.parse(entry.leaseExpiresAt)>now&&entry.leaseDevice!==demoDevice)
        fail('conflict','Another device owns the timer lease');
      let cutoff=now;
      if(entry.status==='running'){
        const previous=(entry.excludedIntervals??[]).map(x=>Date.parse(x.to))
          .filter(Number.isFinite).reduce((max,v)=>Math.max(max,v),0);
        if(previous>now-60_000&&previous<=now)cutoff=previous;
      }
      const available=freeFocus(entry,cutoff).reverse();
      let remain=minutes*60_000;
      const additions:NonNullable<StudyEntryRecord['excludedIntervals']>=[];
      for(const [from,to] of available){
        if(remain<=0)break;
        const duration=Math.min(remain,to-from);
        if(duration<=0)continue;
        additions.push({from:new Date(to-duration).toISOString(),
          to:new Date(to).toISOString(),reason:reason.trim()});
        remain-=duration;
      }
      if(remain>0)fail('conflict','Not enough unexcluded focus minutes');
      return storeEntry({...entry,excludedIntervals:[...(entry.excludedIntervals??[]),...additions],
        updatedAt:new Date(now).toISOString(),version:entry.version+1});
    },
    async saveStudyEntry(key, expectedVersion, patch = {}) {
      const entry = entryById(key);
      if (entry.status === 'saved') return asReceipt(entry); // Idempotent even for the original version.
      version(entry, expectedVersion);
      if (entry.status === 'discarded') fail('conflict', 'Discarded study entry cannot be saved');
      if (patch.rating !== undefined && patch.rating !== null && ![1, 2, 3, 4, 5].includes(patch.rating))
        fail('invalid', 'Rating must be 1 through 5');
      if (patch.reflection !== undefined && patch.reflection !== null && typeof patch.reflection !== 'string')
        fail('invalid', 'Reflection must be text');
      const at = checkAt(entry, new Date().toISOString());
      const intervals = latest(entry)?.end === null ? closeOpen(entry, at) : entry.intervals;
      return storeEntry({ ...entry, status: 'saved', savedAt: at, updatedAt: at,
        reflection: patch.reflection === undefined ? entry.reflection : patch.reflection,
        rating: patch.rating === undefined ? entry.rating : patch.rating,
        intervals: patch.minutes === undefined ? intervals : withEditedMinutes(intervals, patch.minutes, at),
        version: entry.version + 1 });
    },
    async discardStudyEntry(key, expectedVersion) {
      const entry = entryById(key); version(entry, expectedVersion);
      if (entry.status === 'saved' || entry.status === 'discarded')
        fail('conflict', 'Cannot discard a finished study entry');
      return storeEntry({ ...entry, status: 'discarded', intervals: [], savedAt: null,
        updatedAt: new Date().toISOString(), version: entry.version + 1 });
    },
    async createManualStudyEntry(input: NewManualStudyEntry) {
      if (!input || typeof input.intent !== 'string' || !input.intent.trim())
        fail('invalid', 'Manual entry requires an intent');
      checkCorrection(input);
      const intervals = correctedIntervals(input.intervals);
      const now = new Date().toISOString();
      const record: StudyEntryRecord = {
        ...links(input),id:id(),source:'manual',status:'saved',approximate:true,
        intent:input.intent.trim(),reflection:input.reflection ?? null,
        rating:input.rating ?? null,createdAt:now,updatedAt:now,savedAt:now,
        voidedAt:null,version:1,intervals,
      };
      snapshot.entries.push(record);
      persist(snapshot);
      return asReceipt(record);
    },
    async correctStudyEntry(key, expectedVersion, patch: StudyCorrectionPatch) {
      const entry=entryById(key);
      version(entry, expectedVersion);
      ensureSaved(entry);
      checkCorrection(patch);
      const intervals=patch.intervals === undefined
        ? entry.intervals : correctedIntervals(patch.intervals);
      const next:StudyEntryRecord={
        ...entry,...links({...entry,...patch}),
        intent:patch.intent === undefined ? entry.intent : patch.intent.trim(),
        reflection:patch.reflection === undefined ? entry.reflection : patch.reflection,
        rating:patch.rating === undefined ? entry.rating : patch.rating,
        intervals,version:entry.version+1,updatedAt:new Date().toISOString(),
      };
      return storeEntry(next);
    },
    async splitStudyEntry(key, expectedVersion, at) {
      const entry=entryById(key);
      version(entry, expectedVersion);
      ensureSaved(entry);
      const boundary=Date.parse(absolute(at,'split instant'));
      const left:StudyInterval[]=[];
      const right:StudyInterval[]=[];
      for (const span of entry.intervals) {
        if (span.end === null) fail('invalid','A saved interval may not be open');
        const start=Date.parse(span.start),end=Date.parse(span.end!);
        if (end<=boundary) left.push({...span});
        else if(start>=boundary) right.push({...span});
        else {
          left.push({...span,end:new Date(boundary).toISOString()});
          right.push({...span,id:id(),start:new Date(boundary).toISOString()});
        }
      }
      if (!left.length || !right.length)
        fail('invalid','Split must retain nonempty intervals on both sides');
      const now=new Date().toISOString();
      const original:StudyEntryRecord={...entry,intervals:left,
        version:entry.version+1,updatedAt:now};
      const created:StudyEntryRecord={...entry,id:id(),intervals:right,
        version:1,createdAt:now,updatedAt:now};
      snapshot.entries=snapshot.entries.map(e=>e.id===key?original:e);
      snapshot.entries.push(created);
      persist(snapshot);
      return asReceipt({original,created});
    },
    async voidStudyEntry(key, expectedVersion) {
      const entry=entryById(key);
      version(entry, expectedVersion);
      ensureSaved(entry);
      const now=new Date().toISOString();
      return storeEntry({...entry,status:'discarded',voidedAt:now,
        version:entry.version+1,updatedAt:now});
    },
    async restoreStudyEntry(key, expectedVersion) {
      const entry=entryById(key);
      version(entry, expectedVersion);
      if (entry.status!=='discarded' || !entry.voidedAt)
        fail('conflict','Only a voided saved entry may be restored');
      return storeEntry({...entry,status:'saved',voidedAt:null,
        version:entry.version+1,updatedAt:new Date().toISOString()});
    },
    async listCalendarBlocks(range) {
      const [start, end] = bounds(range);
      return clone(snapshot.blocks.filter(b => Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
    },
    async createCalendarBlock(input: NewCalendarBlock) {
      if (!['study', 'busy'].includes(input.kind) || typeof input.title !== 'string' || !input.title.trim())
        fail('invalid', 'Calendar kind and title are required');
      const startsAt = instant(input.startsAt, 'block start');
      const endsAt = instant(input.endsAt, 'block end');
      period(startsAt, endsAt);
      if (typeof input.timeZone !== 'string' || !input.timeZone.trim())
        fail('invalid', 'IANA time zone is required');
      try { new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone }).format(); }
      catch { fail('invalid', 'Invalid IANA time zone'); }
      if (input.taskId !== undefined && input.taskId !== null &&
          (typeof input.taskId !== 'string' || !input.taskId.trim()))
        fail('invalid', 'Invalid task link');
      const record: CalendarBlockRecord = {
        ...links(input), id: id(), kind: input.kind, title: input.title.trim(), startsAt,
        endsAt, timeZone: input.timeZone, status: 'planned', version: 1,
        ...(input.taskId !== undefined ? {taskId:input.taskId} : {}),
      };
      snapshot.blocks.push(record);
      persist(snapshot);
      return asReceipt(record);
    },
    async updateCalendarBlock(key, expectedVersion, patch: CalendarBlockPatch) {
      const block = blockById(key); version(block, expectedVersion);
      const next = { ...block, ...patch, ...links({ ...block, ...patch }), version: block.version + 1 };
      if (!['study', 'busy'].includes(next.kind) || !['planned', 'done', 'cancelled'].includes(next.status) ||
          typeof next.title !== 'string' || !next.title.trim()) fail('invalid', 'Invalid calendar block');
      next.startsAt = instant(next.startsAt, 'block start');
      next.endsAt = instant(next.endsAt, 'block end');
      period(next.startsAt, next.endsAt);
      if (next.taskId !== undefined && next.taskId !== null &&
          (typeof next.taskId !== 'string' || !next.taskId.trim()))
        fail('invalid', 'Invalid task link');
      if (typeof next.timeZone !== 'string' || !next.timeZone.trim())
        fail('invalid', 'IANA time zone is required');
      try { new Intl.DateTimeFormat('en-US', { timeZone: next.timeZone }).format(); }
      catch { fail('invalid', 'Invalid IANA time zone'); }
      return storeBlock(next);
    },
    async deleteCalendarBlock(key, expectedVersion) {
      version(blockById(key), expectedVersion);
      snapshot.blocks = snapshot.blocks.filter(b => b.id !== key);
      persist(snapshot);
      return asReceipt({ id: key });
    },
  };
}
