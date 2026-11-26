import {useContext, useId, useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Sheet, SheetHost, StepHeader} from './Sheet';
import {finishChoiceExit, retainChoiceExit} from './sheetPresence';
import {dismissTopLayer, layerLauncher, registerLayer, requestLayerClose, tabFromLayer, topLayerElement, type DismissReason} from './layers';
const wideQuery = '(min-width:700px)';
const isWide = () => typeof matchMedia === 'function' && matchMedia(wideQuery).matches;
function onWidthChange(update: () => void) {
  const media = typeof matchMedia === 'function' ? matchMedia(wideQuery) : null;
  media?.addEventListener('change', update);
  return () => media?.removeEventListener('change', update);
}
export function useWideSurface() { return useSyncExternalStore(onWidthChange, isWide, () => false); }

const rowSelector = '[role="option"]:not(:disabled),[role="menuitem"]:not(:disabled)';
function isTyping(el: Element | null) { return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement; }
function findStart(panel: HTMLElement) {
  return panel.querySelector<HTMLElement>('[data-v7-autofocus="true"],[aria-selected="true"],input:checked') ??
    panel.querySelector<HTMLElement>(rowSelector) ?? panel.querySelector<HTMLElement>('input,button');
}
function positionMenu(panel: HTMLElement, trigger: HTMLElement, name: string) {
  const win = panel.ownerDocument.defaultView!;
  const oldAnchor = trigger.style.getPropertyValue('anchor-name');
  const anchors = typeof CSS !== 'undefined' && CSS.supports('position-anchor', name);
  if (anchors) {
    trigger.style.setProperty('anchor-name', name);
    panel.style.setProperty('position-anchor', name);
  }
  function measure() {
    const box = trigger.getBoundingClientRect(), edge = 8, gap = 4;
    const width = Math.min(Math.max(240, box.width), 360, win.innerWidth - 2*edge);
    const below = win.innerHeight - box.bottom - edge - gap, above = box.top - edge - gap;
    const limit = Math.min(win.innerHeight * .6, 420);
    panel.style.width = width + 'px';
    const up = below < Math.min(panel.scrollHeight + 2, limit) && above > below;
    panel.style.maxHeight = Math.max(1, Math.min(limit, up ? above : below)) + 'px';
    const left = Math.max(edge, Math.min(box.left, win.innerWidth - width - edge));
    panel.style.left = anchors && left === box.left ? 'anchor(left)' : left + 'px';
    panel.style.top = up ? 'auto' : anchors ? 'calc(anchor(bottom) + 4px)' : box.bottom + gap + 'px';
    panel.style.bottom = !up ? 'auto' : anchors ? 'calc(anchor(top) + 4px)' : win.innerHeight - box.top + gap + 'px';
  }
  measure();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  observer?.observe(trigger);
  observer?.observe(panel);
  win.addEventListener('resize', measure);
  win.addEventListener('scroll', measure, true);
  return () => {
    observer?.disconnect(); win.removeEventListener('resize', measure); win.removeEventListener('scroll', measure, true);
    if (anchors) {
      if (oldAnchor) trigger.style.setProperty('anchor-name', oldAnchor);
      else trigger.style.removeProperty('anchor-name');
    }
  };
}

