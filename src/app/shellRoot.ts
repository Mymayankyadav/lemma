import type {EffectiveShell} from '../flags';

/** Apply before the first shell paint; root scope also reaches body portals. */
export function setShellRoot(shell:EffectiveShell, root:Element=document.documentElement):void {
  root.removeAttribute('data-v6');
  root.removeAttribute('data-v7');
  if (shell === 'v6') root.setAttribute('data-v6', '');
  if (shell === 'v7') root.setAttribute('data-v7', '');
  if (root === document.documentElement) syncThemeColour(root);
}

/** v7 page colours (src/ui/v7/tokens.css), used for the browser and installed-window chrome while v7 is the shell. */
export const V7_PAGE_COLOUR = {day: '#F8F5F0', night: '#091023'} as const;
const V6_PAGE_COLOUR = {day: '#FAFAF6', night: '#13171D'} as const;

/** Keep `<meta name="theme-color">` on the current shell's page colour (release plan R2 §3: no flash of the old grey). */
export function syncThemeColour(root: Element = document.documentElement): void {
  const night = root.getAttribute('data-theme') === 'graph-night';
  const colours = root.hasAttribute('data-v7') ? V7_PAGE_COLOUR : V6_PAGE_COLOUR;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', night ? colours.night : colours.day));
}
