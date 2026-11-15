import {runNotifyTick,type TickAdapters,type TickSummary} from '../notify/tick-core.ts';
import {ActionTokenError,signActionToken,verifyActionToken} from '../notify/action-token.ts';
import {sendWebPush,type DeliveryRequest,type DeliveryResult} from '../notify/delivery.ts';
import type {RuleResult} from '../notify/rules.ts';
import type {VapidKeys} from '../_shared/webpush.ts';
import type {Sender} from './fcm.ts';
import {noticePlan,type ActionSpec,type Display,type NoticeFacts,type NoticePrefs} from './notice.ts';

/**
 * N164 · the reminder tick and the action route of the `push` function: the existing runNotifyTick with real adapters,
 * delivery over FCM (a phone) or Web Push (a browser, only when the owner has no phone), signed action buttons, and the
 * route a button tap calls. The database, the clock and the transports are injected, so this is unit-tested without a network.
 */
export interface NoticeRow {id: number; kind: string; title: string; body: string; url: string; facts?: {actions?: ActionSpec[]} | null}
export interface WebDevice {id: string; subscription: {endpoint: string; keys: {p256dh: string; auth: string}}; failures: number}
export interface NoticeDb {
  owners(limit: number): Promise<string[]>;
  facts(userId: string, nowIso: string): Promise<NoticeFacts>;
  prefs(userId: string): Promise<NoticePrefs>;
  queue(userId: string, rows: {kind: string; key: string; title: string; body: string; url: string; facts: {actions: ActionSpec[]}}[]): Promise<number>;
  claim(userId: string, limit: number): Promise<NoticeRow[]>;
  record(userId: string, id: number, reason: 'sent' | 'no_device' | 'push_error'): Promise<void>;
  tokens(userId: string): Promise<{id: string; token: string}[]>;
  deleteToken(id: string): Promise<void>;
  webDevices(userId: string): Promise<WebDevice[]>;
  webRecord(userId: string, deviceId: string, result: 'sent' | 'gone' | 'retry' | 'failed'): Promise<void>;
}
export interface NoticeOptions {
  /** At least 32 characters: signs the action buttons (the function's PUSH_SHARED_SECRET). Without it a notice has no buttons. */
  secret?: string;
  /** Web Push needs the owner's VAPID keys; without them an owner with only a browser is not delivered to. */
  vapid?: VapidKeys;
  webPush?: (request: DeliveryRequest) => Promise<DeliveryResult>;
  now?: () => number;
}
const TTL: Record<string, number> = {digest: 86_400, confirm: 600};
const ACTION_LIFE_SECONDS = 47 * 3600;
const tagOf = (kind: string) => kind === 'confirm' ? 'tutor' : kind;

/** The buttons of a notice: a link for `open`, a signed token for everything else; at most two. */
export async function buildActions(userId: string, id: number, specs: readonly ActionSpec[] | undefined, options: NoticeOptions): Promise<{action: string; title: string; url?: string; token?: string}[]> {
  const out: {action: string; title: string; url?: string; token?: string}[] = [];
  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  for (const spec of (specs ?? []).slice(0, 2)) {
    if (spec.action === 'open') {if (spec.url) out.push({action: 'open', title: spec.title, url: spec.url}); continue;}
    if (!options.secret || options.secret.length < 32) continue;
    try {
      const token = await signActionToken({u: userId, n: id, a: spec.action, exp: nowSeconds + ACTION_LIFE_SECONDS, ...(spec.x ? {x: spec.x} : {})}, options.secret, nowSeconds);
      out.push({action: spec.action, title: spec.title, token});
    } catch {/* a button that cannot be signed is left out, never sent unsigned */}
  }
  return out;
}

