// v6 study data contract (rules v2.0, owner-setup). One typed interface shared by the demo adapter (N14.2,
// src/data/study/demo.ts), the live adapter (N16, src/data/study/live.ts) and every v6 screen (Today/Focus,
// Calendar, Progress). Shapes follow the N10 tables (supabase/migrations/20261105141000_v6_study.sql) in camelCase.
// Screens import only this file and getStudyApi() from ./index, so they can be built in parallel with the adapters.
// Change it only additively; the effort metrics (src/lib/effort) accept StudyEntryRecord directly.

export type StudyEntryStatus = 'running' | 'paused' | 'draft' | 'saved' | 'discarded';
export type StudyEntrySource = 'timer' | 'manual';
export type StudyIntervalKind = 'focus' | 'break';
export type CalendarBlockKind = 'study' | 'busy';
export type CalendarBlockStatus = 'planned' | 'done' | 'cancelled';

/** Optional links to the learning model (all owned by the same user). */
export interface StudyLinks {
 subjectId?: string | null;
 projectId?: string | null;
 checkpointId?: string | null;
 sessionId?: string | null;
}

export interface StudyInterval {
 id: string;
 kind: StudyIntervalKind;
 /** ISO instant. */
 start: string;
 /** ISO instant; null while open. Half-open [start, end). */
 end: string | null;
}

export interface StudyEntryRecord extends StudyLinks {
 id: string;
 intent: string;
 source: StudyEntrySource;
 status: StudyEntryStatus;
 reflection: string | null;
 rating: 1 | 2 | 3 | 4 | 5 | null;
 version: number;
 createdAt: string;
 updatedAt: string;
 savedAt: string | null;
 intervals: StudyInterval[];
}

export interface CalendarBlockRecord extends StudyLinks {
 id: string;
 kind: CalendarBlockKind;
 title: string;
 startsAt: string;
 endsAt: string;
 /** IANA zone the block was planned in. */
 timeZone: string;
 status: CalendarBlockStatus;
 version: number;
}

/** A half-open instant range [start, end). */
export interface StudyRange { start: string; end: string }

/** Every write returns the record's new version, and an actionNo when the write can be undone. */
export interface StudyReceipt<T> { record: T; actionNo: number | null }

export interface NewStudyEntry extends StudyLinks { intent: string; source: StudyEntrySource; startedAt?: string }
export interface NewCalendarBlock extends StudyLinks { kind: CalendarBlockKind; title: string; startsAt: string; endsAt: string; timeZone: string }
export type CalendarBlockPatch = Partial<Pick<CalendarBlockRecord, 'title' | 'startsAt' | 'endsAt' | 'timeZone' | 'status' | 'kind'>> & StudyLinks;

export interface StudyApi {
 readonly mode: 'live' | 'demo';
 /** Entries with any interval overlapping the range, plus running/paused ones; oldest first. */
 listStudyEntries(range: StudyRange): Promise<StudyEntryRecord[]>;
 /** The one running or paused entry, if any. */
 activeStudyEntry(): Promise<StudyEntryRecord | null>;
 /** Starts a timer entry (status running, one open focus interval). Fails with conflict if one is already active. */
 startStudyEntry(input: NewStudyEntry): Promise<StudyReceipt<StudyEntryRecord>>;
 pauseStudyEntry(id: string, expectedVersion: number, at?: string): Promise<StudyReceipt<StudyEntryRecord>>;
 resumeStudyEntry(id: string, expectedVersion: number, at?: string): Promise<StudyReceipt<StudyEntryRecord>>;
 breakStudyEntry(id: string, expectedVersion: number, at?: string): Promise<StudyReceipt<StudyEntryRecord>>;
 /** Closes any open interval and saves. Saving an already saved entry returns it unchanged. */
 saveStudyEntry(id: string, expectedVersion: number, patch?: { reflection?: string | null; rating?: StudyEntryRecord['rating']; minutes?: number }): Promise<StudyReceipt<StudyEntryRecord>>;
 discardStudyEntry(id: string, expectedVersion: number): Promise<StudyReceipt<StudyEntryRecord>>;
 /** Blocks overlapping the range, by startsAt. */
 listCalendarBlocks(range: StudyRange): Promise<CalendarBlockRecord[]>;
 createCalendarBlock(input: NewCalendarBlock): Promise<StudyReceipt<CalendarBlockRecord>>;
 updateCalendarBlock(id: string, expectedVersion: number, patch: CalendarBlockPatch): Promise<StudyReceipt<CalendarBlockRecord>>;
 deleteCalendarBlock(id: string, expectedVersion: number): Promise<StudyReceipt<{ id: string }>>;
}

export class StudyNotImplemented extends Error {
 readonly code = 'not_implemented';
 constructor(mode: string, method: string) { super(`study ${mode} adapter: ${method} is not implemented yet`); this.name = 'StudyNotImplemented'; }
}

/** An adapter that reads nothing and refuses writes: the placeholder until N14.2 (demo) and N16 (live) land. */
export function emptyStudyApi(mode: 'live' | 'demo'): StudyApi {
 const refuse = (method: string) => () => Promise.reject(new StudyNotImplemented(mode, method));
 return {
  mode,
  listStudyEntries: () => Promise.resolve([]),
  activeStudyEntry: () => Promise.resolve(null),
  startStudyEntry: refuse('startStudyEntry'),
  pauseStudyEntry: refuse('pauseStudyEntry'),
  resumeStudyEntry: refuse('resumeStudyEntry'),
  breakStudyEntry: refuse('breakStudyEntry'),
  saveStudyEntry: refuse('saveStudyEntry'),
  discardStudyEntry: refuse('discardStudyEntry'),
  listCalendarBlocks: () => Promise.resolve([]),
  createCalendarBlock: refuse('createCalendarBlock'),
  updateCalendarBlock: refuse('updateCalendarBlock'),
  deleteCalendarBlock: refuse('deleteCalendarBlock'),
 };
}
