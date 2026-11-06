// N55/D8(c): typed preset records shared by demo, live and future v6 screens.
// The N41 migration owns the server table and command; this module never writes
// directly to that table or invents a parallel live data store.
import type { StudyReceipt } from '../study/contract';

export type PresetMode = 'pomodoro' | 'flowtime' | 'open';
export type PresetArchive = 'active' | 'archived' | 'all';

export interface PresetLinks {
  subjectId?: string | null;
  projectId?: string | null;
  checkpointId?: string | null;
}
export interface PresetRecord {
  id: string;
  label: string;
  subjectId: string | null;
  projectId: string | null;
  checkpointId: string | null;
  mode: PresetMode;
  /** Positive whole minutes. */
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  /** Positive number of focus cycles. */
  cycles: number;
  /** Non-negative order within the owner's presets. */
  position: number;
  /** Null while active; archival never changes historical study labels. */
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface NewPreset extends PresetLinks {
  label: string;
  mode?: PresetMode;
  focusMinutes?: number;
  breakMinutes?: number;
  longBreakMinutes?: number;
  cycles?: number;
  position?: number;
}
export interface PresetPatch extends PresetLinks {
  label?: string;
  mode?: PresetMode;
  focusMinutes?: number;
  breakMinutes?: number;
  longBreakMinutes?: number;
  cycles?: number;
}
export interface PresetQuery {
  archived?: PresetArchive;
  /** Bounded 1..50, default 20. */
  limit?: number;
  /** Filter-bound opaque cursor returned from the previous page. */
  cursor?: string | null;
}
export interface PresetPage {
  items: PresetRecord[];
  /** Exact owner-scoped count for the archival filter (not just the current page). */
  total: number;
  nextCursor: string | null;
}
export interface PresetApi {
  readonly mode: 'demo' | 'live';
  listPresets(query?: PresetQuery): Promise<PresetPage>;
  getPreset(id: string): Promise<PresetRecord | null>;
  createPreset(input: NewPreset): Promise<StudyReceipt<PresetRecord>>;
  updatePreset(id: string, expectedVersion: number, patch: PresetPatch): Promise<StudyReceipt<PresetRecord>>;
  reorderPreset(id: string, expectedVersion: number, position: number): Promise<StudyReceipt<PresetRecord>>;
  archivePreset(id: string, expectedVersion: number): Promise<StudyReceipt<PresetRecord>>;
  restorePreset(id: string, expectedVersion: number): Promise<StudyReceipt<PresetRecord>>;
  /** Referenced presets must be archived rather than physically deleted. */
  deletePreset(id: string, expectedVersion: number): Promise<StudyReceipt<{ id: string }>>;
}
