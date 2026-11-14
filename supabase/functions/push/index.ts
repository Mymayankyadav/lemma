// N163: sends the phone's notifications over Firebase Cloud Messaging. Called by the database (pg_net) and by pg_cron
// with the shared secret in `x-push-secret`; deployed with the gateway's JWT check off because that header is the check.
// Function secrets (set by the Owner in the Supabase dashboard, never in the repo): FCM_SERVICE_ACCOUNT (the Firebase
// service-account JSON) and PUSH_SHARED_SECRET (at least 32 characters, the same value as the vault secret
// `push_shared_secret` that the database sends).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createSender,parseServiceAccount,type Fetch} from './fcm.ts';
import {handlePush,type OutboxRow,type PushDb} from './handler.ts';

function database(): PushDb {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  const ok = <T>(result: {data: T | null; error: {message: string} | null}): T | null => {if (result.error) throw new Error(result.error.message); return result.data;};
  return {
    claim: async limit => (ok(await admin.rpc('push_claim', {p_limit: limit})) ?? []) as OutboxRow[],
    entry: async (userId, id) => ok(await admin.from('study_entries').select('id,version,status,intent,mode,phase,cycle,config,phase_ends_at,project_id').eq('user_id', userId).eq('id', id).maybeSingle()),
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

Deno.serve(async request => {
  try {
    const result = await handlePush({method: request.method, secret: request.headers.get('x-push-secret')},
      {db: database(), sender: createSender(parseServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT')), fetch as unknown as Fetch), secret: Deno.env.get('PUSH_SHARED_SECRET') ?? '', now: Date.now});
    return Response.json(result.body, {status: result.status});
  } catch {
    // Never echo the cause: it could name a secret's shape. The outbox row stays and the next cron tick retries it.
    return Response.json({error: 'push failed'}, {status: 500});
  }
});
