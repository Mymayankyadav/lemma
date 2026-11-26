import {createContext, useContext, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {surfaceBetaEnabled} from '../../app/surfaceBeta';
import {ChevronLeft, X} from 'lucide-react';
import {Button, IconButton} from './components';
import {dismissTopLayer, isLayerHandoff, layerLauncher, registerLayer, requestLayerClose, topLayerElement, type DismissReason} from './layers';
import {finishChoiceExit, finishSheetExit, retainSheetExit} from './sheetPresence';
import './layers.css';

/** A phone selection step can render alongside the editor, outside its scrolling body, without losing its state. */
export const SheetHost = createContext<HTMLDialogElement | null>(null);
const InDialog = createContext(false);

/** Replace only the presentation. The owner and any hidden draft fields stay mounted. */
export function presentSheetStep(host: HTMLDialogElement, panel: HTMLElement, titleId: string) {
  const previousTitle = host.getAttribute('aria-labelledby');
  const previous = host.querySelector<HTMLElement>(':scope > [data-current-step]');
  previous?.removeAttribute('data-current-step');
  if (previous) previous.hidden = true;
  host.dataset.choiceStep = '';
  panel.dataset.currentStep = '';
  host.setAttribute('aria-labelledby',titleId);
  return () => {
    delete panel.dataset.currentStep;
    if (previous?.isConnected) {previous.hidden = false; previous.dataset.currentStep = '';}
    else delete host.dataset.choiceStep;
    if (previousTitle) host.setAttribute('aria-labelledby',previousTitle);
  };
}

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
  historyEntry?: boolean;
  returnTarget?: () => HTMLElement | null;
  surfaceRole?: 'S3' | 'S5';
}
function presentation(open:boolean,owner:HTMLDialogElement|null) {
  const beta = open && surfaceBetaEnabled();
  const current = beta ? topLayerElement()?.closest<HTMLDialogElement>('dialog[open]') : null;
  const parent = current?.hasAttribute('data-v7-lifted') ? current : beta ? owner : null;
  return {open,beta,stepHost:parent?.hasAttribute('data-v7-lifted') ? parent : null};
}
export function Sheet(props: SheetProps) {
  const owner = useContext(SheetHost), nested = useContext(InDialog);
  // React mounts child effects first. Open the native owner before presenting a pre-opened descendant.
  if (props.open && nested && !owner) return null;
  return <BoundSheet {...props} owner={owner}/>;
}
function BoundSheet({owner,...props}:SheetProps & {owner:HTMLDialogElement|null}) {
  const [session,setSession] = useState(() => presentation(props.open,owner));
  // An open editor retains its DOM, draft and trigger while this device's preference changes.
  if (session.open !== props.open) {
    setSession(presentation(props.open,owner));
  }
  return session.stepHost && props.open ? <EmbeddedSheet {...props} host={session.stepHost}/>
    : <DialogSheet {...props} beta={session.beta}/>;
}

/** At modal depth two, an editor or discard alert occupies the current card instead of adding another scrim. */
function EmbeddedSheet({host,...props}: SheetProps & {host: HTMLDialogElement}) {
  const id = useId(), ref = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [guard,setGuard] = useState(false);
  useLayoutEffect(() => {
    const panel = ref.current!;
    const trigger = layerLauncher(host.ownerDocument);
    const restore = presentSheetStep(host,panel,id);
    const release = registerLayer({element:panel,role:'step',owner:host,trigger,
      dirty:() => !!latest.current.dirty, historyEntry:() => !!latest.current.historyEntry,
      returnTarget:() => latest.current.returnTarget?.() ?? null, dismiss: reason => {
        const current = latest.current;
        if (current.onBack && (reason === 'escape' || reason === 'back')) current.onBack();
        else if (current.dirty) {if (current.onRequestDiscard) current.onRequestDiscard(); else setGuard(true);}
        else current.onClose();
      }});
    (panel.querySelector<HTMLElement>('[data-v7-autofocus="true"]') ?? panel.querySelector<HTMLElement>('h2'))?.focus({preventScroll:true});
    return () => {restore(); release();};
  },[host,id]);
  return createPortal(<SheetHost.Provider value={host}>
    <div ref={ref} className="v7-choice-step" role={props.surfaceRole === 'S5' ? 'alertdialog' : 'group'} aria-labelledby={id}>
      <header className="v7-sheet-header">
        {props.onBack && <IconButton label="Back" onClick={props.onBack}><ChevronLeft/></IconButton>}
        <div className="v7-sheet-heading">{props.eyebrow && <p className="v7-eyebrow">{props.eyebrow}</p>}
          <h2 id={id} className={props.hideTitle ? 'v7-sr-only' : 'v7-sheet-title'} tabIndex={-1}>{props.title}</h2></div>
        <IconButton label={props.closeLabel ?? 'Close'} onClick={() => ref.current && requestLayerClose(ref.current,'close')}><X/></IconButton>
      </header>
      <div className="v7-sheet-body">{props.children}</div>
      {props.footer && <footer className="v7-sheet-footer">{props.footer}</footer>}
    </div>
    {guard && <DiscardSheet onKeep={() => setGuard(false)} onDiscard={latest.current.onClose}/>}
  </SheetHost.Provider>,host);
}

function DiscardSheet({onKeep,onDiscard}: {onKeep:() => void;onDiscard:() => void}) {
  return <Sheet open onClose={onKeep} title="Discard changes?" surfaceRole="S5"
    footer={<><Button data-v7-autofocus="true" onClick={onKeep}>Keep editing</Button>
      <Button destructive onClick={onDiscard}>Discard changes</Button></>}>
    <p>Your unsaved changes will be lost.</p>
  </Sheet>;
}

function DialogSheet(props: SheetProps & {beta: boolean}) {
  const {open, title, children, full, className, hideTitle, focusTitle, containFocus = true, eyebrow, footer, surfaceRole = 'S3'} = props;
  const ref = useRef<HTMLDialogElement>(null), id = useId();
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
      dirty:() => !!latest.current.dirty, historyEntry:() => !!latest.current.historyEntry,
      returnTarget:() => latest.current.returnTarget?.() ?? null, dismiss});
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open','');
    const focus = dialog.querySelector<HTMLElement>('[data-v7-autofocus="true"]') ??
      (surfaceRole === 'S5' ? dialog.querySelector<HTMLElement>('.v7-sheet-footer button:not(.v7-danger)') : null);
    focus?.focus({preventScroll:true});
    setHost(dialog);
    return () => {
      if (props.beta && topLayerElement(doc) === dialog && !isLayerHandoff(doc)) retainSheetExit(dialog);
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      release();
    };
  }, [open, surfaceRole, props.beta]);
  return <dialog ref={ref} className={`v7-sheet${full ? ' v7-sheet-full' : ''}${className ? ' '+className : ''}`}
    aria-labelledby={id} data-surface-role={surfaceRole} data-beta-sheet={props.beta ? '' : undefined}
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
    {(open || host) && <InDialog.Provider value><SheetHost.Provider value={host}>
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
      {open && guard && <DiscardSheet onKeep={() => setGuard(false)} onDiscard={() => {setGuard(false); latest.current.onClose();}}/>}
    </SheetHost.Provider></InDialog.Provider>}
  </dialog>;
}

export function StepHeader({title, id, onBack}: {title: string; id: string; onBack: () => void}) {
  return <header className="v7-sheet-header v7-step-header">
    <IconButton label="Back" onClick={onBack}><ChevronLeft aria-hidden="true"/></IconButton>
    <h2 id={id} className="v7-sheet-title">{title}</h2>
  </header>;
}
