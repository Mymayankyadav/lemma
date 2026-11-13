/**
 * N123 · device-local preferences of the Android app (never synced: they describe this phone, not the learner) and
 * the app's fixed addresses. Kept apart from `native.ts` so the website's first load carries only `isNative()`.
 */
/** App Links origin and path (the same as the website, so a shared link opens the app when it is installed). */
export const APP_ORIGIN = 'https://mymayankyadav.github.io';
export const APP_PATH = '/lemma/';
/** OAuth returns here; the Owner adds it to Supabase Auth → URL configuration → Redirect URLs. */
export const AUTH_CALLBACK = 'io.github.mymayankyadav.lemma://auth/callback';

/** AW3 (v7 UX audit r3, Owner decision E15): the app is installed from GitHub Releases, so updates live there. */
export const RELEASES_URL = 'https://github.com/Mymayankyadav/lemma/releases';
/** "Check for updates" (the newest release) and "What changed" (this version's release, when the build number is known:
 *  CI names version 2.0.N and tags its release android-build-N; local builds are 2.0.0 and have no release). */
export function releaseLinks(version: string | null | undefined): {latest: string; thisVersion: string | null} {
  const build = /^2\.0\.([1-9]\d{0,8})$/.exec(String(version ?? '').trim())?.[1];
  return {latest: RELEASES_URL + '/latest', thisVersion: build ? RELEASES_URL + '/tag/android-build-' + build : null};
}

export type DevicePrefKey = 'studyMode' | 'studyModeRequestedAt' | 'calendarSync' | 'busyCalendars' | 'welcomeSeen' | 'notificationsAsked';
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
