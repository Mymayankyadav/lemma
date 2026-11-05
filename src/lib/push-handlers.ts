import {parsePushNotice, pushDeepLink} from './push-notice';

/** The same handlers can be attached by the service-worker bootstrap when enabled. */
export interface PushWindow {
 url: string;
 focus(): Promise<unknown>;
 navigate?(url: string): Promise<unknown>;
}
export interface PushClients {
 matchAll(options: {type: 'window'; includeUncontrolled: boolean}): Promise<PushWindow[]>;
 openWindow(url: string): Promise<unknown>;
}
export interface PushNotification {
 title: string;
 body: string;
 tag: string;
 data: {url: string; actions: Array<{action: string; url?: string}>};
}
export function noticeFromPush(raw: string): PushNotification | null {
 const notice = parsePushNotice(raw);
 if (!notice) return null;
 const url = pushDeepLink(notice.url);
 if (!url) return null;
 return {
  title: notice.title, body: notice.body, tag: notice.tag,
  data: {url, actions: notice.actions.map(a => ({action: a.action, ...(a.url ? {url: pushDeepLink(a.url) ?? url} : {})}))},
 };
}
export async function routeNotificationClick(
 clients: PushClients, data: PushNotification['data'], action = '',
): Promise<void> {
 const target = pushDeepLink(data.actions.find(a => a.action === action)?.url ?? data.url);
 if (!target) return;
 const windows = await clients.matchAll({type: 'window', includeUncontrolled: true});
 const existing = windows.find(w => {
  try {
   const current = new URL(w.url);
   return current.pathname.startsWith('/lemma/') &&
    (current.protocol === 'https:' || (current.protocol === 'http:' && ['localhost','127.0.0.1'].includes(current.hostname)));
  } catch {return false;}
 });
 if (existing) {
  if (existing.navigate) await existing.navigate(target);
  await existing.focus();
 } else {
  await clients.openWindow(target);
 }
}
