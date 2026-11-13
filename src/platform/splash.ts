/**
 * AW7 (v7 UX audit r3): the launch splash is released on the app's first paint. Android keeps the splash until
 * `SplashScreen.hide()`, or for `launchShowDuration` (800 ms, the cap); the app used to call hide as soon as its native
 * layer started, which could be before React had drawn anything into the page.
 *
 * `index.html` ships a static web splash inside #root (N131 · L-20: the ℓ on the page colour, with its <style>), which
 * React's first commit replaces. That placeholder is not the app's first paint, so it does not count.
 */
const placeholder = (node: Element) => node.classList.contains('lemma-splash') || node.tagName === 'STYLE';

/** Whether React has drawn into `root`: an element child other than the static splash. */
export function rootPainted(root: HTMLElement): boolean {
  return Array.from(root.children).some(child => !placeholder(child));
}

/** Calls `done` once `root` has content (React's first commit), at once if it already has. Returns a cancel. */
export function whenRootPainted(root: HTMLElement | null, done: () => void): () => void {
  if (!root || rootPainted(root)) {
    done();
    return () => undefined;
  }
  const observer = new MutationObserver(() => {
    if (!rootPainted(root)) return;
    observer.disconnect();
    done();
  });
  observer.observe(root, {childList: true});
  return () => observer.disconnect();
}
