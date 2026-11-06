// Live v6 study adapter. Supabase is imported only on the first live operation;
// demo mode never needs to parse the live client or its dependencies.
import { LemmaError } from '../api';
import type { Database } from '../live/database.types';
import type {
  CalendarBlockPatch, CalendarBlockRecord, NewCalendarBlock, NewStudyEntry,
  StudyApi, StudyEntryRecord, StudyInterval, StudyRange, StudyReceipt,
} from './contract';

type EntryRow = Database['public']['Tables']['study_entries']['Row'];
type IntervalRow = Database['public']['Tables']['study_intervals']['Row'];
type BlockRow = Database['public']['Tables']['calendar_blocks']['Row'];
type JoinedEntry = EntryRow & { study_intervals?: IntervalRow[] | null };
type Changed = { id: string; version: number };
type CommandResult = {
  status: 'ok' | 'conflict';
  changed?: Changed[];
  actionNo?: number | null;
  conflict?: { currentVersion?: number };
};
type CommandParts = { target?: { id: string }; expectedVersion?: number; patch?: Record<string, unknown> };

function fail(error: unknown): never {
  if (error instanceof LemmaError) throw error;
  const detail = error as { code?: string; message?: string; status?: number } | null;
  const message = detail?.message ?? 'Study data is unavailable';
  const code = detail?.code;
  if (detail?.status === 401 || detail?.status === 403 || code === '42501' || /authentication|jwt|permission denied/i.test(message))
    throw new LemmaError('auth', message);
  if (code === '23505' || /conflict|already active|duplicate|one_active|open interval exists/i.test(message))
    throw new LemmaError('conflict', message);
  if (code === 'PGRST116' || /not found/i.test(message))
    throw new LemmaError('not_found', message);
  if (code === '23514' || code === '22P02' || code === '23503' || /invalid|terminal|unknown patch|unsupported|must |required|future |constraint|check constraint/i.test(message))
    throw new LemmaError('invalid', message);
  if (typeof navigator !== 'undefined' && !navigator.onLine || /failed to fetch|networkerror|network request failed/i.test(message))
    throw new LemmaError('offline', message);
  throw new LemmaError('server', message);
}

function checked<T>(response: { data: T | null; error: unknown }): T {
  if (response.error) return fail(response.error);
  if (response.data === null) throw new LemmaError('not_found', 'Study record not found');
  return response.data;
}

const snake = (name: string): string => name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
/** Omit absent keys, keep explicit null to clear an optional link. Never send user_id. */
function patchToDb(input: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [snake(key), value]));
}
function links(input: { subjectId?: string | null; projectId?: string | null; checkpointId?: string | null; sessionId?: string | null }): Record<string, unknown> {
  return patchToDb({ subjectId: input.subjectId, projectId: input.projectId, checkpointId: input.checkpointId, sessionId: input.sessionId });
}
function interval(row: IntervalRow): StudyInterval {
  return { id: row.id, kind: row.kind as StudyInterval['kind'], start: row.started_at, end: row.ended_at };
}
function entry(row: JoinedEntry): StudyEntryRecord {
  return {
    id: row.id, intent: row.intent, source: row.source as StudyEntryRecord['source'],
    status: row.status as StudyEntryRecord['status'], reflection: row.reflection,
    rating: row.rating as StudyEntryRecord['rating'], version: row.version,
    subjectId: row.subject_id, projectId: row.project_id,
    checkpointId: row.checkpoint_id, sessionId: row.session_id,
    createdAt: row.created_at, updatedAt: row.updated_at, savedAt: row.saved_at,
    intervals: (row.study_intervals ?? []).map(interval)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
  };
}
function block(row: BlockRow): CalendarBlockRecord {
  return {
    id: row.id, kind: row.kind as CalendarBlockRecord['kind'], title: row.title,
    startsAt: row.starts_at, endsAt: row.ends_at, timeZone: row.time_zone,
    status: row.status as CalendarBlockRecord['status'], version: row.version,
    subjectId: row.subject_id, projectId: row.project_id,
    checkpointId: row.checkpoint_id, sessionId: row.session_id,
  };
}

