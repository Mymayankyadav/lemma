/**
 * AW13 (v7 UX audit r3): the Android app's "Were you drifting?" question. It was a 10-second toast with one action and
 * no "No", easy to miss. The app's start-up now leaves the question here (for this visit only) and Focus shows it as a
 * quiet card with "Yes, note it" and "No" that stays until answered. Tiny and free of native imports: Focus reads it on
 * every platform, but only the app asks.
 */
export interface DriftQuestion {entryId: string; minutes: number; at: number}
const KEY = 'lemma.android.drift';
export const DRIFT_CHANGED = 'lemma:drift-changed';

const announce = () => {if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRIFT_CHANGED));};

export function askDrift(question: DriftQuestion): void {
  try {sessionStorage.setItem(KEY, JSON.stringify(question));} catch {/* private mode: no question */}
  announce();
}
/** The open question for `entryId` (a question about another session is stale and is dropped). */
export function pendingDrift(entryId: string | null | undefined): DriftQuestion | null {
  let question: DriftQuestion | null = null;
  try {question = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as DriftQuestion | null;} catch {question = null;}
  if (!question || typeof question.entryId !== 'string' || !(question.minutes >= 1)) return null;
  return entryId && question.entryId === entryId ? question : null;
}
export function clearDrift(): void {
  try {sessionStorage.removeItem(KEY);} catch {/* nothing stored */}
  announce();
}
