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

/**
 * N157 · AW3 second stage (Owner decision E15): one quiet request a day to the public releases feed (no account, no
 * data sent beyond the request itself; the privacy page says so). When a newer APK exists, Settings shows a dot and
 * About this app names the version.
 */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/Mymayankyadav/lemma/releases/latest';
export const UPDATE_CHECK_MS = 24 * 60 * 60 * 1000;
/** The build number of a version name (2.0.N) or a release tag (android-build-N); null for local builds. */
export function buildNumber(value: string | null | undefined): number | null {
  const match = /^(?:2\.0\.|android-build-)([1-9]\d{0,8})$/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) : null;
}
/** The newer build, when the latest release is newer than this one; null otherwise (or when either is unknown). */
export function newerBuild(installed: string | null | undefined, latestTag: string | null | undefined): number | null {
  const have = buildNumber(installed), latest = buildNumber(latestTag);
  return have !== null && latest !== null && latest > have ? latest : null;
}
export const dueForUpdateCheck = (lastAt: number | null, now: number) => lastAt === null || !(now - lastAt < UPDATE_CHECK_MS) || now < lastAt;
/** Run the day's check if it is due: records when it ran and the newer build (or null). Never throws. */
export async function checkForUpdate(installed: string | null, now = Date.now(), get: typeof fetch = fetch): Promise<number | null> {
  if (!dueForUpdateCheck(readDevicePref<number | null>('updateCheckedAt', null), now)) return readDevicePref<number | null>('updateAvailable', null);
  try {
    const response = await get(LATEST_RELEASE_API, {headers: {Accept: 'application/vnd.github+json'}});
    if (!response.ok) return readDevicePref<number | null>('updateAvailable', null);
    const latest = newerBuild(installed, ((await response.json()) as {tag_name?: string}).tag_name);
    writeDevicePref('updateCheckedAt', now);
    writeDevicePref('updateAvailable', latest);
    return latest;
  } catch {
    return readDevicePref<number | null>('updateAvailable', null);
  }
}

export type DevicePrefKey = 'studyMode' | 'studyModeRequestedAt' | 'calendarSync' | 'busyCalendars' | 'welcomeSeen' | 'notificationsAsked' | 'updateCheckedAt' | 'updateAvailable';
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
