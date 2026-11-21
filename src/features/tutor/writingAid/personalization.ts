import {useSyncExternalStore} from 'react';
import {onAccountChange} from '../../../data/authBoundary';
import {subscribeTutorLocalCleanup, writeTutorLocal} from '../../../data/tutor/local-storage';
import {createWritingAidModel, parseWritingAidModel, type WritingAidModel} from './learning';
import {currentWritingAidScope} from './preferences';

const CHANGE = 'lemma:tutor-writing-aid-model';
const MAX_STORAGE = 100_000;
export interface WritingAidPersonalization {enabled: boolean; model: WritingAidModel}

function modelKey(scope: ReturnType<typeof currentWritingAidScope>): string | null {
  if (!scope.key) return null;
  return scope.ownerId ? scope.key.replace(/:writing-aid$/u, ':writing-aid-model') :
    scope.key.replace('writing-aid.v1:', 'writing-aid-model.v1:');
}

function read(): {scopeKey: string; available: boolean; raw: string} {
  const scope = currentWritingAidScope(), key = modelKey(scope);
  let raw = '';
  try {raw = key ? localStorage.getItem(key) ?? '' : '';} catch {/* Keep a fresh in-memory model. */}
  return {scopeKey: scope.id, available: Boolean(key), raw: raw.length <= MAX_STORAGE ? raw : ''};
}

function parse(raw: string): WritingAidPersonalization {
  try {
    const stored = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    if (stored && stored.version === 1 && typeof stored.enabled === 'boolean') {
      return {enabled: stored.enabled, model: parseWritingAidModel(stored.model)};
    }
  } catch {/* Invalid or inaccessible storage starts from neutral weights. */}
  return {enabled: true, model: createWritingAidModel()};
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
    {enabled: false, model: createWritingAidModel()};
}

export function saveWritingAidPersonalization(expectedScope: string, state: WritingAidPersonalization): boolean {
  const scope = currentWritingAidScope(), key = modelKey(scope);
  if (!key || scope.id !== expectedScope) return false;
  const value = JSON.stringify({version: 1, enabled: state.enabled, model: state.model});
  if (value.length > MAX_STORAGE) return false;
  try {
    if (scope.ownerId) writeTutorLocal({ownerId: scope.ownerId, generation: scope.generation}, key, value);
    else localStorage.setItem(key, value);
    window.dispatchEvent(new Event(CHANGE));
    return true;
  } catch {return false;}
}

export function setWritingAidPersonalization(enabled: boolean, scopeKey: string): boolean {
  const state = loadWritingAidPersonalization(scopeKey);
  return saveWritingAidPersonalization(scopeKey, {...state, enabled});
}

/** Forgetting learned data is independent of the user's enabled/disabled setting. */
export function resetWritingAidPersonalization(scopeKey: string): boolean {
  const state = loadWritingAidPersonalization(scopeKey);
  return saveWritingAidPersonalization(scopeKey, {...state, model: createWritingAidModel()});
}

export function useWritingAidPersonalization(): {scopeKey: string; available: boolean; enabled: boolean; raw: string} {
  const value = useSyncExternalStore(subscribe, snapshot, () => '{"scopeKey":"","available":false,"raw":""}');
  const {scopeKey, available, raw} = JSON.parse(value) as {scopeKey: string; available: boolean; raw: string};
  return {scopeKey, available, enabled: available && parse(raw).enabled, raw};
}
