import {isNative} from '../../platform/native';
/**
 * Events used by the v7 interaction vocabulary. AW6 (Owner decision E17, 13 Nov 2026: on by default, following the system
 * and Lemma's Haptics switch): reveal is a soft tick, Good or Easy a click (`grade`), Again two light ticks, a task tick a
 * click (`check`), an ending (✓ or ∎ lands) `complete`, a pomodoro's end rise, pause, rise; Inbox decisions and drag steps
 * as before.
 */
export type HapticEvent = 'reveal' | 'grade' | 'gradeAgain' | 'check' | 'decision' | 'snap' | 'sheetThreshold' | 'complete' | 'pomodoro' | 'destructive';

export const HAPTIC_PATTERNS: Readonly<Record<HapticEvent, number | number[]>> = {
  reveal: 5,
  grade: 8,
  gradeAgain: [8, 40, 8],
  check: 8,
  decision: 8,
  snap: 5,
  sheetThreshold: 5,
  complete: [12, 40, 20],
  pomodoro: [8, 120, 16],
  destructive: [20, 60, 20],
};

let switchOn = true;
/** Lemma's Haptics switch (Settings › Appearance), on until settings say otherwise; `useHapticsSetting` keeps it in step. */
export function setHapticsEnabled(on: boolean): void {switchOn = on;}
export function hapticsEnabled(): boolean {return switchOn;}

/** Returns false when disabled, unsupported, or rejected by the browser. `enabled` defaults to Lemma's Haptics switch; in
 *  the app the system engine also follows the system's own touch-feedback setting. */
export function haptic(event: HapticEvent, enabled: boolean = switchOn, device: Pick<Navigator, 'vibrate'> | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!enabled) return false;
  // N123: in the Android app the WebView has no Vibration API; the system haptics engine plays the same pattern.
  if (isNative()) { void import('../../platform/haptics').then(module => module.nativeHaptic(HAPTIC_PATTERNS[event])); return true; }
  if (typeof device?.vibrate !== 'function') return false;
  try { return device.vibrate(HAPTIC_PATTERNS[event]); } catch { return false; }
}

