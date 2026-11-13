/**
 * AW9 (v7 UX audit r3): turning on Study mode took two trips: the switch opened Android's "Do Not Disturb access" page,
 * and on return the learner had to find the switch and tap it again. The app now remembers the request for ten minutes
 * and finishes it on return when access was granted. Pure, so it is unit-tested.
 */
export const STUDY_MODE_INTENT_MS = 10 * 60_000;

export type StudyModeStep = 'enable' | 'wait' | 'forget' | null;
/** What to do when Planning settings read the phone's status: `requestedAt` is when the learner asked (or null). */
export function studyModeOnReturn(requestedAt: number | null | undefined, status: {access: boolean; enabled: boolean} | null, now: number): StudyModeStep {
  if (!requestedAt) return null;
  if (now - requestedAt > STUDY_MODE_INTENT_MS) return 'forget';
  if (!status) return 'wait';
  if (status.enabled) return 'forget';
  return status.access ? 'enable' : 'wait';
}
