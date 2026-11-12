/**
 * N123 · N0 App Links, notification taps, shortcuts and the Android back button. Pure helpers, unit-tested.
 */
import {APP_ORIGIN, APP_PATH, AUTH_CALLBACK} from './device';

/** The in-app route for a URL the app was opened with, or null when it is not Lemma's (never navigates elsewhere). */
export function routeFromUrl(href: string): string | null {
  if (typeof href !== 'string' || !href || href.length > 4096 || /[\u0000-\u001f\u007f]/.test(href)) return null;
  let url: URL;
  try {url = new URL(href);} catch {return null;}
  if (url.username || url.password) return null;
  const ours = (url.protocol === 'https:' && url.origin === APP_ORIGIN && (url.pathname === APP_PATH || url.pathname === APP_PATH.slice(0, -1)))
    || (url.protocol === 'https:' && url.hostname === 'localhost' && url.pathname.startsWith(APP_PATH));
  if (!ours) return null;
  const hash = url.hash.startsWith('#/') ? url.hash.slice(1) : '/';
  return hash.length > 2048 ? null : hash;
}

/** The PKCE code from the OAuth callback, or the error the provider returned. */
export function authCallback(href: string): {code: string} | {error: string} | null {
  if (typeof href !== 'string' || !href.startsWith(AUTH_CALLBACK)) return null;
  let url: URL;
  try {url = new URL(href);} catch {return null;}
  const params = new URLSearchParams(url.search || url.hash.replace(/^#/, ''));
  const error = params.get('error_description') ?? params.get('error');
  if (error) return {error};
  const code = params.get('code');
  return code && /^[A-Za-z0-9._~-]{8,512}$/.test(code) ? {code} : null;
}

export type BackStep = 'close-layer' | 'history-back' | 'home' | 'minimise';
/** Android back: close the top sheet or dialog first, then go back in the app, and leave the app only from Today
 *  (a screen opened cold from a link or notification goes back to Today, not out of the app). */
export function backStep({layerOpen, route, canGoBack}: {layerOpen: boolean; route: string; canGoBack: boolean}): BackStep {
  if (layerOpen) return 'close-layer';
  const path = route.split('?')[0] || '/';
  if (path === '/') return 'minimise';
  return canGoBack ? 'history-back' : 'home';
}

/** Close the top layer the way Escape would: a native <dialog> gets `cancel`, a v6 role="dialog" panel gets Escape. */
export function closeTopLayer(doc: Document = document): boolean {
  const dialogs = Array.from(doc.querySelectorAll<HTMLDialogElement>('dialog[open]'));
  const top = dialogs[dialogs.length - 1];
  if (top) {
    top.dispatchEvent(new Event('cancel', {cancelable: true}));
    return true;
  }
  const panels = Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"],[role="menu"]'));
  const panel = panels[panels.length - 1];
  if (!panel) return false;
  const target = panel.contains(doc.activeElement) ? doc.activeElement as HTMLElement : panel;
  target.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
  return true;
}
export function hasOpenLayer(doc: Document = document): boolean {
  return !!doc.querySelector('dialog[open],[role="dialog"][aria-modal="true"],[role="menu"]');
}
