import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {createNativeSessionSync, type NativeSessionTarget} from '../../../src/platform/session';
import type {NativeSession} from '../../../src/platform/bridge';

function target(ownerId: string | null, generation: number, token = 'fixture-token'): NativeSessionTarget {
  return {ownerId, generation, session: ownerId ? {
    ownerId, accessToken: token, url: 'https://fixture.supabase.co', key: 'fixture-public', expiresAt: 1000,
  } : null};
}
function fixture() {
  let scope = target('a', 1);
  const native = {setSession: vi.fn(async (_session: NativeSession) => {}), clearSession: vi.fn(async () => {}),
    timerClear: vi.fn(async () => {}), remindersSet: vi.fn(async () => ({scheduled: 0})),
    shortcutsSet: vi.fn(async () => {}), calendarRemoveAll: vi.fn(async () => ({deleted: 0}))};
  const ready = vi.fn(), failure = vi.fn();
  const sync = createNativeSessionSync(native, {
    isCurrent: value => value.ownerId === scope.ownerId && value.generation === scope.generation,
    onReady: ready, onFailure: failure,
  });
  return {native, ready, failure, sync,
    update: (value: NativeSessionTarget) => {scope = value; sync.update(value);},
    changeBoundary: (value: NativeSessionTarget) => {scope = value;},
  };
}
const drain = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => vi.useFakeTimers());
afterEach(() => {vi.clearAllTimers(); vi.useRealTimers();});

test('a cleanup rejection never publishes readiness; bounded retries and the current Retry action recover', async () => {
  const f = fixture(), session = target('a', 1);
  f.native.setSession.mockRejectedValue(new Error('Could not revoke export'));
  f.update(session); await drain();
  expect(f.sync.ready()).toBeNull(); expect(f.ready).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4000);
  expect(f.native.setSession).toHaveBeenCalledTimes(3);
  expect(f.ready).not.toHaveBeenCalled(); expect(f.failure).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.native.setSession).toHaveBeenCalledTimes(3);
  f.native.setSession.mockResolvedValue(undefined);
  f.failure.mock.calls[0][1](); await drain();
  expect(f.sync.ready()).toBe(session); expect(f.ready).toHaveBeenCalledWith(session);
});

test('a pending old setup completes before the current owner is installed and cannot publish readiness', async () => {
  const f = fixture(), first = target('a', 1), second = target('b', 2);
  let finish!: () => void;
  f.native.setSession.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
  f.update(first); await drain(); f.update(second); await drain();
  expect(f.native.setSession).toHaveBeenCalledTimes(1);
  expect(f.native.clearSession).not.toHaveBeenCalled();
  finish(); await drain();
  expect(f.native.clearSession).toHaveBeenCalledTimes(1);
  expect(f.native.setSession.mock.calls.map(call => call[0])).toEqual([first.session, second.session]);
  expect(f.ready.mock.calls.map(call => call[0])).toEqual([second]);
  expect(f.sync.ready()).toBe(second);
});

test('a token refresh supersedes an in-flight setup, then recovers its own transient native rejection', async () => {
  const f = fixture(), first = target('a', 1), refreshed = target('a', 1, 'refreshed-token');
  let finish!: () => void;
  f.native.setSession.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}))
    .mockRejectedValueOnce(new Error('Export cleanup temporarily busy'));
  f.update(first); await drain(); f.update(refreshed); await drain();
  expect(f.native.setSession).toHaveBeenCalledTimes(1);
  finish(); await drain();
  expect(f.sync.ready()).toBeNull(); expect(f.ready).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.native.setSession.mock.calls.map(call => call[0])).toEqual([first.session, refreshed.session, refreshed.session]);
  expect(f.native.clearSession).not.toHaveBeenCalled();
  expect(f.failure).not.toHaveBeenCalled(); expect(f.ready).toHaveBeenCalledExactlyOnceWith(refreshed);
  expect(f.sync.ready()).toBe(refreshed);
});

