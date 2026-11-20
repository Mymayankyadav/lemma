import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {LocalPadEditor} from '../../../src/features/pad/LocalPadEditor';
import {PAD_SLOT, padEdit, type PadEdit} from '../../../src/features/pad/padEdit';
import {PAD_NOTE_MAX} from '../../../src/features/pad/padDraftStore';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT:true});
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();});
function Harness({initial = padEdit(''), onEdit = () => {}, preference}: {
  initial?: PadEdit; onEdit?: (edit: PadEdit) => void; preference?: string;
}) {
  const [value, setValue] = useState(initial);
  return <LocalPadEditor value={value} onEdit={edit => {setValue(edit); onEdit(edit);}} keyboardPreferenceKey={preference}/>;
}
const button = (name: string) => [...host.querySelectorAll('button')]
  .find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;
const field = () => host.querySelector('textarea')!;
const click = (name: string) => act(async () => button(name).click());
function input(text: string) {
  const node = field();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, text);
  node.setSelectionRange(text.length, text.length);
  node.dispatchEvent(new InputEvent('input', {bubbles:true, data:text}));
}
const compose = (type: 'compositionstart' | 'compositionend') => act(async () =>
  field().dispatchEvent(new CompositionEvent(type, {bubbles:true})));

test('uses the current native selection for templates, text undo/redo and hardware shortcuts', async () => {
  await act(async () => root.render(<Harness initial={padEdit('a x b')}/>));
  await act(async () => {field().focus(); field().setSelectionRange(2, 3);});
  await click('Fraction');
  expect(field().value).toBe('a \\(\\frac{x}{' + PAD_SLOT + '}\\) b');
  expect(field().value.slice(field().selectionStart, field().selectionEnd)).toBe(PAD_SLOT);
  expect(field().inputMode).toBe('none');
  await click('Numbers'); await click('2');
  expect(field().value).toBe('a \\(\\frac{x}{2}\\) b');
  await click('Undo text');
  expect(field().value).toContain(PAD_SLOT);
  await act(async () => field().dispatchEvent(new KeyboardEvent('keydown', {key:'z',ctrlKey:true,bubbles:true,cancelable:true})));
  expect(field().value).toBe('a x b');
  expect([field().selectionStart,field().selectionEnd]).toEqual([2,3]);
  expect(button('Redo text').disabled).toBe(false);
  await act(async () => field().dispatchEvent(new KeyboardEvent('keydown', {key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true})));
  expect(field().value).toContain(PAD_SLOT);
  await click('Redo text');
  expect(field().value).toBe('a \\(\\frac{x}{2}\\) b');
  expect(button('Redo text').disabled).toBe(true);
  expect(document.activeElement).toBe(field());
});

test('provides grouped algebra/calculus/geometry keys with keyboard-operable tabs', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => {
    button('Symbols').focus();
    button('Symbols').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true,cancelable:true}));
  });
  expect(document.activeElement).toBe(button('Numbers'));
  expect(button('Numbers').getAttribute('aria-selected')).toBe('true');
  await click('Algebra'); await click('Alpha');
  expect(field().value).toBe('α');
  await click('Calculus'); await click('Integral');
  expect(field().value).toBe('α∫');
  await click('Geometry'); await click('Theta');
  expect(field().value).toBe('α∫θ');
  await click('Enter'); await click('Space');
  expect(field().value).toBe('α∫θ\n ');
  await click('Line start'); await click('Backspace');
  expect(field().value).toBe('α∫θ ');
  await click('Cursor left');
  expect(field().selectionStart).toBe(2);
});

test('commits IME once, leaves candidates intact and never applies a math key during composition', async () => {
  const edits = vi.fn();
  await act(async () => root.render(<Harness initial={padEdit('Proof: ')} onEdit={edits}/>));
  await compose('compositionstart');
  await act(async () => input('Proof: 証'));
  await act(async () => input('Proof: 証明'));
  expect(edits).not.toHaveBeenCalled();
  expect(field().value).toBe('Proof: 証明');
  expect(button('Fraction').disabled).toBe(true);
  expect(button('Undo text').disabled).toBe(true);
  await click('Fraction');
  expect(field().value).toBe('Proof: 証明');
  await compose('compositionend');
  expect(edits).toHaveBeenCalledTimes(1);
  await click('Undo text');
  expect(field().value).toBe('Proof: ');
  await click('Redo text');
  expect(field().value).toBe('Proof: 証明');
});

test('rejects oversized paste, symbols and templates atomically but accepts the exact storage limit', async () => {
  const edits = vi.fn(), initial = 'x'.repeat(PAD_NOTE_MAX - 1);
  await act(async () => root.render(<Harness initial={padEdit(initial)} onEdit={edits}/>));
  await act(async () => input(initial + 'too long'));
  expect(field().value).toBe(initial);
  expect(edits).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Pad notes can contain up to 65,536 characters. That edit was not added.');
  await click('Infinity');
  expect(field().value).toBe(initial + '∞');
  expect(field().value.length).toBe(PAD_NOTE_MAX);
  expect(host.textContent).not.toContain('That edit was not added.');
  await click('Fraction');
  expect(field().value).toBe(initial + '∞');
  expect(host.textContent).toContain('That edit was not added.');
  await click('Infinity');
  expect(field().value).toBe(initial + '∞');
  await click('Undo text');
  expect(field().value).toBe(initial);
  await act(async () => input('a'.repeat(PAD_NOTE_MAX)));
  expect(field().value.length).toBe(PAD_NOTE_MAX);
  expect(field().value).toBe('a'.repeat(PAD_NOTE_MAX));
});

