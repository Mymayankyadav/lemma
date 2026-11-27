import {useSyncExternalStore} from 'react';

export const REDUCE_EFFECTS_KEY = 'lemma.v7.reduce-effects';
export const REDUCE_EFFECTS_ATTR = 'data-v7-reduce-effects';
export const MOTION_ATTR = 'data-motion';
const QUERY = '(prefers-reduced-motion: reduce)';
const motionPreference = () => typeof matchMedia === 'function' ? matchMedia(QUERY) : null;

/** The OS preference, the account switch and legacy calm all ask for the same behavior. */
export function motionReduced(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.hasAttribute(REDUCE_EFFECTS_ATTR) || root.dataset.effects === 'calm' || motionPreference()?.matches === true;
}

function syncMotionPreference(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (motionReduced()) root.setAttribute(MOTION_ATTR, 'reduced');
  else root.removeAttribute(MOTION_ATTR);
}

/** Set the switch on this device and keep a copy for the next start. */
export function applyReduceEffects(on: boolean): void {
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute(REDUCE_EFFECTS_ATTR, on);
  syncMotionPreference();
  try {
    if (on) localStorage.setItem(REDUCE_EFFECTS_KEY, '1');
    else localStorage.removeItem(REDUCE_EFFECTS_KEY);
  } catch {/* the current document still has the setting */}
}

let stopWatching: (() => void) | undefined;
/** Set the derived CSS value before React renders, and track OS or legacy changes thereafter. */
export function bootReduceEffects(): void {
  if (typeof document === 'undefined') return;
  try {
    document.documentElement.toggleAttribute(REDUCE_EFFECTS_ATTR, localStorage.getItem(REDUCE_EFFECTS_KEY) === '1');
  } catch {/* the account setting applies once loaded */}
  syncMotionPreference();
  stopWatching?.();
  stopWatching = subscribe(syncMotionPreference);
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const media = motionPreference();
  media?.addEventListener?.('change', onChange);
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(onChange) : null;
  observer?.observe(document.documentElement, {attributes: true, attributeFilter: [REDUCE_EFFECTS_ATTR, 'data-effects']});
  return () => {media?.removeEventListener?.('change', onChange); observer?.disconnect();};
}

export function useMotionReduced(): boolean {
  return useSyncExternalStore(subscribe, motionReduced, () => false);
}
