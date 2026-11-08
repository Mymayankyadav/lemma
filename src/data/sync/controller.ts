import type { QueryClient } from '@tanstack/react-query';
import { invalidateOwnerQueries, invalidateResources } from './keys';

export interface OwnerDelta { resource: string; cursor: number; record_id?: string; tombstone?: boolean }
export interface ChangePage { changes: OwnerDelta[]; nextCursor: number; reset: boolean }
export type ReadChanges = (cursor: number) => Promise<ChangePage>;
const NORMAL_DELAY = 12_000;
const MAX_ERROR_DELAY = 60_000;
const PAGE_SIZE = 100;

/** One account-scoped, disposable cursor. Never persist it across sign-out. */
export class OwnerChangePoller {
  private cursor = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private inFlight = false;
  private urgent = false;
  private errors = 0;
  private resetSeen = false;

  constructor(private readonly client: QueryClient, private readonly read: ReadChanges) {}

  private readonly onWake = () => {
    if (this.stopped) return;
    this.cancelTimer();
    if (document.visibilityState === 'visible') void this.pollNow();
  };
  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private schedule(delay: number) {
    this.cancelTimer();
    if (this.stopped || document.visibilityState !== 'visible') return;
    this.timer = setTimeout(() => { this.timer = null; void this.pollNow(); }, delay);
  }

  start(): Promise<void> {
    if (!this.stopped) return Promise.resolve();
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onWake);
    window.addEventListener('focus', this.onWake);
    window.addEventListener('online', this.onWake);
    return this.pollNow();
  }
  stop(): void {
    this.stopped = true;
    this.cancelTimer();
    document.removeEventListener('visibilitychange', this.onWake);
    window.removeEventListener('focus', this.onWake);
    window.removeEventListener('online', this.onWake);
    this.cursor = 0;
    this.resetSeen = false;
    this.urgent = false;
    this.errors = 0;
  }

  /** Public for deterministic tests; focus and network events call it too. */
  async pollNow(): Promise<void> {
    if (this.stopped || document.visibilityState !== 'visible') return;
    if (this.inFlight) { this.urgent = true; return; }
    this.cancelTimer();
    this.inFlight = true;
    let drain = false;
    try {
      const page = await this.read(this.cursor);
      if (this.stopped) return;
      if (!page || !Array.isArray(page.changes) ||
          !Number.isSafeInteger(page.nextCursor) || page.nextCursor < this.cursor ||
          typeof page.reset !== 'boolean' ||
          page.changes.some(change => typeof change.resource !== 'string')) {
        throw new Error('Malformed changes_since response');
      }
      if (page.reset) {
        if (!this.resetSeen) await invalidateOwnerQueries(this.client);
        this.resetSeen = true;
      } else {
        this.resetSeen = false;
        await invalidateResources(this.client, page.changes.map(change => change.resource));
      }
      if (this.stopped) return;
      drain = page.changes.length >= PAGE_SIZE && page.nextCursor > this.cursor;
      this.cursor = page.nextCursor;
      this.errors = 0;
    } catch {
      // The owner is still allowed to read through ordinary queries. Retry
      // with bounded exponential backoff; focus/reconnect bypass the delay.
      if (!this.stopped) this.errors = Math.min(this.errors + 1, 4);
    } finally {
      this.inFlight = false;
      if (!this.stopped) {
        const immediate = this.urgent || drain;
        this.urgent = false;
        this.schedule(immediate ? 0 : this.errors
          ? Math.min(MAX_ERROR_DELAY, NORMAL_DELAY * 2 ** this.errors)
          : NORMAL_DELAY);
      }
    }
  }
}
