import type {LemmaNativePlugin, NativeSession} from './bridge';

export interface NativeSessionTarget {
  ownerId: string | null;
  generation: number;
  session: NativeSession | null;
}

/** Native cleanup can fail (for example while revoking an exported file). Keep
 * it ordered with setup, and never advertise a session before native accepts it. */
export function createNativeSessionSync(native: Pick<LemmaNativePlugin,
  'setSession' | 'clearSession' | 'timerClear' | 'remindersSet' | 'shortcutsSet' | 'calendarRemoveAll'>, options: {
  isCurrent: (target: NativeSessionTarget) => boolean;
  onReady: (target: NativeSessionTarget) => void;
  onFailure: (target: NativeSessionTarget, retry: () => void) => void;
}) {
  let desired: NativeSessionTarget | null = null, completed: NativeSessionTarget | null = null;
  const pending: {target: NativeSessionTarget; attempt: number}[] = [];
  let running = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanupVersion = 0, clearedVersion = 0;
  const delays = [1000, 3000];
  const current = (target: NativeSessionTarget) => desired === target && options.isCurrent(target);
  function cancelRetry() {if (retryTimer !== undefined) clearTimeout(retryTimer); retryTimer = undefined;}
  function invoke(operation: () => Promise<unknown>): Promise<unknown> {
    try {return operation();} catch (error) {return Promise.reject(error);}
  }

  async function clear() {
    // Start the visible sign-out clears immediately. Await every result before
    // another account's setup: calendarRemoveAll runs on a native background job.
    // Attempt all surfaces even if revoking an exported file rejects.
    const results = await Promise.allSettled([
      invoke(() => native.clearSession()),
      invoke(() => native.timerClear()),
      invoke(() => native.remindersSet({items: []})),
      invoke(() => native.shortcutsSet({items: []})),
      invoke(() => native.calendarRemoveAll()),
    ]);
    if (results.some(result => result.status === 'rejected')) throw new Error('Native account cleanup failed');
  }

  function enqueue(target: NativeSessionTarget, attempt = 0) {
    pending.push({target, attempt}); next();
  }

  function next() {
    if (running || pending.length === 0) return;
    const {target, attempt} = pending.shift()!;
    running = true;
    // An idle queue starts synchronously, preserving immediate sign-out scrubs.
    void apply(target, attempt).catch(() => {/* Reporting cannot reject the work queue. */}).then(() => {
      running = false; next();
    });
  }

  async function apply(target: NativeSessionTarget, attempt: number) {
    if (!current(target) || completed === target) return;
    const cleanup = cleanupVersion;
    try {
      if (!target.session || clearedVersion < cleanup) {
        await clear();
        clearedVersion = cleanup;
      }
      if (!current(target)) return;
      if (target.session) await native.setSession(target.session);
    } catch {
      if (!current(target)) return;
      if (attempt < delays.length) {
        retryTimer = setTimeout(() => {retryTimer = undefined; enqueue(target, attempt + 1);}, delays[attempt]);
      } else options.onFailure(target, () => {if (current(target)) retry();});
      return;
    }
    if (!current(target)) return;
    cancelRetry(); completed = target; options.onReady(target);
  }

  function retry() {
    if (!desired || completed === desired || !current(desired)) return;
    cancelRetry(); enqueue(desired);
  }

  return {
    update(target: NativeSessionTarget) {
      // Do not coalesce away sign-out cleanup if the same owner signs in again
      // before the queued clear starts. A new generation still revokes old grants.
      if (!target.session || (desired && (desired.ownerId !== target.ownerId || desired.generation !== target.generation))) cleanupVersion++;
      desired = target; completed = null; cancelRetry(); enqueue(target);
    },
    ready: (): NativeSessionTarget | null => completed?.session && current(completed) ? completed : null,
    retry,
  };
}
