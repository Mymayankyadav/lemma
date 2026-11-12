/**
 * A1 · Motion v1: one answer to "may this animate?" for every v7 surface. Motion is reduced when the system asks for
 * it (prefers-reduced-motion) or when the learner turns on Settings › Appearance › Reduce effects. The switch is saved
 * with the account (settings.ui.reduceEffects) and mirrored on the device so it applies before the first paint.
 * CSS reads the same state from `html[data-v7-reduce-effects]` (src/ui/v7/motion.css).
 */
import {useSyncExternalStore} from 'react';

export const REDUCE_EFFECTS_KEY = 'lemma.v7.reduce-effects';
export const REDUCE_EFFECTS_ATTR = 'data-v7-reduce-effects';
const QUERY = '(prefers-reduced-motion: reduce)';

/** Set the switch on this device: the attribute now, the stored copy for the next start. */
export function applyReduceEffects(on: boolean): void {
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute(REDUCE_EFFECTS_ATTR, on);
  try {
    if (on) localStorage.setItem(REDUCE_EFFECTS_KEY, '1');
    else localStorage.removeItem(REDUCE_EFFECTS_KEY);
  } catch {/* the attribute still applies for this visit */}
}

/** Called once at start-up, before React renders. */
export function bootReduceEffects(): void {
  try {
    if (localStorage.getItem(REDUCE_EFFECTS_KEY) === '1') document.documentElement.setAttribute(REDUCE_EFFECTS_ATTR, '');
  } catch {/* storage blocked: the account setting applies once settings load */}
}

/** Whether motion is reduced right now (system setting or Reduce effects). */
export function motionReduced(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.hasAttribute(REDUCE_EFFECTS_ATTR)) return true;
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const media = typeof matchMedia === 'function' ? matchMedia(QUERY) : null;
  media?.addEventListener?.('change', onChange);
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(onChange) : null;
  observer?.observe(document.documentElement, {attributes: true, attributeFilter: [REDUCE_EFFECTS_ATTR]});
  return () => {media?.removeEventListener?.('change', onChange); observer?.disconnect();};
}

/** React view of `motionReduced()`, updated when either setting changes. */
export function useMotionReduced(): boolean {
  return useSyncExternalStore(subscribe, motionReduced, () => false);
}
