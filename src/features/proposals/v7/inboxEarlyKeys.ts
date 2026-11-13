/**
 * N150 (bug #1375) the Inbox's keys before the Inbox exists. On a slow device the Inbox's code is requested only after
 * the app's first code has run, so an E pressed the moment the Inbox route opens can arrive before any Inbox code is in
 * the page. This module is tiny, has no dependencies and is imported by the app's routes (src/app/routes.tsx), so its
 * listener exists from the start. It keeps only an E pressed on the Inbox route while no Inbox is listening; the Inbox
 * takes it when it mounts (useInboxKeys) and opens the editor once its first card shows. Decisions are never kept.
 */
export type InboxKeyAction = 'approve' | 'reject' | 'edit' | 'skip';

/** The action a key stands for in the Inbox stack, or null. Pure. */
export function inboxKeyAction(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): InboxKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'a' || event.key === 'ArrowRight') return 'approve';
  if (key === 'r' || event.key === 'ArrowLeft') return 'reject';
  if (key === 'e') return 'edit';
  if (event.key === 'ArrowUp') return 'skip';
  return null;
}
/** Typing in a field or a sheet never decides a card. */
export const typing = (target: EventTarget | null) =>
  typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable],dialog');
/** The Inbox's own route (the stack and its tabs), not a proposal's detail page. */
export const isInboxRoute = (hash: string) => /^#\/proposals(?:[?]|$)/.test(hash);

let listening = 0, early: {action: InboxKeyAction; at: number} | null = null;
/** An Inbox started or stopped listening for keys itself (while one listens, nothing is kept here). */
export const inboxListening = (delta: 1 | -1) => {listening = Math.max(0, listening + delta);};
/** Keep an E pressed on the Inbox route while no Inbox is listening. Exported for tests. */
export function recordEarlyKey(event: KeyboardEvent, hash = location.hash, at = performance.now()) {
  if (listening > 0 || !isInboxRoute(hash) || typing(event.target) || inboxKeyAction(event) !== 'edit') return;
  early = {action: 'edit', at};
}
/** Take the kept key, if any; it is used once. */
export function takeEarlyKey(): {action: InboxKeyAction; at: number} | null {const key = early; early = null; return key;}
if (typeof window !== 'undefined') window.addEventListener('keydown', event => recordEarlyKey(event), true);
