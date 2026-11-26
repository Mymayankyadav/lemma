/** Ownership of keyboard, Back, scroll and focus follows opening order, including native top-layer popovers. */
export type SurfaceRole = 'S3' | 'S4' | 'S5' | 'step';
export type DismissReason = 'escape' | 'back' | 'backdrop' | 'drag' | 'close' | 'tab' | 'outside';
type Target = HTMLElement | null;
export interface Layer {
  element: HTMLElement;
  role: SurfaceRole;
  trigger: Target;
  owner?: Target;
  returnTarget?: () => Target;
  dirty?: () => boolean;
  dismiss: (reason: DismissReason) => void;
}
let sequence = 0;
const stack: Layer[] = [];
const subscribers = new Set<() => void>();
const locks = new WeakMap<Document, { count: number; overflow: string }>();
const pendingHandoffs = new WeakMap<Document,{trigger: Target}>();

export function subscribeLayers(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function notify() { for (const listener of subscribers) listener(); }
function top(doc: Document) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].element.ownerDocument === doc) return stack[i]; }
export function hasOpenLayer(doc: Document = document): boolean { return !!top(doc); }
export function hasDirtyLayer(doc: Document = document): boolean {
  return stack.some(layer => layer.element.ownerDocument === doc && layer.dirty?.());
}
export function dismissTopLayer(reason: DismissReason, doc: Document = document): boolean {
  const layer = top(doc);
  if (!layer) return false;
  layer.dismiss(reason);
  return true;
}
export function requestLayerClose(element: HTMLElement, reason: DismissReason) {
  if (top(element.ownerDocument)?.element === element) dismissTopLayer(reason, element.ownerDocument);
}
export function topLayerElement(doc: Document = document) { return top(doc)?.element ?? null; }
export function handoffLayer(action: () => void) {
  const doc = document;
  const handoff = {trigger:top(doc)?.trigger ?? null};
  pendingHandoffs.set(doc,handoff);
  try { action(); } finally {
    // React batches click updates at the end of the task. Keep the launcher through that commit.
    setTimeout(()=>{if(pendingHandoffs.get(doc)===handoff)pendingHandoffs.delete(doc);},0);
  }
}
export function layerLauncher(doc: Document) {
  const handed = pendingHandoffs.get(doc)?.trigger;
  return handed?.isConnected ? handed : doc.activeElement instanceof HTMLElement && doc.activeElement !== doc.body ? doc.activeElement : null;
}
export function isLayerHandoff(doc: Document) { return pendingHandoffs.has(doc); }

const visible = (el: Target | undefined): el is HTMLElement => !!el?.isConnected && el !== el.ownerDocument.body
  && !el.matches(':disabled') && !el.closest('[hidden], [inert], dialog:not([open])')
  && (el.getClientRects().length > 0 || (!el.ownerDocument.documentElement.getClientRects().length
    && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'));

export function restoreLayerFocus(trigger: Target, fallback?: Target | (() => Target)) {
  const doc = trigger?.ownerDocument ?? document;
  const owner = top(doc)?.element;
  const root = owner ?? doc;
  const requested = typeof fallback === 'function' ? fallback() : fallback;
  const candidates = [trigger, requested, ...root.querySelectorAll<HTMLElement>('[data-return-anchor]'),
    ...root.querySelectorAll<HTMLElement>(owner ? '[data-v7-autofocus],button:not(:disabled),input,h2' : 'main h1,h1,main[tabindex]')];
  for (const el of candidates) {
    if (!visible(el) || (owner && !owner.contains(el))) continue;
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.tabIndex = -1;
    el.focus({preventScroll: true});
    if (doc.activeElement === el) return;
  }
}

export function registerLayer(layer: Layer) {
  const {element, role} = layer, doc = element.ownerDocument;
  // An already-open child may register first when React mounts an entire branch in one commit.
  const child = stack.findIndex(item => element.contains(item.element));
  if (child < 0) stack.push(layer);
  else stack.splice(child, 0, layer);
  const modal = role === 'S3' || role === 'S5';
  element.dataset.surfaceRole = role;
  element.dataset.layerActive = '';
  element.dataset.layer = element.id || 'v7-'+(++sequence);
  if (modal) {
    const lock = locks.get(doc) ?? {count: 0, overflow: doc.body.style.overflow};
    if (!lock.count++) doc.body.style.overflow = 'hidden';
    locks.set(doc, lock);
  }
  notify();
  return (restore = true) => {
    const index = stack.indexOf(layer);
    if (index < 0) return;
    const wasTop = top(doc) === layer;
    stack.splice(index, 1);
    delete element.dataset.layerActive;
    delete element.dataset.layer;
    if (modal) {
      const lock = locks.get(doc)!;
      if (--lock.count === 0) {
        doc.body.style.overflow = lock.overflow;
        locks.delete(doc);
      }
    }
    notify();
    if (restore && wasTop) {
      const previousTop = top(doc);
      queueMicrotask(() => {
        // A handoff or navigation may already have installed and focused its own content.
        if (top(doc) !== previousTop) return;
        restoreLayerFocus(layer.trigger, layer.returnTarget);
      });
    }
  };
}

/** Tab from a portaled list resumes document order at its launcher. */
export function tabFromLayer(trigger: Target, backwards: boolean) {
  if (!trigger) return;
  queueMicrotask(() => {
    const owner = trigger.closest('dialog[open]') ?? trigger.ownerDocument;
    const controls = Array.from(owner.querySelectorAll<HTMLElement>('a[href],button,input,textarea,select,[tabindex]'))
      .filter(el => el.tabIndex >= 0 && visible(el) && !el.closest('[data-surface-role="S4"]'));
    const start = controls.indexOf(trigger);
    const next = controls[start + (backwards ? -1 : 1)] ?? (backwards ? controls.at(-1) : controls[0]);
    (next ?? trigger).focus({preventScroll: true});
  });
}
