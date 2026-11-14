/**
 * N163 · Firebase Cloud Messaging HTTP v1 from an Edge function: a service-account JWT (RS256, WebCrypto) exchanged for an
 * OAuth access token, then `messages:send`. The service account is the function secret FCM_SERVICE_ACCOUNT; nothing here
 * logs it, a token or a message body.
 */
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const utf8 = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

export interface ServiceAccount {client_email: string; private_key: string; project_id: string; token_uri: string}
export function parseServiceAccount(raw: string | undefined): ServiceAccount {
  let value: Record<string, unknown>;
  try {value = JSON.parse(raw ?? '');} catch {throw new Error('FCM_SERVICE_ACCOUNT is not JSON');}
  const text = (key: string) => typeof value[key] === 'string' ? value[key] as string : '';
  const account = {client_email: text('client_email'), private_key: text('private_key'), project_id: text('project_id'), token_uri: text('token_uri') || 'https://oauth2.googleapis.com/token'};
  if (!account.client_email || !account.project_id || !/^-----BEGIN PRIVATE KEY-----/.test(account.private_key)) throw new Error('FCM_SERVICE_ACCOUNT is missing client_email, project_id or private_key');
  // The token endpoint comes from the secret; only Google's own is accepted.
  if (new URL(account.token_uri).hostname !== 'oauth2.googleapis.com') throw new Error('FCM_SERVICE_ACCOUNT has an unexpected token_uri');
  return account;
}

async function signJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
  const pem = account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  const head = b64url(utf8.encode(JSON.stringify({alg: 'RS256', typ: 'JWT'})));
  const body = b64url(utf8.encode(JSON.stringify({iss: account.client_email, scope: SCOPE, aud: account.token_uri, iat: nowSeconds, exp: nowSeconds + 3300})));
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8.encode(head + '.' + body)));
  return head + '.' + body + '.' + b64url(signature);
}

export type Fetch = (url: string, init: {method: string; headers: Record<string, string>; body: string; signal?: AbortSignal}) => Promise<{status: number; json(): Promise<unknown>}>;
export interface Sender {send(token: string, data: Record<string, string>, options?: {collapseKey?: string; ttlSeconds?: number}): Promise<SendResult>}
export type SendResult = 'sent' | 'gone' | 'retry' | 'failed';

/** A sender that keeps its access token until a minute before it expires. */
export function createSender(account: ServiceAccount, fetcher: Fetch, clock: () => number = Date.now): Sender {
  let cached: {token: string; expires: number} | null = null;
  async function accessToken(): Promise<string> {
    if (cached && cached.expires - 60_000 > clock()) return cached.token;
    const assertion = await signJwt(account, Math.floor(clock() / 1000));
    const response = await fetcher(account.token_uri, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + assertion});
    const json = await response.json().catch(() => null) as {access_token?: string; expires_in?: number} | null;
    if (response.status !== 200 || !json?.access_token) throw new Error('FCM token exchange failed (' + response.status + ')');
    cached = {token: json.access_token, expires: clock() + (json.expires_in ?? 3300) * 1000};
    return cached.token;
  }
  return {
    async send(token, data, options = {}) {
      for (const value of Object.values(data)) if (typeof value !== 'string') return 'failed';
      if (utf8.encode(JSON.stringify(data)).length > 3800) return 'failed';
      let access: string;
      try {access = await accessToken();} catch {return 'retry';}
      const body = JSON.stringify({message: {token, data, android: {priority: 'HIGH', ttl: (options.ttlSeconds ?? 60) + 's', ...(options.collapseKey ? {collapse_key: options.collapseKey} : {})}}});
      let response;
      try {
        response = await fetcher('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(account.project_id) + '/messages:send',
          {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + access}, body, signal: AbortSignal.timeout(8000)});
      } catch {return 'retry';}
      if (response.status === 200) return 'sent';
      if (response.status === 401) {cached = null; return 'retry';}
      const json = await response.json().catch(() => null) as {error?: {status?: string; details?: {errorCode?: string}[]}} | null;
      const code = json?.error?.details?.find(detail => detail.errorCode)?.errorCode ?? json?.error?.status;
      if (response.status === 404 || code === 'UNREGISTERED' || code === 'NOT_FOUND') return 'gone';
      if (response.status === 429 || response.status >= 500) return 'retry';
      return 'failed';
    },
  };
}
