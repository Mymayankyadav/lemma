import {useSyncExternalStore} from 'react';

export const SURFACE_BETA_KEY = 'lemma.v7.beta-testing';
const changed = 'lemma:beta-testing-changed';
let preference: boolean | undefined;

function storedPreference() {
  try { return localStorage.getItem(SURFACE_BETA_KEY) === '1'; }
  catch { return preference ?? false; }
}

/** The same device choice applies to web, installed PWAs, and the native webview. */
export function surfaceBetaEnabled() {
  if (typeof window === 'undefined') return false;
  return preference ??= storedPreference();
}

function apply(value: boolean) {
  preference = value;
  document.documentElement.toggleAttribute('data-v7-beta', value);
  window.dispatchEvent(new Event(changed));
}

export function setSurfaceBeta(value: boolean) {
  try { localStorage.setItem(SURFACE_BETA_KEY, value ? '1' : '0'); } catch { /* Keep this visit's choice. */ }
  apply(value);
}

function storageChanged(event: StorageEvent) {
  if (event.key === null || event.key === SURFACE_BETA_KEY) apply(storedPreference());
}

export function bootSurfaceBeta() {
  if (typeof window === 'undefined') return;
  document.documentElement.toggleAttribute('data-v7-beta', surfaceBetaEnabled());
  window.addEventListener('storage', storageChanged);
}

function subscribe(notify: () => void) {
  window.addEventListener(changed, notify);
  return () => window.removeEventListener(changed, notify);
}

export function useSurfaceBeta() {
  return useSyncExternalStore(subscribe, surfaceBetaEnabled, () => false);
}
