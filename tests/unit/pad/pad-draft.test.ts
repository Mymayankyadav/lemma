import {afterEach, expect, test, vi} from 'vitest';
import {bindPadDraft, PAD_DB_PREFIX, PAD_NOTE_MAX, type PadDraftBackend} from '../../../src/features/pad/padDraftStore';
import {createPadDraftSession} from '../../../src/features/pad/padDraftSession';
import {padEdit} from '../../../src/features/pad/padEdit';

const ownerA = '00000000-0000-4000-8000-000000000001', ownerB = '00000000-0000-4000-8000-000000000002';
const checkpointA = '00000000-0000-4000-8000-000000000003', checkpointB = '00000000-0000-4000-8000-000000000004';
const first = {ownerId: ownerA, checkpointId: checkpointA, generation: 1};
const draft = (text: string) => ({edit: padEdit(text, 0, Math.min(2, text.length), 'backward'), strokes: [[{x: 4, y: 7}]]});
const key = (scope: typeof first) => scope.ownerId + '/' + scope.checkpointId;
afterEach(() => vi.unstubAllGlobals());

function memory() {
  const records = new Map<string, unknown>();
  const backend: PadDraftBackend = {
    read: async (scope, guard) => {guard(); return structuredClone(records.get(key(scope)));},
    update: async (scope, guard, change) => {
      guard();
      const id = key(scope);
      records.set(id, structuredClone(change(records.get(id))));
    },
  };
  return {backend, records};
}

test('keeps two revisions, recovers a corrupt latest, and never overwrites an unknown envelope', async () => {
  const {backend, records} = memory();
  const bound = bindPadDraft(() => first, backend)!;
  expect(await bound.read()).toEqual({status: 'empty', current: null, previous: null});
  const a = await bound.save(draft('First proof'), null);
  const b = await bound.save(draft('Second proof'), a.current!.id);
  expect(b.previous).toEqual(a.current);
  await expect(bound.save(draft('Stale tab'), a.current!.id)).rejects.toMatchObject({code: 'conflict'});
  const envelope = records.get(key(first)) as {v: number; current: {draft: unknown}};
  envelope.current.draft = {...draft('bad'), strokes: [[{x: 1, y: 500}]]};
  const recovered = await bound.read();
  expect(recovered).toEqual({status: 'recovered', current: a.current, previous: null});
  const c = await bound.save(draft('After recovery'), recovered.current!.id);
  expect(c.current!.id).not.toBe(b.current!.id);
  expect(c.previous).toEqual(a.current);
  const unknown = {...envelope, v: 2};
  records.set(key(first), unknown);
  await expect(bound.save(draft('Not written'), c.current!.id)).rejects.toMatchObject({code: 'corrupt'});
  expect(records.get(key(first))).toBe(unknown);
});

test('requires verified UUID bindings, separates owner/checkpoint, and rejects a misfiled envelope', async () => {
  const {backend, records} = memory();
  expect(bindPadDraft(() => null, backend)).toBeNull();
  expect(bindPadDraft(() => {throw new Error('cannot confirm owner');}, backend)).toBeNull();
  expect(bindPadDraft(() => ({...first, ownerId: 'owner@example.test'}), backend)).toBeNull();
  expect(bindPadDraft(() => ({...first, checkpointId: 'CP2'}), backend)).toBeNull();
  expect(bindPadDraft(() => ({...first, ownerId: ownerA + '\n'}), backend)).toBeNull();
  expect(bindPadDraft(() => ({...first, generation: -1}), backend)).toBeNull();
  await bindPadDraft(() => first, backend)!.save(draft('Private A note'), null);
  const separate = {...first, ownerId: ownerB, generation: 2};
  expect((await bindPadDraft(() => separate, backend)!.read()).status).toBe('empty');
  expect((await bindPadDraft(() => ({...first, checkpointId: checkpointB}), backend)!.read()).status).toBe('empty');
  records.set(key(separate), records.get(key(first)));
  await expect(bindPadDraft(() => separate, backend)!.read()).rejects.toMatchObject({code: 'corrupt'});
});

test('drops a late read and permanently invalidates old-account work, even after returning to that owner', async () => {
  const {backend} = memory();
  let scope = first;
  await bindPadDraft(() => scope, backend)!.save(draft('Private working'), null);
  let resume!: () => void;
  const lateRead = new Promise<void>(resolve => {resume = resolve;});
  const blocked: PadDraftBackend = {...backend, read: async (scope, guard) => {
    const raw = await backend.read(scope, guard);
    await lateRead;
    return raw;
  }};
  const bound = bindPadDraft(() => scope, blocked)!;
  const session = createPadDraftSession(bound);
  const opening = session.load();
  scope = {...first, ownerId: ownerB, generation: 2};
  scope = {...first, generation: 3};
  resume();
  await opening;
  expect(session.snapshot()).toMatchObject({status: 'scope-changed', draft: {edit: {text: ''}}});
  await expect(bound.save(draft('Old editor request'), null)).rejects.toMatchObject({code: 'scope'});
  expect((await bindPadDraft(() => scope, backend)!.read()).current?.draft.edit.text).toBe('Private working');
});

