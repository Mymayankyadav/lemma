// N163: sends the phone's notifications over Firebase Cloud Messaging. Called by the database (pg_net) and by pg_cron
// with the shared secret in `x-push-secret`; deployed with the gateway's JWT check off because that header is the check.
// Function secrets (set by the Owner in the Supabase dashboard, never in the repo): FCM_SERVICE_ACCOUNT (the Firebase
// service-account JSON) and PUSH_SHARED_SECRET (at least 32 characters, the same value as the vault secret
// `push_shared_secret` that the database sends).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createSender,parseServiceAccount,type Fetch} from './fcm.ts';
import {checkCaller,handlePush,type OutboxRow,type PushDb} from './handler.ts';
import {handleAction,runNoticeTick,sendRow,type NoticeDb,type NoticeOptions,type NoticeRow,type WebDevice} from './tick.ts';
import type {NoticeFacts,NoticePrefs} from './notice.ts';

function database(): PushDb {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  const ok = <T>(result: {data: T | null; error: {message: string} | null}): T | null => {if (result.error) throw new Error(result.error.message); return result.data;};
  return {
    claim: async limit => (ok(await admin.rpc('push_claim', {p_limit: limit})) ?? []) as OutboxRow[],
    entry: async (userId, id) => ok(await admin.from('study_entries').select('created_at,id,version,status,intent,mode,phase,cycle,config,phase_ends_at,project_id,excluded_intervals').eq('user_id', userId).eq('id', id).maybeSingle()),
    intervals: async (userId, id) => ok(await admin.from('study_intervals').select('kind,started_at,ended_at').eq('user_id', userId).eq('entry_id', id).order('started_at', {ascending: true})) ?? [],
    context: async (userId, projectId) => {
      const project = projectId ? ok(await admin.from('projects').select('title').eq('user_id', userId).eq('id', projectId).maybeSingle()) : null;
      const settings = ok(await admin.from('settings').select('clock_24h').eq('user_id', userId).maybeSingle());
      return {title: (project as {title?: string} | null)?.title ?? '', clock24h: (settings as {clock_24h?: boolean} | null)?.clock_24h ?? true};
    },
    tokens: async userId => ok(await admin.from('device_push_tokens').select('id,token').eq('user_id', userId)) ?? [],
    deleteToken: async id => {ok(await admin.from('device_push_tokens').delete().eq('id', id));},
    finish: async (ids, status) => {
      const patch = status === 'failed' ? {failed_at: new Date().toISOString()} : {sent_at: new Date().toISOString(), note: status};
      ok(await admin.from('push_outbox').update(patch).in('id', ids));
    },
  };
}

function noticeDatabase(): NoticeDb {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  const ok = <T>(result: {data: T | null; error: {message: string} | null}): T | null => {if (result.error) throw new Error(result.error.message); return result.data;};
  return {
    owners: async limit => (ok(await admin.rpc('notify_enabled_owners', {p_limit: limit})) ?? []) as string[],
    facts: async (userId, nowIso) => {
      const [facts,holds]=await Promise.all([admin.rpc('notify_candidates',{p_user:userId,p_now:nowIso}),admin.from('notify_holds').select('scope,until').eq('user_id',userId).gt('until',nowIso)]);
      return {...(ok(facts)??{}),holds:Object.fromEntries((ok(holds)??[]).map((hold:{scope:string;until:string})=>[hold.scope,hold.until]))} as NoticeFacts;
    },
    prefs: async userId => ((ok(await admin.from('settings').select('notify').eq('user_id', userId).maybeSingle()) as {notify?: Record<string, unknown>} | null)?.notify ?? {}) as NoticePrefs,
    queue: async (userId, rows) => (ok(await admin.rpc('notify_queue', {p_user: userId, p_rows: rows})) ?? 0) as number,
    claim: async (userId, limit) => (ok(await admin.rpc('notify_claim', {p_user: userId, p_limit: limit})) ?? []) as NoticeRow[],
    record: async (userId, id, reason) => {ok(await admin.rpc('notify_record', {p_user: userId, p_id: id, p_reason: reason}));},
    tokens: async userId => ok(await admin.from('device_push_tokens').select('id,token').eq('user_id', userId)) ?? [],
    deleteToken: async id => {ok(await admin.from('device_push_tokens').delete().eq('id', id));},
    webDevices: async userId => ((ok(await admin.from('push_devices').select('id,endpoint,p256dh,auth,failures').eq('user_id', userId).is('disabled_at', null).limit(5)) ?? []) as {id: string; endpoint: string; p256dh: string; auth: string; failures: number}[])
      .map((row): WebDevice => ({id: row.id, subscription: {endpoint: row.endpoint, keys: {p256dh: row.p256dh, auth: row.auth}}, failures: row.failures})),
    webRecord: async (userId, deviceId, result) => {ok(await admin.rpc('notify_web_record', {p_user: userId, p_device: deviceId, p_result: result}));},
  };
}