test('owner changes cancel stale retry timers, including an old failure’s Retry button', async () => {
  const f = fixture();
  f.native.setSession.mockRejectedValue(new Error('Busy export'));
  f.update(target('a', 1)); await drain(); await vi.advanceTimersByTimeAsync(4000);
  const retryOld = f.failure.mock.calls[0][1];
  f.native.setSession.mockResolvedValue(undefined);
  const second = target('b', 2); f.update(second); await drain();
  retryOld(); await vi.advanceTimersByTimeAsync(10_000);
  expect(f.native.setSession).toHaveBeenCalledTimes(4);
  expect(f.sync.ready()).toBe(second);
  f.native.setSession.mockRejectedValueOnce(new Error('Busy again'));
  f.update(target('b', 2, 'refreshed')); await drain();
  f.update(target('c', 3)); await drain(); await vi.advanceTimersByTimeAsync(10_000);
  expect(f.native.setSession).toHaveBeenCalledTimes(6);
  expect(f.sync.ready()?.ownerId).toBe('c');
});

test('sign-out cleanup attempts shortcuts even if export cleanup fails and recovers on resume', async () => {
  const f = fixture();
  f.update(target('a', 1)); await drain();
  f.native.clearSession.mockRejectedValue(new Error('Could not revoke export'));
  const signedOut = target(null, 2); f.update(signedOut); await drain(); await vi.advanceTimersByTimeAsync(4000);
  expect(f.sync.ready()).toBeNull();
  expect(f.native.clearSession).toHaveBeenCalledTimes(3);
  expect(f.native.shortcutsSet).toHaveBeenCalledTimes(3);
  expect(f.ready).toHaveBeenCalledTimes(1);
  f.native.clearSession.mockResolvedValue(undefined); f.sync.retry(); await drain();
  expect(f.ready).toHaveBeenLastCalledWith(signedOut);
  expect(f.sync.ready()).toBeNull();
  f.sync.retry(); await drain(); expect(f.native.clearSession).toHaveBeenCalledTimes(4);
});

test('a rapid sign-out and same-owner sign-in still clears old grants before installing the new session', async () => {
  const f = fixture();
  f.update(target('a', 1)); await drain();
  const next = target('a', 3, 'new-sign-in');
  f.native.clearSession.mockRejectedValueOnce(new Error('Export busy')).mockRejectedValueOnce(new Error('Export still busy'));
  f.update(target(null, 2)); f.update(next); await drain();
  expect(f.native.setSession).toHaveBeenCalledTimes(1);
  expect(f.sync.ready()).toBeNull();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.native.clearSession).toHaveBeenCalledTimes(3);
  expect(f.native.setSession).toHaveBeenLastCalledWith(next.session);
  expect(f.sync.ready()).toBe(next);
});

test('a generation change invalidates readiness immediately; ordinary token refresh keeps the native account', async () => {
  const f = fixture();
  f.update(target('a', 1)); await drain();
  f.update(target('a', 1, 'refresh')); await drain();
  expect(f.native.clearSession).not.toHaveBeenCalled();
  expect(f.sync.ready()?.session?.accessToken).toBe('refresh');
  f.changeBoundary(target('a', 3, 'new-session'));
  expect(f.sync.ready()).toBeNull();
  f.sync.retry(); await drain();
  expect(f.native.setSession).toHaveBeenCalledTimes(2);
});

test('sign-out scrubs visible surfaces immediately and waits for background calendar cleanup before another owner', async () => {
  const f = fixture();
  f.update(target('a', 1)); await drain();
  let finish!: () => void;
  f.native.calendarRemoveAll.mockImplementationOnce(() => new Promise(resolve => {finish = () => resolve({deleted: 1});}));
  f.update(target(null, 2));
  expect(f.native.timerClear).toHaveBeenCalledTimes(1);
  expect(f.native.calendarRemoveAll).toHaveBeenCalledTimes(1);
  const second = target('b', 3); f.update(second); await drain();
  expect(f.native.setSession).toHaveBeenCalledTimes(1); expect(f.sync.ready()).toBeNull();
  finish(); await drain();
  expect(f.native.setSession).toHaveBeenLastCalledWith(second.session);
  expect(f.sync.ready()).toBe(second);
});