// Keep module resolution and the browser auth session inside the live call path.
async function client() { return (await import('../live/client')).liveClient(); }
async function command(resource: 'study_entries' | 'study_intervals' | 'calendar_blocks', operation: string, parts: CommandParts = {}): Promise<{ change: Changed; actionNo: number | null }> {
  const db = await client();
  const payload = { operationId: crypto.randomUUID(), schemaVersion: 1, resource, operation, ...parts, patch: parts.patch ?? {} };
  const response = checked((await db.rpc('study_command', { p: payload })) as { data: CommandResult | null; error: unknown });
  if (response.status === 'conflict')
    throw new LemmaError('conflict', 'Study record changed elsewhere' + (response.conflict?.currentVersion ? ' (version ' + response.conflict.currentVersion + ')' : ''));
  const change = response.changed?.[0];
  if (response.status !== 'ok' || !change || typeof change.id !== 'string' || !Number.isInteger(change.version))
    throw new LemmaError('server', 'Invalid study_command receipt');
  return { change, actionNo: typeof response.actionNo === 'number' ? response.actionNo : null };
}
async function readEntry(id: string): Promise<StudyEntryRecord> {
  const db = await client();
  const row = checked((await db.from('study_entries').select('*,study_intervals(*)').eq('id', id).maybeSingle()) as {
    data: JoinedEntry | null; error: unknown;
  });
  return entry(row);
}
async function readBlock(id: string): Promise<CalendarBlockRecord> {
  const db = await client();
  const row = checked((await db.from('calendar_blocks').select('*').eq('id', id).maybeSingle()) as {
    data: BlockRow | null; error: unknown;
  });
  return block(row);
}
async function writeEntry(operation: string, id: string, expectedVersion: number, patch: Record<string, unknown> = {}): Promise<StudyReceipt<StudyEntryRecord>> {
  const receipt = await command('study_entries', operation, { target: { id }, expectedVersion, patch });
  return { record: await readEntry(receipt.change.id), actionNo: receipt.actionNo };
}
async function writeBlock(operation: string, id: string, expectedVersion: number, patch: Record<string, unknown>): Promise<StudyReceipt<CalendarBlockRecord>> {
  const receipt = await command('calendar_blocks', operation, { target: { id }, expectedVersion, patch });
  return { record: await readBlock(receipt.change.id), actionNo: receipt.actionNo };
}

/** Persist an edited focus total through N11.2's interval command, not an unknown
 * minutes patch field. Adjusting intervals necessarily journals separate actions;
 * the final Save receipt exposes the Save action number. */
async function setFocusMinutes(record: StudyEntryRecord, requested: number, expectedVersion: number): Promise<number> {
  if (!Number.isFinite(requested) || requested < 0 || requested > 525600)
    throw new LemmaError('invalid', 'Saved study minutes must be between 0 and 525600');
  if (record.version !== expectedVersion) throw new LemmaError('conflict', 'Study entry changed elsewhere');
  const now = Date.now();
  const focus = record.intervals.filter(i => i.kind === 'focus')
    .map(i => ({ ...i, startMs: Date.parse(i.start), endMs: i.end === null ? now : Date.parse(i.end) }))
    .sort((a, b) => b.endMs - a.endMs);
  const elapsed = focus.reduce((sum, i) => sum + Math.max(0, i.endMs - i.startMs), 0);
  let version = expectedVersion;
  let delta = requested * 60000 - elapsed;
  // Sub-second clock skew does not justify rewriting the journaled history.
  if (Math.abs(delta) < 1000) return version;
  if (delta > 0) {
    // A backdated closed span makes the user-adjusted total explicit and
    // avoids overlapping a paused/break interval or an active focus span.
    const earliest = record.intervals.reduce((a, i) => Math.min(a, Date.parse(i.start)), now);
    const created = await command('study_intervals', 'create', { patch: {
      entry_id: record.id, kind: 'focus', started_at: new Date(earliest - delta).toISOString(),
      ended_at: new Date(earliest).toISOString(),
    } });
    return created.change.version;
  }
  for (const i of focus) {
    if (delta >= -1000) break;
    const duration = i.endMs - i.startMs;
    if (duration <= -delta + 1000) {
      const removed = await command('study_intervals', 'delete', { target: { id: i.id }, expectedVersion: version });
      version = removed.change.version;
      delta += duration;
    } else {
      const changed = await command('study_intervals', 'update', { target: { id: i.id }, expectedVersion: version,
        patch: { started_at: new Date(i.startMs - delta).toISOString() },
      });
      version = changed.change.version;
      delta = 0;
    }
  }
  return version;
}

