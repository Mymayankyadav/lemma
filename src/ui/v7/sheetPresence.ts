import {motionReduced} from './effects';
import {durations} from './motion';

const exiting = new WeakMap<Document, () => void>();
export function finishSheetExit(doc: Document): boolean {
  const finish = exiting.get(doc);
  finish?.();
  return !!finish;
}

/** React may remove the editor immediately. Retain only its inert, inaccessible pixels for the exit. */
export function retainSheetExit(dialog: HTMLDialogElement) {
  const doc = dialog.ownerDocument;
  finishSheetExit(doc);
  finishChoiceExit(doc);
  if (motionReduced() || !dialog.open || !dialog.isConnected) return;
  const box = dialog.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const curtain = doc.createElement('div');
  curtain.className = 'v7-layer-exit';
  curtain.setAttribute('data-layer-exit', '');
  curtain.setAttribute('aria-hidden', 'true');
  curtain.addEventListener('pointerdown', event => event.preventDefault());
  curtain.addEventListener('click', event => {event.stopPropagation(); event.preventDefault();});
  // A manual popover can cover the remaining parent dialog but never takes modal focus.
  const native = typeof curtain.showPopover === 'function';
  if (native) curtain.popover = 'manual';
  const panel = doc.createElement('div');
  panel.className = dialog.className + ' v7-exiting-panel';
  panel.inert = true;
  const copy = dialog.cloneNode(true) as HTMLDialogElement;
  copy.querySelectorAll('dialog, [data-surface-role="S4"], [data-layer-exit]').forEach(el => el.remove());
  copy.querySelectorAll('[id], [autofocus], [name]').forEach(el => {
    el.removeAttribute('id'); el.removeAttribute('autofocus'); el.removeAttribute('name');
  });
  panel.append(...Array.from(copy.childNodes));
  Object.assign(panel.style, {left: box.left+'px', top: box.top+'px', width: box.width+'px', height: box.height+'px'});
  if (dialog.hasAttribute('data-v7-lifted')) {
    panel.setAttribute('data-v7-lifted','');
    curtain.dataset.child = '';
  }
  curtain.append(panel);
  doc.body.append(curtain);
  if (native) curtain.showPopover();
  const timer = window.setTimeout(finish, durations.dismissMax * 1000);
  function finish() {
    window.clearTimeout(timer);
    curtain.remove();
    exiting.delete(doc);
  }
  exiting.set(doc, finish);
  panel.addEventListener('animationend', event => { if (event.target === panel) finish(); });
}

const fadingChoices = new WeakMap<Document, () => void>();
export function finishChoiceExit(doc: Document) { fadingChoices.get(doc)?.(); }
export function retainChoiceExit(panel: HTMLElement) {
  const doc = panel.ownerDocument;
  if (motionReduced() || !panel.isConnected) return;
  const box = panel.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const copy = panel.cloneNode(true) as HTMLElement;
  copy.removeAttribute('data-surface-role'); copy.removeAttribute('data-layer-active'); copy.removeAttribute('role');
  copy.removeAttribute('id'); copy.removeAttribute('tabindex');
  copy.querySelectorAll('[id],[autofocus],[name]').forEach(el => {el.removeAttribute('id');el.removeAttribute('autofocus');el.removeAttribute('name');});
  copy.setAttribute('aria-hidden','true');
  copy.inert = true;
  copy.dataset.choiceExit = '';
  Object.assign(copy.style, {left:box.left+'px',top:box.top+'px',bottom:'auto',width:box.width+'px',height:box.height+'px'});
  const native = typeof copy.showPopover === 'function';
  if (native) copy.popover='manual';
  doc.body.append(copy);
  if (native) copy.showPopover();
  const timeout = setTimeout(finish, durations.dismissMax*1000);
  function finish() {
    clearTimeout(timeout); copy.remove(); fadingChoices.delete(doc);
  }
  fadingChoices.set(doc,finish);
  copy.addEventListener('animationend', event=>{if(event.target===copy)finish();});
}