test('keeps in-memory edits on quota, oversized drafts and conflicts; explicit recovery becomes an unsaved edit', async () => {
  const {backend} = memory();
  let fail = false;
  const limited: PadDraftBackend = {...backend, update: async (...args) => {
    if (fail) throw new DOMException('full', 'QuotaExceededError');
    await backend.update(...args);
  }};
  const bound = bindPadDraft(() => first, limited)!;
  const session = createPadDraftSession(bound);
  await session.load();
  session.edit(draft('Saved note'));
  await session.save();
  fail = true;
  session.edit(draft('Keep even when full'));
  await session.save();
  expect(session.snapshot()).toMatchObject({status: 'save-failed', draft: {edit: {text: 'Keep even when full'}}});
  expect((await bound.read()).current?.draft.edit.text).toBe('Saved note');
  fail = false;
  const tooLarge = draft('x'.repeat(PAD_NOTE_MAX + 1));
  session.edit(tooLarge);
  await session.save();
  expect(session.snapshot()).toMatchObject({status: 'save-failed', draft: tooLarge});
  session.edit(draft('Second note'));
  await session.save();
  const beforeDuplicate = await bound.read();
  await session.save();
  expect(await bound.read()).toEqual(beforeDuplicate);
  session.restorePrevious();
  expect(session.snapshot()).toMatchObject({status: 'unsaved', draft: {edit: {text: 'Saved note'}}, hasPrevious: true});
  const newest = (await bound.read()).current!;
  await bound.save(draft('New in another tab'), newest.id);
  await session.save();
  expect(session.snapshot()).toMatchObject({status: 'conflict', draft: {edit: {text: 'Saved note'}}});
  expect((await bound.read()).current?.draft.edit.text).toBe('New in another tab');
});

test('a late successful save does not replace newer in-memory typing', async () => {
  const {backend} = memory();
  let resume!: () => void;
  const paused = new Promise<void>(resolve => {resume = resolve;});
  const delayed = {...backend, update: async (...args: Parameters<PadDraftBackend['update']>) => {
    await paused;
    await backend.update(...args);
  }};
  const bound = bindPadDraft(() => first, delayed)!;
  const session = createPadDraftSession(bound);
  await session.load();
  session.edit(draft('First capture'));
  const saving = session.save();
  session.edit(draft('Keep this later edit'));
  resume();
  await saving;
  expect(session.snapshot()).toMatchObject({status: 'unsaved', draft: {edit: {text: 'Keep this later edit'}}});
  expect((await bound.read()).current?.draft.edit.text).toBe('First capture');
  await session.save();
  expect((await bound.read()).current?.draft.edit.text).toBe('Keep this later edit');
});

test('missing IndexedDB does not masquerade as an empty draft or prevent local editing', async () => {
  vi.stubGlobal('indexedDB', undefined);
  const session = createPadDraftSession(bindPadDraft(() => first)!);
  await session.load();
  session.edit(draft('Still available to export'));
  await session.save();
  expect(session.snapshot()).toMatchObject({status: 'load-failed', draft: {edit: {text: 'Still available to export'}}});
});

test('browser backend scopes database/key and acknowledges only a completed get/put transaction', async () => {
  const calls: string[] = [];
  let raw: unknown;
  const db = {onversionchange: vi.fn(), close: vi.fn(), transaction: (store: string, mode: string) => {
    calls.push(store + ':' + mode);
    const tx = {oncomplete: () => {}, objectStore: () => ({
      get: (slot: string) => {
        calls.push('get:' + slot);
        const req = {result: raw, onsuccess: () => {}};
        queueMicrotask(() => {req.onsuccess(); queueMicrotask(() => {calls.push('complete'); tx.oncomplete();});});
        return req;
      },
      put: (next: unknown, slot: string) => {calls.push('put:' + slot); raw = next;},
    })};
    return tx;
  }};
  vi.stubGlobal('indexedDB', {open: (name: string, version: number) => {
    calls.push(name + ':' + version);
    const req = {result: db, onsuccess: () => {}};
    queueMicrotask(() => req.onsuccess());
    return req;
  }});
  const bound = bindPadDraft(() => first)!;
  expect((await bound.save(draft('proof'), null)).status).toBe('saved');
  expect(calls).toEqual([PAD_DB_PREFIX + ownerA + ':1', 'drafts:readwrite', 'get:' + checkpointA,
    'put:' + checkpointA, 'complete']);
  expect(db.close).toHaveBeenCalledTimes(1);
  expect((await bound.read()).current?.draft.edit.text).toBe('proof');
  expect(calls).toContain('drafts:readonly');
});

test('an account change while writing never replaces either namespace', async () => {
  const {backend} = memory();
  let scope = first, resume!: () => void;
  const paused = new Promise<void>(resolve => {resume = resolve;});
  const delayed = {...backend, update: async (...args: Parameters<PadDraftBackend['update']>) => {
    await paused;
    await backend.update(...args);
  }};
  const a = bindPadDraft(() => scope, delayed)!;
  const writing = a.save(draft('Do not cross accounts'), null);
  scope = {...first, ownerId: ownerB, generation: 2};
  resume();
  await expect(writing).rejects.toMatchObject({code: 'scope'});
  expect((await bindPadDraft(() => scope, backend)!.read()).status).toBe('empty');
  expect((await bindPadDraft(() => first, backend)!.read()).status).toBe('empty');
});