/** Send one claimed row to the owner's phones (FCM), or, if the owner has none, to their browsers (Web Push). Never both. */
export async function sendRow(db: NoticeDb, sender: Sender, userId: string, row: NoticeRow, options: NoticeOptions = {}): Promise<{ok: boolean; reason?: 'no_device' | 'push_error'}> {
  const actions = await buildActions(userId, row.id, row.facts?.actions, options);
  const tokens = await db.tokens(userId);
  if (tokens.length) {
    const data: Record<string, string> = {type: 'notice', ownerId:userId, id: String(row.id), kind: row.kind, title: row.title, body: row.body, url: row.url, ...(actions.length ? {actions: JSON.stringify(actions)} : {})};
    const results = await Promise.all(tokens.map(async token => ({token, result: await sender.send(token.token, data, {collapseKey: 'notice-' + row.id, ttlSeconds: TTL[row.kind] ?? 21_600})})));
    for (const {token, result} of results) if (result === 'gone') await db.deleteToken(token.id);
    return results.some(item => item.result === 'sent') ? {ok: true} : {ok: false, reason: 'push_error'};
  }
  const devices = await db.webDevices(userId);
  if (!devices.length || !options.vapid) return {ok: false, reason: 'no_device'};
  const send = options.webPush ?? (request => sendWebPush(request));
  const ts = options.now?.() ?? Date.now();
  let delivered = false;
  for (const device of devices.slice(0, 5)) {
    const payload = {v: 1, id: row.id, kind: row.kind, tag: tagOf(row.kind), title: row.title, body: row.body, url: row.url, actions, ts};
    let status: DeliveryResult['status'];
    try {status = (await send({subscription: device.subscription, payload, vapid: options.vapid, kind: row.kind as DeliveryRequest['kind'], tag: tagOf(row.kind), priorFailures: device.failures})).status;}
    catch {status = 'failed';}
    await db.webRecord(userId, device.id, status);
    if (status === 'sent') delivered = true;
  }
  return delivered ? {ok: true} : {ok: false, reason: 'push_error'};
}

export function createNoticeAdapters(db: NoticeDb, sender: Sender, options: NoticeOptions = {}): TickAdapters {
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
        return item ? [{kind: item.kind, key: decision.candidate.key, title: item.title, body: item.body, url: item.url, facts: {actions: item.actions}}] : [];
      });
      return rows.length ? db.queue(userId, rows) : 0;
    },
    async deliver(userId, maxSends, signal) {
      const rows = await db.claim(userId, maxSends);
      let sent = 0, failed = 0;
      for (const row of rows) {
        if (signal.aborted) {await db.record(userId, row.id, 'push_error'); failed++; continue;}
        const outcome = await sendRow(db, sender, userId, row, options);
        if (outcome.ok) {await db.record(userId,row.id,'sent');sent++;}
        else {await db.record(userId, row.id, outcome.reason ?? 'push_error'); failed++;}
      }
      return {attempted: rows.length, sent, failed};
    },
  };
}

export async function runNoticeTick(db: NoticeDb, sender: Sender, now: number, options: NoticeOptions = {}): Promise<TickSummary> {
  return runNotifyTick(createNoticeAdapters(db, sender, {...options, now: () => now}), {now});
}

// ---- the action route ---------------------------------------------------------------------------------------------
export interface ActionDeps {
  secret: string;
  now: () => number;
  /** notify_act through the service role; throws on a refused action. */
  act(userId: string, notificationId: number, action: string, extra: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Called after an approval wrote a confirmation: send it (with Undo) to the owner's phone. Failures are ignored. */
  confirm(userId: string, result: Record<string, unknown>): Promise<void>;
}
/**
 * What a button tap calls. The signed token is the only credential: it names the owner, the notification and the one
 * action, expires in 48 hours, and notify_act uses each notification once.
 */
export async function handleAction(input: unknown, deps: ActionDeps): Promise<{status: number; body: Record<string, unknown>}> {
  if (deps.secret.length < 32) return {status: 503, body: {error: 'not configured'}};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof (input as {token?: unknown}).token !== 'string')
    return {status: 400, body: {error: 'invalid action'}};
  let payload;
  try {payload = await verifyActionToken((input as {token: string}).token, deps.secret, Math.floor(deps.now() / 1000));}
  catch (error) {
    if (error instanceof ActionTokenError) return {status: error.status, body: {error: error.status === 410 ? 'expired' : error.status === 401 ? 'unauthorized' : 'invalid action'}};
    return {status: 400, body: {error: 'invalid action'}};
  }
  let result: Record<string, unknown>;
  try {result = await deps.act(payload.u, payload.n, payload.a, (payload.x ?? {}) as Record<string, unknown>);}
  catch {return {status: 400, body: {error: 'action refused'}};}
  if (result.status === 'done' && typeof result.confirmId === 'number') await deps.confirm(payload.u, result).catch(() => undefined);
  return {status: 200, body: {status: result.status === 'done' ? 'done' : 'already_done'}};
}
