import {readFileSync} from 'node:fs';
import {useLayoutEffect} from 'react';
import {flushSync} from 'react-dom';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PENDING_MS, inboxKeyAction, isInboxRoute, recordEarlyKey, takeEarlyKey, useInboxKeys, type InboxKeyAction} from '../../../src/features/proposals/v7/useInboxKeys';

// N150 · bug #1375: an Inbox key pressed just after the Inbox opens was lost, because the listener was attached after
// paint (useEffect) and ignored keys until the first card loaded.
let host: HTMLDivElement, root: Root, clock = 0;
const actions: InboxKeyAction[] = [];
function Keys({enabled = true, ready}: {enabled?: boolean; ready: boolean}) {
  useInboxKeys({enabled, ready, onAction: action => actions.push(action), now: () => clock});
  return <input aria-label="field"/>;
}
// flushSync commits synchronously (layout effects included) but leaves passive effects for later: exactly the window
// in which the old listener did not exist yet. No act(): act would flush the passive effects and hide the bug.
const render = (ready: boolean, enabled = true) => flushSync(() => root.render(<Keys ready={ready} enabled={enabled}/>));
const press = (key: string, target: EventTarget = window, extra: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...extra}));

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: false});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  actions.length = 0; clock = 0;
});
afterEach(() => {flushSync(() => root.unmount()); host.remove(); vi.restoreAllMocks();});

describe('N150 Inbox keys', () => {
  it('maps the keys, and ignores them with a modifier', () => {
    expect(['a', 'A', 'ArrowRight', 'r', 'ArrowLeft', 'e', 'E', 'ArrowUp', 'x'].map(key => inboxKeyAction({key, ctrlKey: false, metaKey: false, altKey: false})))
      .toEqual(['approve', 'approve', 'approve', 'reject', 'reject', 'edit', 'edit', 'skip', null]);
    expect(inboxKeyAction({key: 'a', ctrlKey: true, metaKey: false, altKey: false})).toBeNull();
  });
  it('listens from the first commit: a key pressed before passive effects run is handled', () => {
    // A sibling presses E in its layout effect: the commit is done but no passive effect (useEffect) has run yet, the
    // window in which the old listener did not exist.
    function PressDuringCommit() {useLayoutEffect(() => {press('e');}, []); return null;}
    flushSync(() => root.render(<><Keys ready/><PressDuringCommit/></>));
    expect(actions).toEqual(['edit']);
  });
  it('keeps an E pressed while the stack loads and opens the editor when the first card appears', () => {
    render(false);
    press('e');
    expect(actions).toEqual([]);
    clock = 400;
    render(true);
    expect(actions).toEqual(['edit']);
    render(true);
    expect(actions).toEqual(['edit']);
  });
  it('never replays a decision on a card the learner has not seen', () => {
    render(false);
    for (const key of ['a', 'r', 'ArrowRight', 'ArrowLeft', 'ArrowUp']) press(key);
    render(true);
    expect(actions).toEqual([]);
  });
  it('forgets a waiting E after PENDING_MS', () => {
    render(false);
    press('e');
    clock = PENDING_MS + 1;
    render(true);
    expect(actions).toEqual([]);
  });
  it('ignores keys typed in a field, keys with a modifier, and keys while a sheet is open', () => {
    render(true);
    press('a', host.querySelector('input')!);
    press('a', window, {ctrlKey: true});
    render(true, false);
    press('a');
    expect(actions).toEqual([]);
    render(true, true);
    press('a');
    expect(actions).toEqual(['approve']);
  });
  it('prevents the browser default only for keys it acts on or keeps', () => {
    render(false);
    const kept = new KeyboardEvent('keydown', {key: 'e', bubbles: true, cancelable: true});
    const dropped = new KeyboardEvent('keydown', {key: 'a', bubbles: true, cancelable: true});
    window.dispatchEvent(kept); window.dispatchEvent(dropped);
    expect(kept.defaultPrevented).toBe(true);
    expect(dropped.defaultPrevented).toBe(false);
  });
  it('keeps an E pressed on the Inbox route before the Inbox mounted, and applies it once the card shows', () => {
    takeEarlyKey();
    const e = new KeyboardEvent('keydown', {key: 'e'});
    recordEarlyKey(e, '#/proposals', 0);
    render(false);
    expect(actions).toEqual([]);
    clock = 900;
    render(true);
    expect(actions).toEqual(['edit']);
    expect(takeEarlyKey()).toBeNull();
  });
  it('records an early key only for E, only on the Inbox route, and only while no Inbox is listening', () => {
    takeEarlyKey();
    recordEarlyKey(new KeyboardEvent('keydown', {key: 'a'}), '#/proposals', 0);
    recordEarlyKey(new KeyboardEvent('keydown', {key: 'e'}), '#/review', 0);
    recordEarlyKey(new KeyboardEvent('keydown', {key: 'e'}), '#/proposals/p-1', 0);
    expect(takeEarlyKey()).toBeNull();
    render(true);
    recordEarlyKey(new KeyboardEvent('keydown', {key: 'e'}), '#/proposals', 0);
    expect(takeEarlyKey()).toBeNull();
    expect(['#/proposals', '#/proposals?tab=plan', '#/proposals?view=list'].every(isInboxRoute)).toBe(true);
  });
  it('drops an early E that waited longer than PENDING_MS', () => {
    takeEarlyKey();
    recordEarlyKey(new KeyboardEvent('keydown', {key: 'e'}), '#/proposals', 0);
    clock = PENDING_MS + 50;
    render(false);
    render(true);
    expect(actions).toEqual([]);
  });
  it('the Inbox uses it and no longer attaches its own keydown listener after paint', () => {
    const source = readFileSync('src/features/proposals/v7/InboxV7.tsx', 'utf8');
    expect(source).toContain('useInboxKeys({');
    expect(source).not.toMatch(/addEventListener\('keydown'/);
  });
});