/** The shared secret signs and checks the action buttons; the VAPID keys (optional) enable Web Push for owners with no phone. */
function noticeOptions(): NoticeOptions {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'), privateKey = Deno.env.get('VAPID_PRIVATE_KEY'), subject = Deno.env.get('VAPID_SUBJECT');
  return {secret: Deno.env.get('PUSH_SHARED_SECRET') ?? '', ...(publicKey && privateKey && subject ? {vapid: {publicKey, privateKey, subject}} : {})};
}

Deno.serve(async request => {
  try {
    // {"act":{"token"}} is a notification button tap: the signed token is the credential (no shared secret, no JWT).
    // {"tick":true} runs the reminder tick (pg_cron, every five minutes); anything else drains the timer outbox.
    const body = request.method === 'POST' ? await request.clone().json().catch(() => ({})) as {tick?: unknown; act?: unknown} : {};
    if (body.act !== undefined) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
      const options = noticeOptions();
      const result = await handleAction(body.act, {
        secret: options.secret ?? '', now: Date.now,
        act: async (userId, id, action, extra) => {
          const {data, error} = await admin.rpc('notify_act', {p_user: userId, p_notification: id, p_action: action, p_extra: extra});
          if (error) throw new Error(error.message);
          return (data ?? {}) as Record<string, unknown>;
        },
        confirm: async (userId, outcome) => {
          const {data} = await admin.from('notifications').select('id,kind,title,body,url,facts').eq('user_id', userId).eq('id', outcome.confirmId as number).maybeSingle();
          const row = data as (NoticeRow & {facts?: {action?: number}}) | null;
          if (!row || typeof row.facts?.action !== 'number') return;
          const sender = createSender(parseServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT')), fetch as unknown as Fetch);
          await sendRow(noticeDatabase(), sender, userId, {...row, facts: {actions: [{action: 'undo', title: 'Undo', x: {action: row.facts.action}}]}}, options);
        },
      });
      return Response.json(result.body, {status: result.status});
    }
    if (body.tick === true) {
      const secret = Deno.env.get('PUSH_SHARED_SECRET') ?? '';
      const refused = checkCaller({method: request.method, secret: request.headers.get('x-push-secret')}, secret);
      if (refused) return Response.json(refused.body, {status: refused.status});
      const summary = await runNoticeTick(noticeDatabase(), createSender(parseServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT')), fetch as unknown as Fetch), Date.now(), noticeOptions());
      return Response.json(summary);
    }
    const result = await handlePush({method: request.method, secret: request.headers.get('x-push-secret')},
      {db: database(), sender: createSender(parseServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT')), fetch as unknown as Fetch), secret: Deno.env.get('PUSH_SHARED_SECRET') ?? '', now: Date.now});
    return Response.json(result.body, {status: result.status});
  } catch {
    // Never echo the cause: it could name a secret's shape. The outbox row stays and the next cron tick retries it.
    return Response.json({error: 'push failed'}, {status: 500});
  }
});
