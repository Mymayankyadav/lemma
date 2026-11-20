import {padEdit, type PadEdit} from './padEdit';
import {initializePadInk, type PadStrokes} from './padInk';
import {padBackup} from './padExport';

export const PAD_NOTE_MAX = 65_536;
export const PAD_DB_PREFIX = 'lemma-pad-drafts:';
export const PAD_FIXTURE_DB_PREFIX = 'lemma-pad-fixture:';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const isPadUuid = (id: unknown): id is string => typeof id === 'string' && id.length === 36 && UUID.test(id);

export interface PadDraft {readonly edit: PadEdit; readonly strokes: PadStrokes}

/** The host supplies this only after verifying the active owner and the authorized CheckpointDetail.view.id. */
export interface AuthorizedPadScope {
  readonly ownerId: string;
  readonly checkpointId: string;
  readonly generation: number;
}
export interface PadRevision {readonly id: string; readonly draft: PadDraft}
export interface PadDraftRead {
  readonly status: 'empty' | 'saved' | 'recovered';
  readonly current: PadRevision | null;
  readonly previous: PadRevision | null;
}
type ErrorCode = 'scope' | 'invalid' | 'corrupt' | 'conflict' | 'unavailable';
export class PadDraftError extends Error {
  constructor(readonly code: ErrorCode, message: string) {super(message);}
}

interface Envelope {
  v: 1; ownerId: string; checkpointId: string;
  current: PadRevision; previous: PadRevision | null;
}
type Guard = () => void;
export interface PadDraftBackend {
  read(scope: AuthorizedPadScope, guard: Guard): Promise<unknown>;
  /** Get and replace together in one read/write transaction. */
  update(scope: AuthorizedPadScope, guard: Guard, change: (raw: unknown) => unknown): Promise<void>;
}

function normalizeScope(scope: AuthorizedPadScope | null): AuthorizedPadScope | null {
  if (!scope || !isPadUuid(scope.ownerId) || !isPadUuid(scope.checkpointId)
      || !Number.isSafeInteger(scope.generation) || scope.generation < 0) return null;
  return {ownerId: scope.ownerId.toLowerCase(), checkpointId: scope.checkpointId.toLowerCase(), generation: scope.generation};
}

export function parsePadDraft(raw: unknown): PadDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const {edit, strokes} = raw as Partial<PadDraft>;
  if (!edit || typeof edit.text !== 'string' || edit.text.length > PAD_NOTE_MAX
      || !Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end)
      || edit.start < 0 || edit.end < edit.start || edit.end > edit.text.length
      || !['forward', 'backward', 'none'].includes(edit.direction)) return null;
  if (!Array.isArray(strokes)) return null;
  const ink = initializePadInk(strokes);
  return ink && {edit: padEdit(edit.text, edit.start, edit.end, edit.direction), strokes: ink.strokes};
}

function revision(raw: unknown): PadRevision | null {
  if (!raw || typeof raw !== 'object') return null;
  const {id, draft} = raw as Partial<PadRevision>;
  const checked = parsePadDraft(draft);
  return checked && isPadUuid(id) ? {id, draft: checked} : null;
}

function inspect(raw: unknown, scope: Pick<AuthorizedPadScope, 'ownerId' | 'checkpointId'>): PadDraftRead {
  if (raw === undefined) return {status: 'empty', current: null, previous: null};
  const item = raw as Partial<Envelope> | null;
  if (!item || item.v !== 1 || item.ownerId !== scope.ownerId || item.checkpointId !== scope.checkpointId) {
    throw new PadDraftError('corrupt', 'Unrecognized Pad draft record');
  }
  const newest = revision(item.current), previous = revision(item.previous);
  if (newest) return {status: 'saved', current: newest, previous: previous?.id === newest.id ? null : previous};
  if (previous) return {status: 'recovered', current: previous, previous: null};
  throw new PadDraftError('corrupt', 'No valid Pad revision remains');
}

const STORE = 'drafts';
const unavailable = () => new PadDraftError('unavailable', 'Pad draft storage is unavailable');

function openPadDb(prefix: string, ownerId: string, guard: Guard): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(prefix + ownerId, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      try {
        guard();
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      } catch (error) {
        request.transaction?.abort();
        reject(error);
      }
    };
    request.onblocked = () => {blocked = true; reject(unavailable());};
    request.onerror = () => reject(request.error ?? unavailable());
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
  });
}