test('keeps an over-limit IME candidate until composition ends, then restores the complete prior edit', async () => {
  const edits = vi.fn(), initial = 'x'.repeat(PAD_NOTE_MAX - 1);
  await act(async () => root.render(<Harness initial={padEdit(initial)} onEdit={edits}/>));
  await compose('compositionstart');
  await act(async () => input(initial + '証明'));
  expect(field().value).toBe(initial + '証明');
  expect(edits).not.toHaveBeenCalled();
  await compose('compositionend');
  expect(field().value).toBe(initial);
  expect(edits).not.toHaveBeenCalled();
  expect(host.textContent).toContain('That edit was not added.');
  await compose('compositionstart');
  await act(async () => input(initial + '証'));
  await compose('compositionend');
  expect(field().value.length).toBe(PAD_NOTE_MAX);
  expect(edits).toHaveBeenCalledTimes(1);
});

test('persists only visibility for the supplied editor and works when preference storage is unavailable', async () => {
  const key = 'lemma.device-pad.v1:owner:keyboard:checkpoint-a';
  await act(async () => root.render(<Harness key="a" initial={padEdit('private notes')} preference={key}/>));
  await click('Hide math keyboard');
  expect(localStorage.getItem(key)).toBe('hidden');
  expect(field().inputMode).toBe('text');
  await act(async () => root.render(<Harness key="b" preference={key}/>));
  expect(button('Show math keyboard')).toBeTruthy();
  expect(host.querySelector('.pad-keyboard-body')?.hasAttribute('hidden')).toBe(true);
  await act(async () => root.render(<Harness key="c" preference={key + '-other'}/>));
  expect(button('Hide math keyboard')).toBeTruthy();
  expect(JSON.stringify({...localStorage})).not.toContain('private notes');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw new DOMException('blocked');});
  await click('Hide math keyboard'); await click('Show math keyboard');
  expect(host.querySelector('.pad-keyboard-body')?.hasAttribute('hidden')).toBe(false);
});

test('collapses custom keys when the device keyboard occupies the viewport and switches only on request', async () => {
  const viewport = Object.assign(new EventTarget(), {height:844,offsetTop:0});
  vi.stubGlobal('visualViewport', viewport);
  await act(async () => root.render(<Harness initial={padEdit('abc',1)}/>));
  await act(async () => {field().focus(); viewport.height = 300; viewport.dispatchEvent(new Event('resize'));});
  expect(host.querySelector('.pad-keyboard-body')?.hasAttribute('hidden')).toBe(true);
  expect(field().inputMode).toBe('text');
  await click('Use math keyboard');
  expect(field().inputMode).toBe('none');
  expect(host.querySelector('.pad-keyboard-body')?.hasAttribute('hidden')).toBe(false);
  expect(field().value).toBe('abc');
  expect(field().selectionStart).toBe(1);
  await click('Use device keyboard');
  expect(field().inputMode).toBe('text');
  expect(host.querySelector('.pad-keyboard-body')?.hasAttribute('hidden')).toBe(true);
  expect(field().value).toBe('abc');
});

test('keeps native-keyboard suppression through adjustResize rotation until close or blur', async () => {
  const viewport = Object.assign(new EventTarget(), {height:844,offsetTop:0});
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844);
  const hidden = () => host.querySelector('.pad-keyboard-body')?.hasAttribute('hidden');
  async function resize(width: number, height: number) {
    await act(async () => {
      window.innerWidth = width; window.innerHeight = height; viewport.height = height;
      window.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('resize'));
    });
  }
  await act(async () => root.render(<Harness initial={padEdit('Keep the caret', 5)}/>));
  await act(async () => field().focus());
  await resize(390, 300); // Android resizes both its layout and visual viewports.
  expect(hidden()).toBe(true);
  await resize(844, 180);
  expect(hidden()).toBe(true);
  await resize(390, 350);
  expect(hidden()).toBe(true);
  await resize(390, 844); // Dismissing the IME can leave the textarea focused.
  expect(document.activeElement).toBe(field());
  expect(hidden()).toBe(false);
  await resize(390, 300);
  expect(hidden()).toBe(true);
  await resize(844, 180);
  expect(hidden()).toBe(true);
  await resize(844, 390);
  expect(hidden()).toBe(false);
  await resize(844, 170);
  expect(hidden()).toBe(true);
  await act(async () => field().blur());
  expect(hidden()).toBe(false);
  expect(field().value).toBe('Keep the caret');
  expect(field().selectionStart).toBe(5);
});
