import {useEffect} from 'react';

/** A committed screen provides a reading position when its previous control was removed. */
export function useRouteReadingFocus(path: string, enabled: boolean) {
  useEffect(() => {
    const mount = document.getElementById('root');
    if (!enabled || !mount) return;
    const root = mount;
    let anchor: HTMLElement | null = null;
    let frame = 0, task = 0;
    const observer = new MutationObserver(() => { if (!anchor?.isConnected) schedule(); });
    function stop() {
      cancelAnimationFrame(frame);
      clearTimeout(task);
      observer.disconnect();
      document.removeEventListener('focusin', onFocus, true);
    }
    function onFocus(event: FocusEvent) {
      if (event.target !== anchor) stop();
    }
    function focus() {
      task = 0;
      if (document.activeElement !== document.body || root.querySelector('[data-layer-active], dialog[open]')) {
        stop();
        return;
      }
      const main = root.querySelector<HTMLElement>('main#main-content') ?? root.querySelector<HTMLElement>('main');
      if (!main || !main.getClientRects().length || main.closest('[hidden],[inert],[data-loading-surface]')) {
        observer.observe(root, {childList: true, subtree: true});
        return;
      }
      const title = main.querySelector<HTMLElement>('h1');
      anchor = title?.getClientRects().length ? title : main;
      if (!anchor.hasAttribute('tabindex')) anchor.tabIndex = -1;
      anchor.focus({preventScroll: true});
      // Loading data or applying saved appearance can replace the initial landmark.
      // Only watch its ancestor chain until the reader focuses another control.
      observer.disconnect();
      for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
        observer.observe(parent, {childList: true});
        if (parent === root) break;
      }
    }
    function schedule() {
      if (!frame && !task) frame = requestAnimationFrame(() => {
        frame = 0;
        // Reading focus need not initiate synchronous layout before the destination's first paint.
        task = window.setTimeout(focus, 0);
      });
    }
    document.addEventListener('focusin', onFocus, true);
    schedule();
    return stop;
  }, [path, enabled]);
}
