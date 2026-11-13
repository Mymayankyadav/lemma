import {useSyncExternalStore} from 'react';
import {DEVICE_PREFS_CHANGED, readDevicePref, type DevicePrefKey} from './device';

/** A device preference that re-renders when it changes (N157: the update dot on Settings). */
export function useDevicePrefValue<T>(key: DevicePrefKey, fallback: T): T {
  const raw = useSyncExternalStore(
    change => {window.addEventListener(DEVICE_PREFS_CHANGED, change); return () => window.removeEventListener(DEVICE_PREFS_CHANGED, change);},
    () => JSON.stringify(readDevicePref<T>(key, fallback)),
    () => JSON.stringify(fallback));
  return JSON.parse(raw) as T;
}
