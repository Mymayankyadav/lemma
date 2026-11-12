import {isNative} from '../../platform/native';
/** Events used by the v7 interaction vocabulary. */
export type HapticEvent = 'grade' | 'gradeAgain' | 'check' | 'decision' | 'snap' | 'sheetThreshold' | 'complete' | 'destructive';

export const HAPTIC_PATTERNS: Readonly<Record<HapticEvent, number | number[]>> = {
  grade: 8,
  gradeAgain: [8, 40, 8],
  check: 8,
  decision: 8,
  snap: 5,
  sheetThreshold: 5,
  complete: [12, 40, 20],
  destructive: [20, 60, 20],
};

/** Returns false when disabled, unsupported, or rejected by the browser. */
export function haptic(event: HapticEvent, enabled: boolean, device: Pick<Navigator, 'vibrate'> | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!enabled) return false;
  // N123: in the Android app the WebView has no Vibration API; the system haptics engine plays the same pattern.
  if (isNative()) { void import('../../platform/haptics').then(module => module.nativeHaptic(HAPTIC_PATTERNS[event])); return true; }
  if (typeof device?.vibrate !== 'function') return false;
  try { return device.vibrate(HAPTIC_PATTERNS[event]); } catch { return false; }
}

