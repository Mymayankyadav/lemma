import {timerPush,type EntryRow,type IntervalRow} from '../_shared/timerState.ts';
import type {Sender} from './fcm.ts';

/**
 * N163 · drains the push outbox: for each claimed change of a study entry, read the entry as it is now, build the phone's
 * timer state and send it to every device the owner registered. The database, the clock and the FCM sender are injected,
 * so this is unit-tested without a network.
 */
export interface OutboxRow {id: number; user_id: string; entry_id: string | null; entry_version: number | null; attempts: number}
export interface PushDb {
  claim(limit: number): Promise<OutboxRow[]>;
  entry(userId: string, id: string): Promise<EntryRow | null>;
  intervals(userId: string, id: string): Promise<IntervalRow[]>;
  context(userId: string, projectId: string | null): Promise<{title: string; clock24h: boolean}>;
  tokens(userId: string): Promise<{id: string; token: string}[]>;
  deleteToken(id: string): Promise<void>;
  finish(ids: number[], status: 'sent' | 'failed' | 'skipped'): Promise<void>;
}
export const MAX_ATTEMPTS = 3;
const BATCH = 20;

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function handlePush(request: {method: string; secret: string | null}, deps: {db: PushDb; sender: Sender; secret: string; now: () => number}): Promise<{status: number; body: Record<string, unknown>}> {
  if (request.method !== 'POST') return {status: 405, body: {error: 'POST only'}};
  // The database calls this with a shared secret; a short or missing secret means the function is not set up.
  if (deps.secret.length < 32) return {status: 503, body: {error: 'not configured'}};
  if (!request.secret || !safeEqual(request.secret, deps.secret)) return {status: 401, body: {error: 'unauthorized'}};
  const rows = await deps.db.claim(BATCH);
  const groups = new Map<string, OutboxRow[]>();
  for (const row of rows) {
    const key = row.user_id + '|' + (row.entry_id ?? '');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const counts = {sent: 0, skipped: 0, failed: 0, retry: 0};
  for (const group of groups.values()) {
    const ids = group.map(row => row.id), {user_id: userId, entry_id: entryId} = group[0];
    const lastVersion = Math.max(...group.map(row => row.entry_version ?? 0));
    try {
      if (!entryId) {await deps.db.finish(ids, 'skipped'); counts.skipped += ids.length; continue;}
      const tokens = await deps.db.tokens(userId);
      if (!tokens.length) {await deps.db.finish(ids, 'skipped'); counts.skipped += ids.length; continue;}
      // The entry as it is now, so several quick changes send one message and a late retry is never stale.
      const entry = await deps.db.entry(userId, entryId);
      const message = entry
        ? timerPush(entry, await deps.db.intervals(userId, entryId), deps.now(), ...await deps.db.context(userId, entry.project_id).then(c => [c.title, c.clock24h] as [string, boolean]))
        : {op: 'clear' as const, entryId, version: lastVersion};
      const data: Record<string, string> = message.op === 'show'
        ? {type: 'timer', op: 'show', entryId, version: String(message.state.version), state: JSON.stringify(message.state)}
        : {type: 'timer', op: 'clear', entryId, version: String(message.version)};
      const results = await Promise.all(tokens.map(async token => ({token, result: await deps.sender.send(token.token, data, {collapseKey: 'timer', ttlSeconds: 60})})));
      for (const {token, result} of results) if (result === 'gone') await deps.db.deleteToken(token.id);
      if (results.some(item => item.result === 'sent')) {await deps.db.finish(ids, 'sent'); counts.sent += ids.length;}
      else if (results.some(item => item.result === 'retry') && Math.max(...group.map(row => row.attempts)) < MAX_ATTEMPTS) counts.retry += ids.length;
      else {await deps.db.finish(ids, 'failed'); counts.failed += ids.length;}
    } catch {
      if (Math.max(...group.map(row => row.attempts)) >= MAX_ATTEMPTS) {await deps.db.finish(ids, 'failed').catch(() => {}); counts.failed += ids.length;}
      else counts.retry += ids.length;
    }
  }
  return {status: 200, body: counts};
}
