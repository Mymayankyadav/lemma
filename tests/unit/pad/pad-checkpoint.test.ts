import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {authGeneration, publishAuth} from '../../../src/data/authBoundary';
import {currentPadScope, findEligibleDevicePad, findRememberedPad, forgetPadRelease, rememberPad} from '../../../src/features/pad/padCheckpoint';

vi.mock('../../../src/data/env', () => ({supabaseUrl: 'https://pad-fixture.supabase.co'}));

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
const cp = '00000000-0000-4000-8000-000000000004';
const location = {slug: 'analysis', code: 'CP4'};
const sessionId = '00000000-0000-4000-8000-000000000007';
function deviceSession(id: string, sid = sessionId) {
  localStorage.setItem('sb-pad-fixture-auth-token', JSON.stringify({user: {id},
    access_token: 'header.' + btoa(JSON.stringify({sub:id, session_id:sid})) + '.fixture'}));
}

beforeEach(() => {
  const entry = document.createElement('script'); entry.type = 'module'; entry.src = '/lemma/assets/index-fixture.js';
  document.head.append(entry); deviceSession(ownerA);
});

afterEach(() => {publishAuth(null); localStorage.clear(); sessionStorage.clear(); document.querySelector('script[type="module"]')?.remove();});

test('only a current verified account can open or remember its local checkpoint', () => {
  publishAuth({id: ownerA});
  const verified = {ownerId: ownerA, generation: authGeneration(), checkpointId: cp};
  expect(currentPadScope(undefined)).toBeNull();
  expect(rememberPad({...verified, ownerId: ownerB}, location)).toBe(false);
  expect(rememberPad({...verified, checkpointId: 'CP4'}, location)).toBe(false);
  expect(findRememberedPad()).toBeNull();
  expect(rememberPad(verified, location)).toBe(true);
  const bookmark = {ownerId: ownerA, checkpointId: cp, ...location};
  expect(findRememberedPad()).toEqual(bookmark);
  expect(findRememberedPad(cp)).toEqual(bookmark);
  expect(findEligibleDevicePad(cp)).toEqual({...bookmark, sessionId});
  deviceSession(ownerA, cp);
  expect(findEligibleDevicePad(cp)).toBeNull();
  deviceSession(ownerA);
  const app = document.querySelector<HTMLScriptElement>('script[type="module"]')!;
  app.src = '/lemma/assets/changed-entry.js';
  expect(findEligibleDevicePad(cp)).toBeNull();
  app.src = '/lemma/assets/index-fixture.js';

  publishAuth({id: ownerB});
  expect(currentPadScope(verified)).toBeNull();
  expect(findRememberedPad(cp)).toBeNull();
  expect(findRememberedPad()).toBeNull();
  publishAuth(null);
  expect(findRememberedPad()).toBeNull();
  publishAuth({id: ownerA});
  expect(rememberPad(verified, location)).toBe(false);
  expect(currentPadScope(verified)).toBeNull();
  expect(findRememberedPad()).toEqual(bookmark);
  forgetPadRelease(ownerA);
  expect(findEligibleDevicePad(cp)).toBeNull();
});

test('a mismatched local record and a demo tab cannot become a live Pad binding', () => {
  publishAuth({id: ownerA});
  const verified = {ownerId: ownerA, generation: authGeneration(), checkpointId: cp};
  expect(rememberPad(verified, location)).toBe(true);
  localStorage.setItem('lemma.device-pad.v1:' + ownerA + ':' + cp,
    JSON.stringify({...location, ownerId: ownerB, checkpointId: cp}));
  expect(findRememberedPad(cp)).toBeNull();
  sessionStorage.setItem('lemma.demo', '1');
  expect(rememberPad(verified, location)).toBe(false);
  expect(currentPadScope(verified)).toBeNull();
});
