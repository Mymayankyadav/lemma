import {useMemo, useSyncExternalStore} from 'react';
import {onAccountChange} from '../../../data/authBoundary';
import {subscribeTutorLocalCleanup, writeTutorLocal} from '../../../data/tutor/local-storage';
import {createWritingAidModel, parseWritingAidModel, type WritingAidModel} from './learning';
import {currentWritingAidScope} from './preferences';

const CHANGE = 'lemma:tutor-writing-aid-model';
const MAX_STORAGE = 100_000;
interface WritingAidPersonalization {enabled: boolean; generation: string; model: WritingAidModel}

function modelKey(scope: ReturnType<typeof currentWritingAidScope>): string | null {
  if (!scope.key) return null;
  return scope.ownerId ? scope.key.replace(/:writing-aid$/u, ':writing-aid-model') :
    scope.key.replace('writing-aid.v1:', 'writing-aid-model.v1:');
}

function readRaw(key: string): string {
  const raw = localStorage.getItem(key) ?? '';
  return raw.length <= MAX_STORAGE ? raw : '';
}

function read(): {scopeKey: string; available: boolean; raw: string} {
  const scope = currentWritingAidScope(), key = modelKey(scope);
  let raw = '';
  try {if (key) raw = readRaw(key);} catch {/* Keep a fresh in-memory model. */}
  return {scopeKey: scope.id, available: Boolean(key), raw};
}

function parse(raw: string): WritingAidPersonalization {
  try {
    const stored = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    if (stored && stored.version === 1 && typeof stored.enabled === 'boolean') {
      return {enabled: stored.enabled, model: parseWritingAidModel(stored.model),
        generation: typeof stored.generation === 'string' ? stored.generation : ''};
    }
  } catch {/* Invalid or inaccessible storage starts from neutral weights. */}
  return {enabled: true, generation: '', model: createWritingAidModel()};
}

function snapshot(): string {return JSON.stringify(read());}
function subscribe(update: () => void): () => void {
  const auth = onAccountChange(update), cleanup = subscribeTutorLocalCleanup(update);
  window.addEventListener(CHANGE, update);
  window.addEventListener('storage', update);
  return () => {auth(); cleanup(); window.removeEventListener(CHANGE, update); window.removeEventListener('storage', update);};
}

export function loadWritingAidPersonalization(expectedScope: string): WritingAidPersonalization {
  const stored = read();
  return stored.scopeKey === expectedScope && stored.available ? parse(stored.raw) :
    {enabled: false, generation: '', model: createWritingAidModel()};
}

function write(expectedScope: string, change: (current: WritingAidPersonalization) => WritingAidPersonalization | null): boolean {
  const scope = currentWritingAidScope(), key = modelKey(scope);
  if (!key || scope.id !== expectedScope) return false;
  try {
    const state = change(parse(readRaw(key)));
    if (!state) return false;
    const value = JSON.stringify({version: 1, ...state});
    if (value.length > MAX_STORAGE) return false;
    if (scope.ownerId) writeTutorLocal({ownerId: scope.ownerId, generation: scope.generation}, key, value);
    else localStorage.setItem(key, value);
    window.dispatchEvent(new Event(CHANGE));
    return true;
  } catch {return false;}
}

export function saveWritingAidModel(scopeKey: string, generation: string, model: WritingAidModel): boolean {
  // Check storage again even if this composer has yet to observe a reset or pause.
  return write(scopeKey, current => current.enabled && current.generation === generation ? {...current, model} : null);
}

export function setWritingAidPersonalization(enabled: boolean, scopeKey: string): boolean {
  return write(scopeKey, current => ({...current, enabled,
    generation: enabled ? current.generation : crypto.randomUUID()}));
}

/** Forgetting learned data is independent of the user's enabled/disabled setting. */
export function resetWritingAidPersonalization(scopeKey: string): boolean {
  return write(scopeKey, current => ({...current, generation: crypto.randomUUID(), model: createWritingAidModel()}));
}

export function useWritingAidPersonalization(): WritingAidPersonalization & {scopeKey: string} {
  const value = useSyncExternalStore(subscribe, snapshot, () => '{"scopeKey":"","available":false,"raw":""}');
  return useMemo(() => {
    const {scopeKey, available, raw} = JSON.parse(value) as ReturnType<typeof read>;
    const state = parse(raw);
    return {...state, scopeKey, enabled: available && state.enabled};
  }, [value]);
}