interface ChoiceProps {
  title: string; onClose: () => void; anchor?: () => HTMLElement | null;
  children: ReactNode; role?: 'dialog' | 'menu' | 'listbox'; className?: string;
  autoFocus?: boolean; containFocus?: boolean;
}
function OpenChoice({title, onClose, anchor, children, role = 'dialog', className = '', autoFocus = true, containFocus}: ChoiceProps) {
  const host = useContext(SheetHost), wide = useWideSurface(), id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({anchor, onClose, autoFocus});
  latest.current = {anchor, onClose, autoFocus};
  const trigger = useRef<HTMLElement | null>(null);
  const typeAhead = useRef({value:'', at:0});
  const ignoreReturn = useRef(false);
  const step = !!host && !wide;
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const doc = panel.ownerDocument;
    const launcher = latest.current.anchor?.() ?? layerLauncher(doc);
    trigger.current = launcher;
    const owner = host ?? topLayerElement(doc);
    finishChoiceExit(doc);
    const native = wide && typeof panel.showPopover === 'function';
    const previousTitle = host?.getAttribute('aria-labelledby');
    if (step && host) { host.dataset.choiceStep = ''; host.setAttribute('aria-labelledby', id); }
    if (native) { panel.popover = 'auto'; panel.showPopover(); }
    const unposition = wide && launcher ? positionMenu(panel, launcher, '--v7-anchor-'+id.replace(/[^a-z\d_-]/gi,'')) : undefined;
    const release = registerLayer({element:panel, owner, role:step ? 'step' : 'S4', trigger:launcher, dismiss:(reason: DismissReason) => {
      ignoreReturn.current = reason === 'tab' || reason === 'outside';
      latest.current.onClose();
    }});
    if (latest.current.autoFocus) {
      const first = findStart(panel);
      (first ?? panel).focus({preventScroll:true});
      first?.scrollIntoView?.({block:'nearest'});
    }
    const outside = (event: PointerEvent) => {
      if (wide && event.target instanceof Node && !panel.contains(event.target) && !launcher?.contains(event.target)) {
        // Set the return-focus policy before the browser moves focus to the clicked control.
        if (host && (event.target === host || !host.contains(event.target))) {
          const absorb = (click: MouseEvent) => {click.preventDefault(); click.stopImmediatePropagation();};
          doc.addEventListener('click', absorb, {capture:true, once:true});
          setTimeout(()=>doc.removeEventListener('click',absorb,true), 400);
        }
        requestLayerClose(panel, 'outside');
      }
    };
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed' && panel.isConnected) requestLayerClose(panel,'escape');
    };
    if (wide) doc.addEventListener('pointerdown', outside, true);
    if (native) panel.addEventListener('toggle',toggle);
    return () => {
      if (wide) doc.removeEventListener('pointerdown', outside, true);
      if (wide && topLayerElement(doc) === panel) retainChoiceExit(panel);
      if (native) { panel.removeEventListener('toggle',toggle); panel.hidePopover(); }
      unposition?.();
      if (step && host) {
        delete host.dataset.choiceStep;
        if (previousTitle) host.setAttribute('aria-labelledby',previousTitle);
      }
      release(!ignoreReturn.current);
    };
  }, [host, wide, step, id]);

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    const panel = event.currentTarget;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); dismissTopLayer('escape',panel.ownerDocument); return;
    }
    const stops = event.key==='Tab' && wide && role==='dialog' ? Array.from(panel.querySelectorAll<HTMLElement>('button,input,textarea,[tabindex]'))
      .filter(el=>el.tabIndex>=0 && !el.matches(':disabled') && el.getClientRects().length) : [];
    const edge = event.shiftKey ? stops[0] : stops.at(-1);
    if (event.key === 'Tab' && wide && (role !== 'dialog' || !!panel.querySelector('[role="menu"]') || panel.ownerDocument.activeElement === edge)) {
      event.preventDefault(); event.stopPropagation(); requestLayerClose(panel, 'tab'); tabFromLayer(trigger.current, event.shiftKey); return;
    }
    const rows = Array.from(panel.querySelectorAll<HTMLElement>(rowSelector));
    if (!rows.length || role === 'dialog' && !panel.querySelector('[role="menu"]')) return;
    const index = rows.indexOf(panel.ownerDocument.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = rows[(index + 1) % rows.length];
    else if (event.key === 'ArrowUp') next = rows[index <= 0 ? rows.length - 1 : index-1];
    else if (event.key === 'Home' && !isTyping(event.target as Element)) next = rows[0];
    else if (event.key === 'End' && !isTyping(event.target as Element)) next = rows.at(-1);
    else if (event.key.length === 1 && event.key.trim() && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target as Element)) {
      const now = performance.now(), cache = typeAhead.current;
      const char = event.key.toLocaleLowerCase();
      const prefix = now - cache.at < 700 && cache.value !== char ? cache.value + char : char;
      typeAhead.current = {value:prefix, at:now};
      next = rows.slice(index+1).concat(rows.slice(0,index+1)).find(row => (row.getAttribute('aria-label') ?? row.textContent ?? '').trim().toLocaleLowerCase().startsWith(prefix));
    }
    if (next) { event.preventDefault(); event.stopPropagation(); next.focus({preventScroll:true}); next.scrollIntoView?.({block:'nearest'}); }
  }
  if (!wide && !step) return <Sheet open title={title} onClose={onClose} containFocus={containFocus}>
    <div onKeyDown={keys} role={role === 'menu' ? 'menu' : undefined} aria-label={role === 'menu' ? title : undefined}>{children}</div>
  </Sheet>;
  const content = <div ref={ref} className={step ? 'v7-choice-step' : 'v7-popover '+className} tabIndex={-1}
    role={step ? 'group' : role} aria-label={title} data-v7-lifted={wide ? '' : undefined}
    data-surface-role={step ? 'step' : 'S4'} onKeyDown={keys}>
    {step && <StepHeader title={title} id={id} onBack={onClose}/>}
    <div className={step ? 'v7-sheet-body' : 'v7-popover-body'}>{children}</div>
  </div>;
  return createPortal(content, host ?? document.body);
}
export function ChoiceSurface({open, ...props}: ChoiceProps & {open: boolean}) {
  return open ? <OpenChoice {...props}/> : null;
}
