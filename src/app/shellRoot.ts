import type {EffectiveShell} from '../flags';

/** Apply before the first shell paint; root scope also reaches body portals. */
export function setShellRoot(shell:EffectiveShell, root:Element=document.documentElement):void {
  root.removeAttribute('data-v6');
  root.removeAttribute('data-v7');
  if (shell === 'v6') root.setAttribute('data-v6', '');
  if (shell === 'v7') root.setAttribute('data-v7', '');
}
