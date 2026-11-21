import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {authGeneration, publishAuth} from '../../../src/data/authBoundary';
import {removeDeletedOwnerTutorData, tutorStorageOwner} from '../../../src/data/tutor/local-storage';
import {
  setWritingAidMode, setWritingAidSurface, useWritingAidPreferences,
} from '../../../src/features/tutor/writingAid/preferences';
import {WritingAidSettings} from '../../../src/features/tutor/writingAid/WritingAidSettings';
import {createWritingAidModel, recordWritingAidVocabulary} from '../../../src/features/tutor/writingAid/learning';
import {loadWritingAidPersonalization, resetWritingAidPersonalization, saveWritingAidPersonalization} from '../../../src/features/tutor/writingAid/personalization';

const modes = vi.hoisted(() => ({mode: 'live', profile: 'default'}));
vi.mock('../../../src/data/mode', () => ({getMode: () => modes.mode, getDemoProfile: () => modes.profile}));

let owner: string;
let sequence = 0;
let host: HTMLDivElement;
let root: Root;
let prefs: ReturnType<typeof useWritingAidPreferences>;
const key = (id: string) => 'lemma.tutor.draft:' + JSON.stringify([id, 'input', 'preferences']) + ':writing-aid';
const modelKey = (id: string) => key(id) + '-model';

function Harness() {
  prefs = useWritingAidPreferences();
  return <WritingAidSettings/>;
}

beforeEach(async () => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear();
  modes.mode = 'live';
  modes.profile = 'default';
  owner = 'writing-owner]:"\\' + ++sequence;
  publishAuth({id: owner});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness/>));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  publishAuth(null);
  vi.restoreAllMocks();
});

it('defaults live to Off and demo profiles to Balanced with independent settings', async () => {
  expect(prefs.mode).toBe('off');
  expect(host.querySelectorAll('[role="switch"]:disabled')).toHaveLength(4);
  await act(async () => {expect(setWritingAidMode('strict', prefs.scopeKey)).toBe(true);});
  expect(prefs.mode).toBe('strict');
  expect(host.querySelectorAll('[role="switch"]:disabled')).toHaveLength(1);
  expect(localStorage.getItem(key(owner))).toBe('strict:15');

  const liveScope = prefs.scopeKey;
  modes.mode = 'demo';
  await act(async () => root.render(<Harness/>));
  expect(prefs.mode).toBe('balanced');
  expect(Object.values(prefs.surfaces).every(Boolean)).toBe(true);
  expect(setWritingAidMode('fast', liveScope)).toBe(false);
  await act(async () => {expect(setWritingAidSurface('ghost', false, prefs.scopeKey)).toBe(true);});
  expect(localStorage.getItem('lemma.demo-tutor.writing-aid.v1:default')).toBe('balanced:7');
  modes.profile = 'stress';
  await act(async () => root.render(<Harness/>));
  expect(prefs.surfaces.ghost).toBe(true);
  modes.mode = 'live';
  await act(async () => root.render(<Harness/>));
  expect(prefs.mode).toBe('strict');
  expect(prefs.surfaces.ghost).toBe(true);
});

it('blocks stale account writes and removes only the deleted owner’s settings', async () => {
  const originalScope = prefs.scopeKey;
  await act(async () => {expect(setWritingAidMode('fast', originalScope)).toBe(true);});
  expect(host.textContent).toContain('Experimental');
  expect(tutorStorageOwner(key(owner))).toBe(owner);
  await act(async () => publishAuth({id: 'other-owner'}));
  expect(prefs.mode).toBe('off');
  expect(setWritingAidMode('fast', originalScope)).toBe(false);
  await act(async () => {expect(setWritingAidMode('balanced', prefs.scopeKey)).toBe(true);});
  await act(async () => publishAuth({id: owner}));
  expect(prefs.mode).toBe('fast');
  expect(prefs.scopeKey).not.toBe(originalScope);

  await act(async () => {expect(await removeDeletedOwnerTutorData(owner, authGeneration())).toBe(true);});
  expect(prefs.available).toBe(false);
  expect(prefs.mode).toBe('off');
  expect(setWritingAidMode('fast', prefs.scopeKey)).toBe(false);
  expect(localStorage.getItem(key(owner))).toBeNull();
  expect(localStorage.getItem(key('other-owner'))).toBe('balanced:15');
});

it('falls back on invalid settings and leaves independently stored handwriting preferences intact', async () => {
  const inputKey = key(owner).replace(':writing-aid', ':input-assist');
  localStorage.setItem(inputKey, '3');
  localStorage.setItem(key(owner), 'fast:23');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', {key: key(owner)})));
  expect(prefs.mode).toBe('off');
  await act(async () => {expect(setWritingAidMode('balanced', prefs.scopeKey)).toBe(true);});
  expect(localStorage.getItem(inputKey)).toBe('3');
  expect(localStorage.getItem(key(owner))).toBe('balanced:15');
});

it('isolates learned vocabulary by owner, resets it, and deletes it with tutor data', async () => {
  const originalScope = prefs.scopeKey;
  const model = createWritingAidModel();
  recordWritingAidVocabulary(model, 'homomorphism', 1000);
  await act(async () => {expect(saveWritingAidPersonalization(originalScope, {enabled: true, model})).toBe(true);});
  expect(tutorStorageOwner(modelKey(owner))).toBe(owner);
  expect(localStorage.getItem(modelKey(owner))).toContain('homomorphism');
  await act(async () => publishAuth({id: 'different-writing-owner'}));
  const otherScope = prefs.scopeKey;
  expect(loadWritingAidPersonalization(otherScope).model.vocabulary.homomorphism).toBeUndefined();
  expect(saveWritingAidPersonalization(originalScope, {enabled: true, model})).toBe(false);
  await act(async () => {expect(saveWritingAidPersonalization(otherScope, {enabled: false, model})).toBe(true);});
  await act(async () => {expect(resetWritingAidPersonalization(otherScope)).toBe(true);});
  expect(loadWritingAidPersonalization(otherScope).enabled).toBe(false);
  expect(Object.keys(loadWritingAidPersonalization(otherScope).model.vocabulary)).toEqual([]);
  await act(async () => publishAuth({id: owner}));
  await act(async () => {expect(await removeDeletedOwnerTutorData(owner, authGeneration())).toBe(true);});
  expect(localStorage.getItem(modelKey(owner))).toBeNull();
  expect(localStorage.getItem(modelKey('different-writing-owner'))).not.toBeNull();
  expect(saveWritingAidPersonalization(prefs.scopeKey, {enabled: true, model})).toBe(false);
});
