import { LemmaError } from '../api';
import type { NewPreset, PresetArchive, PresetMode, PresetPatch, PresetQuery } from './contract';

export const modes: readonly PresetMode[] = ['pomodoro','flowtime','open'];
const keys = ['label','mode','focusMinutes','breakMinutes','longBreakMinutes','cycles',
  'position','subjectId','projectId','checkpointId'];
export function invalid(message: string): never { throw new LemmaError('invalid',message); }
export function checkVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) invalid('Expected preset version must be positive');
}
export function checkId(id: string): string {
  if (typeof id !== 'string' || !id.trim()) invalid('Preset ID is required');
  return id;
}
export function checkPosition(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)
    invalid('Preset position must be a non-negative integer');
  return value;
}
export function numberMinutes(value: unknown, key: string, lo: number, hi: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < lo || Number(value) > hi)
    invalid(key+' must be '+lo+'..'+hi+' whole minutes');
  return Number(value);
}
export type Input = {
  label?: string; mode?: PresetMode; focusMinutes?: number; breakMinutes?: number;
  longBreakMinutes?: number; cycles?: number; position?: number;
  subjectId?: string | null; projectId?: string | null; checkpointId?: string | null;
};
/** Normalize only specified fields; unknown keys (including owner identity) are refused. */
export function normalize(input: NewPreset | PresetPatch, create: boolean): Input {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid preset payload');
  for (const k of Object.keys(input))
    if (!keys.includes(k) || (!create && k === 'position')) invalid('Unsupported preset field '+k);
  const out: Input = {};
  if (input.label !== undefined) {
    if (typeof input.label !== 'string' || input.label.trim().length < 1 || input.label.trim().length > 120)
      invalid('Preset label must be 1..120 characters');
    out.label = input.label.trim();
  } else if (create) invalid('Preset label is required');
  if (input.mode !== undefined) {
    if (!modes.includes(input.mode)) invalid('Unsupported preset mode');
    out.mode = input.mode;
  }
  for (const [key,lo,hi] of [
    ['focusMinutes',1,480],['breakMinutes',1,180],['longBreakMinutes',1,240],['cycles',1,24],
  ] as const) {
    if (input[key] !== undefined)
      out[key] = numberMinutes(input[key],key,lo,hi);
  }
  for (const key of ['subjectId','projectId','checkpointId'] as const)
    if (input[key] !== undefined) {
      if (input[key] !== null && (typeof input[key] !== 'string' || !input[key]!.trim()))
        invalid('Invalid preset '+key);
      out[key] = input[key];
    }
  const position = (input as Input).position;
  if (create && position !== undefined) out.position = checkPosition(position);
  if (!create && Object.keys(out).length === 0) invalid('Preset update is empty');
  return out;
}
export function normalizeQuery(query: PresetQuery = {}): { archived: PresetArchive; limit: number } {
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      Object.keys(query).some(key => !['archived','limit','cursor'].includes(key)))
    invalid('Invalid preset query');
  const archived = query.archived ?? 'active';
  if (!['active','archived','all'].includes(archived)) invalid('Invalid preset archive filter');
  const limit = query.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    invalid('Preset page size must be 1..50');
  return { archived, limit };
}
export interface PresetCursor {
  v: 1; archived: PresetArchive; position: number; createdAt: string; id: string;
}
export function encodeCursor(record: {position:number;createdAt:string;id:string}, archived:PresetArchive):string {
  return btoa(JSON.stringify({v:1,archived,position:record.position,createdAt:record.createdAt,id:record.id}))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeCursor(raw: string|null|undefined, archived:PresetArchive):PresetCursor|null {
  if (raw == null) return null;
  try {
    if (typeof raw !== 'string' || raw.length < 4 || raw.length > 900 || !/^[A-Za-z0-9_-]+$/.test(raw))
      invalid('Invalid preset cursor');
    const value:unknown = JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4)));
    const c = value as PresetCursor;
    if (!c || c.v !== 1 || c.archived !== archived || !Number.isSafeInteger(c.position) ||
      c.position < 0 || typeof c.id !== 'string' || !c.id ||
      typeof c.createdAt !== 'string' || !Number.isFinite(Date.parse(c.createdAt)))
      invalid('Invalid or mismatched preset cursor');
    return c;
  } catch { return invalid('Invalid or mismatched preset cursor'); }
}
export function compareCursor(a:{position:number;createdAt:string;id:string},
  b:{position:number;createdAt:string;id:string}):number {
  return a.position-b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
