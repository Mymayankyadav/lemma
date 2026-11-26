import {useSyncExternalStore} from 'react';
import {authGeneration, authOwner, onAccountChange} from '../../../data/authBoundary';
import {getDemoProfile, getMode} from '../../../data/mode';
import {subscribeTutorLocalCleanup, tutorLocalScopeActive, writeTutorLocal} from '../../../data/tutor/local-storage';
import {ALL_WRITING_AID_SURFACES, type WritingAidMode, type WritingAidSurface, type WritingAidSurfaces} from './policy';
import {isFlagOn} from '../../../flags';

const CHANGE = 'lemma:tutor-writing-aid-preferences';
const DEFAULT_MASK = 15;
const SURFACE_BITS: Readonly<Record<WritingAidSurface, number>> = {words: 1, replace: 2, correction: 4, ghost: 8};
export const WRITING_AID_MODES = ['balanced', 'fast', 'strict', 'off'] as const;
type Stored = Readonly<{mode: WritingAidMode; mask: number; fasterTyping: boolean}>;
export type WritingAidScope = Readonly<{
  id: string;
  key: string | null;
  ownerId: string | null;
  generation: number;
  defaultMode: WritingAidMode;
}>;

export function currentWritingAidScope(): WritingAidScope {
  const generation = authGeneration();
  if (getMode() === 'demo') {
    const profile = getDemoProfile();
    return {id: 'demo:' + profile, key: 'lemma.demo-tutor.writing-aid.v1:' + profile,
      ownerId: null, generation, defaultMode: 'balanced'};
  }
  const ownerId = authOwner();
  const active = ownerId && tutorLocalScopeActive({ownerId, generation});
  return {id: JSON.stringify(['live', ownerId, generation, Boolean(active)]),
    key: active ? 'lemma.tutor.draft:' + JSON.stringify([ownerId, 'input', 'preferences']) + ':writing-aid' : null,
    ownerId, generation, defaultMode: 'off'};
}

function read(scope: WritingAidScope): Stored {
  try {
    const stored = scope.key && localStorage.getItem(scope.key);
    const match = stored && /^(balanced|fast|strict|off):([0-9]|1[0-5])(:experiment)?$/u.exec(stored);
    if (match) return {mode: match[1] as WritingAidMode, mask: Number(match[2]), fasterTyping: Boolean(match[3])};
  } catch {
    // Storage can be restricted in a private window. Keep the relevant default.
  }
  return {mode: scope.defaultMode, mask: DEFAULT_MASK, fasterTyping: false};
}

function snapshot(): string {
  const scope = currentWritingAidScope();
  const {mode, mask, fasterTyping} = read(scope);
  return JSON.stringify([scope.id, Boolean(scope.key), mode, mask, fasterTyping]);
}

function subscribe(update: () => void): () => void {
  const releaseAuth = onAccountChange(update);
  const releaseCleanup = subscribeTutorLocalCleanup(update);
  window.addEventListener(CHANGE, update);
  window.addEventListener('storage', update);
  return () => {
    releaseAuth();
    releaseCleanup();
    window.removeEventListener(CHANGE, update);
    window.removeEventListener('storage', update);
  };
}

function write(change: (current: Stored) => Stored, expectedScopeKey?: string): boolean {
  const scope = currentWritingAidScope();
  if (!scope.key || (expectedScopeKey !== undefined && scope.id !== expectedScopeKey)) return false;
  const {mode, mask, fasterTyping} = change(read(scope));
  const value = mode + ':' + mask + (fasterTyping ? ':experiment' : '');
  try {
    if (scope.ownerId) writeTutorLocal({ownerId: scope.ownerId, generation: scope.generation}, scope.key, value);
    else localStorage.setItem(scope.key, value);
    window.dispatchEvent(new Event(CHANGE));
    return true;
  } catch {
    return false;
  }
}

export function setWritingAidMode(mode: WritingAidMode, scopeKey?: string): boolean {
  return WRITING_AID_MODES.includes(mode) && write(current => ({...current, mode}), scopeKey);
}

export function setWritingAidSurface(surface: WritingAidSurface, enabled: boolean, scopeKey?: string): boolean {
  const bit = SURFACE_BITS[surface];
  return Boolean(bit) && write(current => ({...current, mask: enabled ? current.mask | bit : current.mask & ~bit}), scopeKey);
}

export function setFasterWritingAid(enabled: boolean, scopeKey: string): boolean {
  return write(current => ({...current, fasterTyping: enabled}), scopeKey);
}

const serverSnapshot = () => '["",false,"off",15,false]';
export function useWritingAidPreferences(): {
  scopeKey: string; available: boolean; mode: WritingAidMode; surfaces: WritingAidSurfaces; fasterTyping: boolean;
  phraseGhostAllowed: boolean;
} {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [scopeKey, available, mode, mask, optedIn] = JSON.parse(stored) as [string, boolean, WritingAidMode, number, boolean];
  const fasterTyping = available && optedIn;
  // N223 (Owner: "These will default and no settings are needed for them as they are non-intrusive"): suggestions are
  // on in every account, live included, whatever was stored, unless the old settings are back behind their flag. The
  // grey-text continuation is off either way until the proof assist brings it back.
  const ghost = isFlagOn('proofAssistGhost');
  if (!isFlagOn('writingAidSettings')) return {
    scopeKey, available, fasterTyping, phraseGhostAllowed: fasterTyping, mode: 'balanced', surfaces: {...ALL_WRITING_AID_SURFACES, ghost},
  };
  const surfaces = mask === DEFAULT_MASK ? {...ALL_WRITING_AID_SURFACES, ghost} : {
    words: Boolean(mask & SURFACE_BITS.words),
    replace: Boolean(mask & SURFACE_BITS.replace),
    correction: Boolean(mask & SURFACE_BITS.correction),
    ghost: ghost && Boolean(mask & SURFACE_BITS.ghost),
  };
  return {scopeKey, available, fasterTyping, phraseGhostAllowed: fasterTyping && Boolean(mask & SURFACE_BITS.ghost), mode, surfaces};
}
