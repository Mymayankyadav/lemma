import {useLayoutEffect, useRef} from 'react';

/**
 * N150 (bug #1375) the Inbox's keyboard: A or Right approves, R or Left rejects, E edits, Up skips to the end.
 *
 * The listener used to be attached in a `useEffect`, which runs after paint, and re-attached on every change of the
 * top card. Under load a key pressed just after the Inbox opened reached no listener at all, or a listener that had
 * no top card yet, and was dropped ("E sometimes does not open the editor"). Now:
 *  - one listener is attached synchronously at mount (`useLayoutEffect`) and reads the latest state through a ref;
 *  - an E pressed while the stack is still loading is kept, and opens the editor when the first card appears (within
 *    PENDING_MS). A decision (A, R, arrows) is never replayed: nobody approves or rejects a card they have not seen;
 *  - an E pressed on the Inbox route before the Inbox's code has even loaded is kept the same way, by the tiny
 *    listener in inboxEarlyKeys.ts that the app's routes load from the start. It keeps nothing while this hook
 *    listens, so no key is handled twice.
 */
import {inboxKeyAction, inboxListening, takeEarlyKey, typing, type InboxKeyAction} from './inboxEarlyKeys';
export {inboxKeyAction, isInboxRoute, recordEarlyKey, takeEarlyKey, type InboxKeyAction} from './inboxEarlyKeys';
/** How long an E pressed before the stack is ready may wait for its card. */
export const PENDING_MS = 5000;

export function useInboxKeys({enabled, ready, onAction, now = () => performance.now()}: {
  /** The Cards stack is showing and no sheet is open. */
  enabled: boolean;
  /** A top card is on screen. */
  ready: boolean;
  onAction: (action: InboxKeyAction) => void;
  now?: () => number;
}) {
  const latest = useRef({enabled, ready, onAction, now});
  const pending = useRef<{action: InboxKeyAction; at: number} | null>(null);
  // Declared first so it runs before the effects below in every commit: they always see this render's values.
  useLayoutEffect(() => {latest.current = {enabled, ready, onAction, now};});
  useLayoutEffect(() => {
    inboxListening(1);
    // An E pressed after the route's code loaded but before this mounted waits like one pressed while loading.
    const before = takeEarlyKey();
    if (before && latest.current.now() - before.at <= PENDING_MS) pending.current = before;
    const keys = (event: KeyboardEvent) => {
      const state = latest.current;
      if (!state.enabled || typing(event.target)) return;
      const action = inboxKeyAction(event);
      if (!action) return;
      if (state.ready) {event.preventDefault(); state.onAction(action); return;}
      // Not ready: keep only E, the one key that is safe to act on once the card appears.
      if (action === 'edit') {event.preventDefault(); pending.current = {action, at: state.now()};}
    };
    window.addEventListener('keydown', keys);
    return () => {inboxListening(-1); window.removeEventListener('keydown', keys);};
  }, []);
  useLayoutEffect(() => {
    const waiting = pending.current;
    if (!waiting || !ready || !enabled) return;
    pending.current = null;
    if (now() - waiting.at <= PENDING_MS) onAction(waiting.action);
  }, [ready, enabled, onAction, now]);
}
