/**
 * N123 · device-local preferences of the Android app (never synced: they describe this phone, not the learner) and
 * the app's fixed addresses. Kept apart from `native.ts` so the website's first load carries only `isNative()`.
 */
/** App Links origin and path (the same as the website, so a shared link opens the app when it is installed). */
export const APP_ORIGIN = 'https://mymayankyadav.github.io';
export const APP_PATH = '/lemma/';
/** OAuth returns here; the Owner adds it to Supabase Auth → URL configuration → Redirect URLs. */
export const AUTH_CALLBACK = 'io.github.mymayankyadav.lemma://auth/callback';

export type DevicePrefKey = 'studyMode' | 'calendarSync' | 'busyCalendars' | 'welcomeSeen' | 'notificationsAsked';
export const DEVICE_PREFS_CHANGED = 'lemma:device-prefs-changed';
const prefKey = (key: DevicePrefKey) => 'lemma.android.' + key;
export function readDevicePref<T>(key: DevicePrefKey, fallback: T): T {
  try {
    const raw = localStorage.getItem(prefKey(key));
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function writeDevicePref(key: DevicePrefKey, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(prefKey(key));
    else localStorage.setItem(prefKey(key), JSON.stringify(value));
  } catch {
    /* a device convenience only */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_PREFS_CHANGED));
}
