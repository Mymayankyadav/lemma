/**
 * N123 · the one place that knows whether Lemma runs inside the Capacitor Android app. Deliberately tiny: it is in
 * the website's first load. Nothing here imports `@capacitor/*`; every native module is loaded with a dynamic import
 * only after `isNative()` is true. Platform signals are UI hints, never an authentication boundary.
 */
type CapacitorGlobal = {isNativePlatform?: () => boolean; getPlatform?: () => string};

/** True only inside the Android app (Capacitor's bridge injects `window.Capacitor` before any script runs). */
export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {Capacitor?: CapacitorGlobal}).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true && cap.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}
