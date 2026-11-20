import {authGeneration, authOwner, authSignedOut, onAccountChange} from '../../data/authBoundary';
import {supabaseUrl} from '../../data/env';
import {getMode} from '../../data/mode';
import {isPadUuid, PAD_DB_PREFIX, type AuthorizedPadScope} from './padDraftStore';

type PadLocation = {slug: string; code: string};
export type RememberedPad = PadLocation & {ownerId: string; checkpointId: string};
const key = (owner: string, checkpoint: string) => 'lemma.device-pad.v1:' + owner + ':' + checkpoint;
const build = () => document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? null;

/** Compare a previously verified sign-in on this device. Reading this opaque session
 * identifier never logs in the app, refreshes a token or authorizes a server request. */
function deviceSession() {
  if (getMode() !== 'live' || authSignedOut() || !supabaseUrl) return null;
  try {
    const project = new URL(supabaseUrl).hostname.split('.')[0];
    const stored = JSON.parse(localStorage.getItem('sb-' + project + '-auth-token') ?? 'null');
    if (!stored || !isPadUuid(stored.user?.id) || typeof stored.access_token !== 'string') return null;
    const payload = stored.access_token.split('.')[1];
    const claims = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')));
    if (claims.sub !== stored.user.id || !isPadUuid(claims.session_id) || (authOwner() && authOwner() !== claims.sub)) return null;
    return {ownerId: stored.user.id as string, sessionId: claims.session_id as string};
  } catch {return null;}
}

export function subscribeDevicePad(refresh: () => void) {
  const unsubscribe = onAccountChange(refresh);
  window.addEventListener('storage', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  return () => {
    unsubscribe();
    window.removeEventListener('storage', refresh);
    window.removeEventListener('online', refresh);
    window.removeEventListener('offline', refresh);
  };
}

export function devicePadSnapshot() {
  return JSON.stringify([authGeneration(), navigator.onLine, eligibleDeviceSession()]);
}

export function forgetPadRelease(ownerId: string) {
  try {if (isPadUuid(ownerId) && authOwner() === ownerId) localStorage.removeItem(key(ownerId, 'release'));} catch { /* storage unavailable */ }
}

function eligibleDeviceSession() {
  const session = deviceSession(), entry = build();
  if (!session || !entry) return null;
  try {
    const receipt = JSON.parse(localStorage.getItem(key(session.ownerId, 'release')) ?? 'null');
    return receipt?.build === entry && receipt.sessionId === session.sessionId ? session : null;
  } catch {return null;}
}

export function currentPadScope(scope?: AuthorizedPadScope | null): AuthorizedPadScope | null {
  if (getMode() !== 'live' || !scope || !isPadUuid(scope.checkpointId)
      || !isPadUuid(scope.ownerId) || scope.ownerId !== authOwner() || scope.generation !== authGeneration()) return null;
  return scope;
}

function isLocation(value: unknown): value is PadLocation {
  if (!value || typeof value !== 'object') return false;
  const {slug, code} = value as Partial<PadLocation>;
  return typeof slug === 'string' && slug.length > 0 && slug.length <= 180
    && typeof code === 'string' && code.length > 0 && code.length <= 180;
}

/** Called only for an opened checkpoint verified by the authenticated adapter. The
 * device bookmark grants access to this owner's local editor, never to a server operation. */
export function rememberPad(scope: AuthorizedPadScope, location: PadLocation): boolean {
  if (!currentPadScope(scope) || !isLocation(location)) return false;
  const record: RememberedPad = {ownerId: scope.ownerId, checkpointId: scope.checkpointId, slug: location.slug, code: location.code};
  try {
    localStorage.setItem(key(scope.ownerId, scope.checkpointId), JSON.stringify(record));
    localStorage.setItem(key(scope.ownerId, 'last'), scope.checkpointId);
    const session = deviceSession(), entry = build();
    if (!session || session.ownerId !== scope.ownerId || !entry) return false;
    localStorage.setItem(key(scope.ownerId, 'release'), JSON.stringify({build: entry, sessionId: session.sessionId}));
    return true;
  } catch {return false;}
}

export function findRememberedPad(checkpointId?: string): RememberedPad | null {
  const activeOwner = authOwner();
  if (!isPadUuid(activeOwner) || getMode() !== 'live') return null;
  return readOwnerBookmark(activeOwner, checkpointId);
}

export function findEligibleDevicePad(checkpointId?: string) {
  const session = eligibleDeviceSession();
  if (!session) return null;
  const pad = readOwnerBookmark(session.ownerId, checkpointId);
  return pad && {...pad, sessionId: session.sessionId};
}

function readOwnerBookmark(activeOwner: string, checkpointId?: string): RememberedPad | null {
  try {
    const id = checkpointId ?? localStorage.getItem(key(activeOwner, 'last'));
    if (!isPadUuid(id)) return null;
    const raw = localStorage.getItem(key(activeOwner, id));
    if (!raw) return null;
    const pad: RememberedPad = JSON.parse(raw);
    return isLocation(pad) && pad.ownerId === activeOwner && pad.checkpointId === id ? pad : null;
  } catch {return null;}
}

/** Called only after the server confirms that the captured account was deleted. */
export async function removeDeletedOwnerPads(ownerId: string, generation: number): Promise<boolean> {
  if (getMode() !== 'live' || !isPadUuid(ownerId) || authOwner() !== ownerId || authGeneration() !== generation) return false;
  let bookmarksRemoved = true;
  try {
    const prefix = key(ownerId, '');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const item = localStorage.key(i);
      if (item?.startsWith(prefix)) localStorage.removeItem(item);
    }
  } catch {bookmarksRemoved = false;}
  try {
    if (typeof indexedDB !== 'undefined') await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(PAD_DB_PREFIX + ownerId);
      request.onsuccess = () => resolve();
      request.onerror = request.onblocked = () => reject();
    });
    return bookmarksRemoved;
  } catch {return false;}
}
