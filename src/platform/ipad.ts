/**
 * N252 · whether Lemma runs on an iPad. Tiny on purpose: main.tsx marks the document before the first paint, so the
 * iPad's header spacing applies at once. A UI hint only, never an authentication boundary.
 */
type Device = Pick<Navigator, 'platform' | 'userAgent' | 'maxTouchPoints'>;

/** An iPad: its own user agent, or desktop-mode Safari (iPadOS reports a Mac with a touch screen). */
export function isIPadBrowser(device: Device): boolean {
  return /\biPad\b/.test(device.userAgent) || (/^Mac/.test(device.platform) && device.maxTouchPoints > 1);
}

/** Mark the document `data-ipad` on an iPad. Returns whether it is one. */
export function markIPad(root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
  device: Device | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  const iPad = Boolean(device && isIPadBrowser(device));
  if (iPad && root) root.dataset.ipad = '';
  return iPad;
}
