/**
 * N123 · N1 notification permission (Android 13+): asked in context, never at launch — when the learner turns
 * reminders on, or once after their first finished review round. A "no" is respected: Today and the Inbox still show
 * everything, and Settings › Reminders explains how to turn notifications on in system settings.
 */
import {isNative} from './native';
import {readDevicePref, writeDevicePref} from './device';

export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (!isNative()) return 'unsupported';
  writeDevicePref('notificationsAsked', true);
  try {
    const {lemmaNative} = await import('./bridge');
    return (await (await lemmaNative()).requestNotifications()).permission;
  } catch {
    return 'unsupported';
  }
}

/** The "first meaningful moment" ask: at most once per install. */
export async function offerNotificationsOnce(): Promise<void> {
  if (!isNative() || readDevicePref('notificationsAsked', false)) return;
  await requestNotificationPermission();
}