async function access(prefix: string, scope: AuthorizedPadScope, guard: Guard, change?: (raw: unknown) => unknown): Promise<unknown> {
  guard();
  const db = await openPadDb(prefix, scope.ownerId, guard);
  try {
    guard();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, change ? 'readwrite' : 'readonly');
      const store = tx.objectStore(STORE), request = store.get(scope.checkpointId);
      let raw: unknown, failure: unknown;
      request.onsuccess = () => {
        try {
          guard();
          raw = request.result;
          if (change) store.put(change(raw), scope.checkpointId);
        } catch (error) {failure = error; tx.abort();}
      };
      tx.onabort = () => reject(failure ?? tx.error ?? unavailable());
      tx.onerror = () => reject(failure ?? tx.error ?? unavailable());
      tx.oncomplete = () => {try {guard(); resolve(raw);} catch (error) {reject(error);}};
    });
  } finally {
    db.close();
  }
}

function browserNamespace(prefix: typeof PAD_DB_PREFIX | typeof PAD_FIXTURE_DB_PREFIX): PadDraftBackend {
  return {
    read: (scope, guard) => access(prefix, scope, guard),
    update: async (scope, guard, change) => {await access(prefix, scope, guard, change);},
  };
}
const browserBackend = browserNamespace(PAD_DB_PREFIX);
const fixtureBackend = browserNamespace(PAD_FIXTURE_DB_PREFIX);

/** One readonly transaction snapshots the owner's saved revisions on this device. */
export async function exportSavedPadDrafts(ownerId: string, guard: Guard) {
  guard();
  if (!isPadUuid(ownerId)) throw new PadDraftError('scope', 'Invalid Pad owner');
  const pads: {checkpointId: string; current: ReturnType<typeof padBackup>; previous: ReturnType<typeof padBackup> | null}[] = [];
  if (typeof indexedDB === 'undefined') return pads;
  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases();
    guard();
    if (!databases.some(item => item.name === PAD_DB_PREFIX + ownerId)) return pads;
  }
  const db = await openPadDb(PAD_DB_PREFIX, ownerId, guard);
  try {
    guard();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE), request = tx.objectStore(STORE).openCursor();
      let failure: unknown;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        try {
          guard();
          if (!isPadUuid(cursor.primaryKey)) throw new PadDraftError('corrupt', 'Invalid saved Pad checkpoint');
          const {current, previous} = inspect(cursor.value, {ownerId, checkpointId: cursor.primaryKey});
          if (!current) throw new PadDraftError('corrupt', 'Empty saved Pad revision');
          pads.push({checkpointId: cursor.primaryKey, current: padBackup(current.draft.edit, current.draft.strokes),
            previous: previous && padBackup(previous.draft.edit, previous.draft.strokes)});
          cursor.continue();
        } catch (error) {failure = error; tx.abort();}
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? unavailable());
    });
    guard();
    return pads;
  } finally {db.close();}
}

/** Synthetic demo identities use a physically distinct DB namespace. */
export function bindFixturePadDraft(getFixtureScope: () => AuthorizedPadScope | null) {
  return bindPadDraft(getFixtureScope, fixtureBackend);
}

/** Captures one authorized binding. Its owner IDs never appear in local exports or tutor context. */
export function bindPadDraft(getAuthorizedScope: () => AuthorizedPadScope | null, backend = browserBackend) {
  const readScope = () => {
    try {return normalizeScope(getAuthorizedScope());} catch {return null;}
  };
  const scope = readScope();
  if (!scope) return null;
  let closed = false;
  function isCurrent(): boolean {
    if (closed) return false;
    const now = readScope();
    closed = !now || now.ownerId !== scope!.ownerId || now.checkpointId !== scope!.checkpointId
      || now.generation !== scope!.generation;
    return !closed;
  }
  const guard = () => {
    if (!isCurrent()) throw new PadDraftError('scope', 'The Pad owner or checkpoint changed');
  };
  return {
    isCurrent,
    close: () => {closed = true;},
    async read(): Promise<PadDraftRead> {
      guard();
      const raw = await backend.read(scope, guard);
      guard();
      return inspect(raw, scope);
    },
    async save(value: PadDraft, expectedId: string | null): Promise<PadDraftRead> {
      guard();
      const draft = parsePadDraft(value);
      if (!draft) throw new PadDraftError('invalid', 'Pad draft exceeds storage limits or contains invalid data');
      const current = {id: crypto.randomUUID(), draft};
      let previous: PadRevision | null = null;
      await backend.update(scope, guard, raw => {
        guard();
        const saved = inspect(raw, scope);
        if ((saved.current?.id ?? null) !== expectedId) {
          throw new PadDraftError('conflict', 'A newer Pad revision is already saved');
        }
        previous = saved.current;
        return {v: 1, ownerId: scope.ownerId, checkpointId: scope.checkpointId, current, previous} satisfies Envelope;
      });
      guard();
      return {status: 'saved', current, previous};
    },
  };
}
