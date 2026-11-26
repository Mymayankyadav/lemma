import {createContext, useContext, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode} from 'react';
import {ChevronLeft, X} from 'lucide-react';
import {Button, IconButton} from './components';
import {dismissTopLayer, isLayerHandoff, layerLauncher, registerLayer, requestLayerClose, topLayerElement, type DismissReason} from './layers';
import {finishChoiceExit, finishSheetExit, retainSheetExit} from './sheetPresence';
import './layers.css';

/** A phone selection step can render alongside the editor, outside its scrolling body, without losing its state. */
export const SheetHost = createContext<HTMLDialogElement | null>(null);

function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget, active = dialog.ownerDocument.activeElement;
  if (active?.closest('dialog') !== dialog) return;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
    .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.closest('dialog') === dialog
      && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible');
  const radio = (el: Element | null | undefined) => el instanceof HTMLInputElement && el.type === 'radio' ? el.name : '';
  const first = controls[0], last = controls.at(-1), edge = event.shiftKey ? first : last;
  if (edge && active !== edge && !(radio(edge) && radio(active) === radio(edge))
    && !(event.shiftKey && active instanceof HTMLElement && active.tabIndex < 0)) return;
  event.preventDefault();
  const opposite = event.shiftKey ? last : first;
  (controls.find(el => radio(opposite) && radio(el) === radio(opposite) && el.matches(':checked')) ?? opposite ?? dialog).focus();
}

export interface SheetProps {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode;
  eyebrow?: string; footer?: ReactNode; full?: boolean; className?: string;
  hideTitle?: boolean; closeLabel?: string; focusTitle?: boolean; containFocus?: boolean;
  dirty?: boolean; onRequestDiscard?: () => void; onBack?: () => void;
  returnTarget?: () => HTMLElement | null;
  surfaceRole?: 'S3' | 'S5';
}
export function Sheet(props: SheetProps) {
  const {open, title, children, full, className, hideTitle, focusTitle, containFocus = true, eyebrow, footer, surfaceRole = 'S3'} = props;
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const owner = useContext(SheetHost);
  const [host, setHost] = useState<HTMLDialogElement | null>(null);
  const [guard, setGuard] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) {
      setHost(null);
      setGuard(false);
      return;
    }
    const doc = dialog.ownerDocument;
    const trigger = layerLauncher(doc);
    const parent = topLayerElement(doc);
    finishChoiceExit(doc);
    const continuing = finishSheetExit(doc) || isLayerHandoff(doc);
    dialog.toggleAttribute('data-layer-handoff', continuing);
    dialog.toggleAttribute('data-v7-lifted', !!parent?.closest('dialog[open]') || !!dialog.parentElement?.closest('dialog[open]'));
    function dismiss(reason: DismissReason) {
      const current = latest.current;
      if (current.onBack && (reason === 'back' || reason === 'escape')) { current.onBack(); return; }
      if (current.dirty) {
        if (current.onRequestDiscard) current.onRequestDiscard();
        else setGuard(true);
        return;
      }
      current.onClose();
    }
    const release = registerLayer({element:dialog, role:surfaceRole, owner:parent, trigger,
      dirty:() => !!latest.current.dirty, returnTarget:() => latest.current.returnTarget?.() ?? null, dismiss});
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open','');
    const focus = dialog.querySelector<HTMLElement>('[data-v7-autofocus="true"]') ??
      (surfaceRole === 'S5' ? dialog.querySelector<HTMLElement>('.v7-sheet-footer button:not(.v7-danger)') : null);
    focus?.focus({preventScroll:true});
    setHost(dialog);
    return () => {
      if (topLayerElement(doc) === dialog) retainSheetExit(dialog);
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      release();
    };
  }, [open, surfaceRole]);
  return <dialog ref={ref} className={`v7-sheet${full ? ' v7-sheet-full' : ''}${className ? ' '+className : ''}`}
    aria-labelledby={id} data-surface-role={surfaceRole}
    onKeyDown={event => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest('dialog') !== event.currentTarget) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); dismissTopLayer('escape', event.currentTarget.ownerDocument);
      } else if (containFocus && event.key === 'Tab') trapTab(event);
    }}
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); event.stopPropagation(); dismissTopLayer('escape', event.currentTarget.ownerDocument);
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)
        requestLayerClose(event.currentTarget, 'backdrop');
    }}>
    {(open || host) && <SheetHost.Provider value={host ?? owner}>
      <div className="v7-grabber" />
      <header className="v7-sheet-header">
        {props.onBack && <IconButton label="Back" onClick={props.onBack}><ChevronLeft aria-hidden="true"/></IconButton>}
        <div className="v7-sheet-heading">
          {eyebrow && <p className="v7-eyebrow">{eyebrow}</p>}
          <h2 id={id} className={hideTitle ? 'v7-sr-only' : 'v7-sheet-title'} tabIndex={focusTitle ? -1 : undefined}
            data-v7-autofocus={focusTitle ? 'true' : undefined}>{title}</h2>
        </div>
        <IconButton label={props.closeLabel ?? 'Close'} onClick={() => ref.current && requestLayerClose(ref.current, 'close')}><X /></IconButton>
      </header>
      <div className="v7-sheet-body">{children}</div>
      {footer && <footer className="v7-sheet-footer">{footer}</footer>}
      {open && guard && <Sheet open onClose={() => setGuard(false)} title="Discard changes?" surfaceRole="S5"
        footer={<><Button data-v7-autofocus="true" onClick={() => setGuard(false)}>Keep editing</Button>
          <Button destructive onClick={() => {setGuard(false); latest.current.onClose();}}>Discard changes</Button></>}>
        <p>Your unsaved changes will be lost.</p>
      </Sheet>}
    </SheetHost.Provider>}
  </dialog>;
}

export function StepHeader({title, id, onBack}: {title: string; id: string; onBack: () => void}) {
  return <header className="v7-sheet-header v7-step-header">
    <IconButton label="Back" onClick={onBack}><ChevronLeft aria-hidden="true"/></IconButton>
    <h2 id={id} className="v7-sheet-title">{title}</h2>
  </header>;
}
