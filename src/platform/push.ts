/**
 * N163 · tells the server this phone's Firebase Cloud Messaging token, so a timer started, paused or finished from chat
 * reaches the notification while the app is closed. The native side starts Firebase only when the app has its values;
 * otherwise `configured` is false and nothing is sent.
 */
import type {LemmaNativePlugin} from './bridge';

export interface PushRegistrar {
  register(key: string, token: string, appVersion: string): Promise<void>;
  unregister(key: string): Promise<void>;
}
export type PushOutcome = 'registered' | 'unchanged' | 'off' | 'waiting';

let lastSent = '';
/** N164: true once this phone's FCM token is registered, so the server delivers the reminders it can and the phone must not schedule them too. */
export const serverDelivers = (): boolean => lastSent !== '';
/** Forget what was sent (sign-out), so the next sign-in registers again. */
export function resetPushRegistration(): void {lastSent = '';}

/** Ask the plugin for the token and register it once per token and device key. A missing token means one is on its way: the plugin signals `pushToken`. */
export async function syncPushToken(native: Pick<LemmaNativePlugin, 'pushToken'>, registrar: PushRegistrar, key: string, appVersion: string, ownerId='',isCurrent:()=>boolean=()=>true): Promise<PushOutcome> {
  const {configured, token} = await native.pushToken();
  if (!isCurrent()) return 'waiting';
  if (!configured) return 'off';
  if (!token) return 'waiting';
  const stamp = ownerId+'|'+key + '|' + token + '|' + appVersion;
  if (stamp === lastSent) return 'unchanged';
  await registrar.register(key, token, appVersion);
  if(!isCurrent())return 'waiting';
  lastSent = stamp;
  return 'registered';
}

/** The live registrar: the two functions of migration 20261214100000, called as the signed-in owner. */
export function createPushRegistrar(client: () => Promise<{rpc(fn: string, args: Record<string, unknown>): PromiseLike<{error: {message: string} | null}>}>): PushRegistrar {
  return {
    async register(key, token, appVersion) {
      const {error} = await (await client()).rpc('register_push_token', {p_key: key, p_token: token, p_app_version: appVersion.slice(0, 40)});
      if (error) throw new Error(error.message);
    },
    async unregister(key) {
      const {error} = await (await client()).rpc('unregister_push_token', {p_key: key});
      if (error) throw new Error(error.message);
    },
  };
}

/** N164: Settings' "Send a test reminder": queues one for this owner and asks the server to deliver it now (at most one a minute). */
export async function requestTestNotice(client?: () => Promise<{rpc(fn: string, args: Record<string, unknown>): PromiseLike<{error: {message: string} | null}>}>): Promise<void> {
  const db = await (client ?? (async () => (await import('../data/live/client')).liveClient() as never))();
  const {error} = await db.rpc('request_notify_test', {});
  if (error) throw new Error(error.message);
}

