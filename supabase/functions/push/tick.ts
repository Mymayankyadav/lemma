import {runNotifyTick,type TickAdapters,type TickSummary} from '../notify/tick-core.ts';
import type {RuleResult} from '../notify/rules.ts';
import type {Sender} from './fcm.ts';
import {noticePlan,type Display,type NoticeFacts,type NoticePrefs} from './notice.ts';

/**
 * N164.1 · the reminder tick for the `push` function: the existing runNotifyTick with real adapters. The database,
 * the clock and the FCM sender are injected, so this is unit-tested without a network.
 */
export interface NoticeRow {id: number; kind: string; title: string; body: string; url: string}
export interface NoticeDb {
  owners(limit: number): Promise<string[]>;
  facts(userId: string, nowIso: string): Promise<NoticeFacts>;
  prefs(userId: string): Promise<NoticePrefs>;
  queue(userId: string, rows: {kind: string; key: string; title: string; body: string; url: string}[]): Promise<number>;
  claim(userId: string, limit: number): Promise<NoticeRow[]>;
  record(userId: string, id: number, reason: 'no_device' | 'push_error'): Promise<void>;
  tokens(userId: string): Promise<{id: string; token: string}[]>;
  deleteToken(id: string): Promise<void>;
}
const TTL: Record<string, number> = {digest: 86_400, confirm: 600};

export function createNoticeAdapters(db: NoticeDb, sender: Sender): TickAdapters {
  // What each owner's candidates would say, kept between load and queue of the same tick.
  const display = new Map<string, Map<string, Display>>();
  return {
    listEnabledOwners: () => db.owners(200),
    async load(userId, now) {
      const [facts, prefs] = await Promise.all([db.facts(userId, new Date(now).toISOString()), db.prefs(userId)]);
      const plan = noticePlan(facts, prefs, now);
      display.set(userId, plan.display);
      return {candidates: plan.candidates, context: plan.context};
    },
    async queue(userId, decisions: readonly RuleResult[]) {
      const shown = display.get(userId) ?? new Map<string, Display>();
      // Only a decision to send is queued: a skipped or deferred key must stay free for a later tick.
      const rows = decisions.filter(decision => decision.status === 'send').flatMap(decision => {
        const item = shown.get(decision.candidate.key);
        return item ? [{kind: item.kind, key: decision.candidate.key, title: item.title, body: item.body, url: item.url}] : [];
      });
      return rows.length ? db.queue(userId, rows) : 0;
    },
    async deliver(userId, maxSends, signal) {
      const rows = await db.claim(userId, maxSends);
      let sent = 0, failed = 0;
      for (const row of rows) {
        if (signal.aborted) {await db.record(userId, row.id, 'push_error'); failed++; continue;}
        const tokens = await db.tokens(userId);
        if (!tokens.length) {await db.record(userId, row.id, 'no_device'); failed++; continue;}
        const data = {type: 'notice', id: String(row.id), kind: row.kind, title: row.title, body: row.body, url: row.url};
        const results = await Promise.all(tokens.map(async token => ({token, result: await sender.send(token.token, data, {collapseKey: 'notice-' + row.id, ttlSeconds: TTL[row.kind] ?? 21_600})})));
        for (const {token, result} of results) if (result === 'gone') await db.deleteToken(token.id);
        if (results.some(item => item.result === 'sent')) sent++;
        else {await db.record(userId, row.id, 'push_error'); failed++;}
      }
      return {attempted: rows.length, sent, failed};
    },
  };
}

export async function runNoticeTick(db: NoticeDb, sender: Sender, now: number): Promise<TickSummary> {
  return runNotifyTick(createNoticeAdapters(db, sender), {now});
}