export function createLiveStudyApi(): StudyApi {
  return {
    mode: 'live',
    async listStudyEntries(range: StudyRange) {
      const db = await client();
      // An interval must begin before the end and still be open after the start.
      // Load full interval histories in the second query, not just the overlapping slices.
      const overlap = checked((await db.from('study_intervals').select('entry_id')
        .lt('started_at', range.end).or('ended_at.is.null,ended_at.gt.' + range.start)) as {
          data: Pick<IntervalRow, 'entry_id'>[] | null; error: unknown;
        });
      const active = checked((await db.from('study_entries').select('*,study_intervals(*)')
        .in('status', ['running', 'paused'])) as { data: JoinedEntry[] | null; error: unknown });
      const ids = [...new Set(overlap.map(row => row.entry_id))].filter(id => !active.some(row => row.id === id));
      const ranged = ids.length ? checked((await db.from('study_entries').select('*,study_intervals(*)')
        .in('id', ids)) as { data: JoinedEntry[] | null; error: unknown }) : [];
      return [...active, ...ranged].map(entry)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    },
    async activeStudyEntry() {
      const db = await client();
      const response = await db.from('study_entries').select('*,study_intervals(*)')
        .in('status', ['running', 'paused']).maybeSingle();
      if (response.error) return fail(response.error);
      return response.data ? entry(response.data as JoinedEntry) : null;
    },
    async startStudyEntry(input: NewStudyEntry) {
      if (await this.activeStudyEntry()) throw new LemmaError('conflict', 'A study entry is already active');
      // N11.2 requires create (draft) followed by start (opens the focus interval).
      // The database owns timer timestamps: startedAt is not an accepted command field.
      const created = await command('study_entries', 'create', {
        patch: { intent: input.intent, source: input.source, ...links(input) },
      });
      return writeEntry('start', created.change.id, created.change.version);
    },
    pauseStudyEntry(id: string, expectedVersion: number) {
      return writeEntry('pause', id, expectedVersion);
    },
    resumeStudyEntry(id: string, expectedVersion: number) {
      return writeEntry('resume', id, expectedVersion);
    },
    breakStudyEntry(id: string, expectedVersion: number) {
      return writeEntry('break', id, expectedVersion);
    },
    async saveStudyEntry(id: string, expectedVersion: number, patch = {}) {
      const existing = await readEntry(id);
      if (existing.status === 'saved') return { record: existing, actionNo: null };
      const version = patch.minutes === undefined ? expectedVersion
        : await setFocusMinutes(existing, patch.minutes, expectedVersion);
      return writeEntry('save', id, version, patchToDb({ reflection: patch.reflection, rating: patch.rating }));
    },
    discardStudyEntry(id: string, expectedVersion: number) {
      return writeEntry('discard', id, expectedVersion);
    },
    async listCalendarBlocks(range: StudyRange) {
      const db = await client();
      const rows = checked((await db.from('calendar_blocks').select('*')
        .lt('starts_at', range.end).gt('ends_at', range.start)
        .order('starts_at', { ascending: true })) as { data: BlockRow[] | null; error: unknown });
      return rows.map(block);
    },
    async createCalendarBlock(input: NewCalendarBlock) {
      const receipt = await command('calendar_blocks', 'create', {
        patch: { ...links(input), ...patchToDb({ kind: input.kind, title: input.title,
          startsAt: input.startsAt, endsAt: input.endsAt, timeZone: input.timeZone }) },
      });
      return { record: await readBlock(receipt.change.id), actionNo: receipt.actionNo };
    },
    updateCalendarBlock(id: string, expectedVersion: number, patch: CalendarBlockPatch) {
      return writeBlock('update', id, expectedVersion, patchToDb(patch));
    },
    async deleteCalendarBlock(id: string, expectedVersion: number) {
      const receipt = await command('calendar_blocks', 'delete', { target: { id }, expectedVersion });
      return { record: { id: receipt.change.id }, actionNo: receipt.actionNo };
    },
  };
}
