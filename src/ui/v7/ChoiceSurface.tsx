import {useContext, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Sheet, SheetHost, StepHeader, presentSheetStep} from './Sheet';
import {surfaceBetaEnabled} from '../../app/surfaceBeta';
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
  const host = trigger.closest<HTMLDialogElement>('dialog[open]');
  const header = host?.querySelector<HTMLElement>(':scope > .v7-sheet-header');
  const footer = host ? host.querySelector<HTMLElement>(':scope > .v7-sheet-footer')
    : trigger.closest('main')?.querySelector<HTMLElement>('.v7-pinned-dock');
  const viewport = win.visualViewport;
  function measure() {
    // Rectangles use viewport pixels. CSS zoom also scales lengths assigned to the popover.
    const scale = (panel as HTMLElement & {currentCSSZoom?:number}).currentCSSZoom
      || (panel.offsetWidth ? panel.getBoundingClientRect().width/panel.offsetWidth : 1) || 1;
    const box = trigger.getBoundingClientRect(), edge = 8*scale, gap = 4*scale;
    const originX = viewport?.offsetLeft ?? 0, originY = viewport?.offsetTop ?? 0;
    const vw = viewport?.width ?? win.innerWidth, vh = viewport?.height ?? win.innerHeight;
    const hostBox = host?.getBoundingClientRect();
    const minX = Math.max(originX,hostBox?.left ?? originX) + edge;
    const maxX = Math.min(originX + vw,hostBox?.right ?? originX + vw) - edge;
    const minY = Math.max(originY,header?.getBoundingClientRect().bottom ?? hostBox?.top ?? originY) + edge;
    const maxY = Math.min(originY + vh,footer?.getBoundingClientRect().top ?? hostBox?.bottom ?? originY + vh) - edge;
    const width = Math.max(1,Math.min(Math.max(240*scale,box.width),360*scale,maxX-minX));
    const rtl = getComputedStyle(trigger).direction === 'rtl';
    const aligned = rtl ? box.right-width : box.left;
    const left = Math.max(minX,Math.min(aligned,maxX-width));
    const belowStart = Math.min(maxY,Math.max(minY,box.bottom+gap));
    const aboveEnd = Math.max(minY,Math.min(maxY,box.top-gap));
    const below = maxY-belowStart, above = aboveEnd-minY, limit = Math.min(vh*.6,420*scale);
    panel.style.width = width/scale+'px';
    const up = below < Math.min((panel.scrollHeight+2)*scale,limit) && above>below;
    panel.style.maxHeight = Math.max(1,Math.min(limit,up?above:below)/scale)+'px';
    panel.style.left = anchors && !rtl && left===box.left ? 'anchor(left)' : left/scale+'px';
    panel.style.top = up ? 'auto' : anchors && belowStart===box.bottom+gap ? 'calc(anchor(bottom) + 4px)' : belowStart/scale+'px';
    panel.style.bottom = !up ? 'auto' : anchors && aboveEnd===box.top-gap ? 'calc(anchor(top) + 4px)' : (win.innerHeight-aboveEnd)/scale+'px';
  }
  measure();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  for (const node of [trigger,panel,host,header,footer]) if (node) observer?.observe(node);
  win.addEventListener('resize',measure);
  win.addEventListener('scroll',measure,true);
  viewport?.addEventListener('resize',measure);
  viewport?.addEventListener('scroll',measure);
  return () => {
    observer?.disconnect(); win.removeEventListener('resize',measure); win.removeEventListener('scroll',measure,true);
    viewport?.removeEventListener('resize',measure); viewport?.removeEventListener('scroll',measure);
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
  // Keep the presentation of an open chooser stable if the preference changes in another tab.
  const [beta] = useState(surfaceBetaEnabled);
  const step = beta && !!host && !wide;
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const doc = panel.ownerDocument;
    const launcher = latest.current.anchor?.() ?? layerLauncher(doc);
    trigger.current = launcher;
    const owner = host ?? topLayerElement(doc);
    finishChoiceExit(doc);
    const native = beta && wide && typeof panel.showPopover === 'function';
    const restoreStep = step && host ? presentSheetStep(host,panel,id) : undefined;
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
      if (beta && wide && topLayerElement(doc) === panel) retainChoiceExit(panel);
      if (native) { panel.removeEventListener('toggle',toggle); panel.hidePopover(); }
      unposition?.();
      restoreStep?.();
      release(!ignoreReturn.current);
    };
  }, [host, wide, step, id, beta]);

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    const panel = event.currentTarget;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); dismissTopLayer('escape',panel.ownerDocument); return;
    }
    if (event.key === 'Tab' && wide) {
      const active = panel.ownerDocument.activeElement;
      const search = role === 'listbox' ? panel.querySelector<HTMLInputElement>('input[type="search"]') : null;
      if (search) {
        const rows = Array.from(panel.querySelectorAll<HTMLElement>(rowSelector));
        const option = rows.find(row=>row.getAttribute('aria-selected') === 'true') ?? rows[0];
        const next = event.shiftKey && active?.matches(rowSelector) ? search
          : !event.shiftKey && active === search ? option : undefined;
        if (next) {
          event.preventDefault(); event.stopPropagation();
          next.focus({preventScroll:true}); next.scrollIntoView?.({block:'nearest'});
          return;
        }
      }
      if (role === 'dialog' && !panel.querySelector('[role="menu"]')) {
        const stops = Array.from(panel.querySelectorAll<HTMLElement>('button,input,textarea,[tabindex]'))
          .filter(el=>el.tabIndex>=0 && !el.matches(':disabled') && el.getClientRects().length);
        const edge = event.shiftKey ? stops[0] : stops.at(-1);
        if (active !== edge) return;
      }
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
