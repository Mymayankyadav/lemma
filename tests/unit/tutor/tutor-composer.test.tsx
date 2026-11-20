import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {TutorComposer} from '../../../src/features/tutor/TutorComposer';
import {setHapticsEnabled} from '../../../src/ui/v7/haptics';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setHapticsEnabled(true);
});
function Harness({initial = '', onSend = () => {}, onAsk = () => {}, onChange = () => {},
  onConnection = () => {}, hintLevel, pending = false}: {
  initial?: string; onSend?: (text: string) => void; onAsk?: (kind: 'hint' | 'stuck' | 'notation') => void;
  onChange?: (value: string) => void; onConnection?: () => void; hintLevel?: number; pending?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return <TutorComposer value={value} onChange={text => {setValue(text); onChange(text);}} onSend={onSend} onAsk={onAsk}
    canSend={!pending} readOnly={false} pending={pending} hasContext={false} hintLevel={hintLevel}
    onContext={() => {}} onConnection={onConnection}
    notationContext={['What is the preimage f⁻¹(B)?']}/>;
}
const button = (name: string, group: ParentNode = host) => [...group.querySelectorAll('button')]
  .find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;
const field = () => host.querySelector('textarea')!;
const click = (name: string, group?: ParentNode) => act(async () => button(name, group).click());
const keyboard = () => host.querySelector('.rows')!;
const suggestion = () => host.querySelector('.sugg')!;
const key = (name: string, modifiers: KeyboardEventInit = {}) => act(async () => {
  field().dispatchEvent(new KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true, ...modifiers}));
});
const input = (value: string) => act(async () => {
  const node = field();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, value);
  node.setSelectionRange(value.length, value.length);
  node.dispatchEvent(new InputEvent('input', {bubbles: true, data: value}));
});

test('uses the native caret for math templates, offers each slot and restores selections with undo', async () => {
  const onSend = vi.fn();
  await act(async () => root.render(<Harness initial="Let a." onSend={onSend}/>));
  await act(async () => {field().focus(); field().setSelectionRange(4, 5);});
  await click('Symbols');
  await click('Sets', keyboard());
  await click('{ | }', keyboard());
  expect(field().value).toBe('Let {□ | □}.');
  expect([field().selectionStart, field().selectionEnd]).toEqual([5, 6]);
  expect(button('Send').disabled).toBe(true);
  await key('Tab');
  expect([field().selectionStart, field().selectionEnd]).toEqual([9, 10]);
  await click('ABC', keyboard());
  await click('y', keyboard());
  await click('Next □');
  await click('x', keyboard());
  expect(field().value).toBe('Let {x | y}.');
  await key('z', {ctrlKey: true});
  expect(field().value).toBe('Let {□ | y}.');
  await key('z', {ctrlKey: true, shiftKey: true});
  await key('Enter', {metaKey: true});
  expect(onSend).toHaveBeenCalledWith('Let {x | y}.');
  await click('Maths symbols', keyboard());
  expect(button('Sets', keyboard()).getAttribute('aria-pressed')).toBe('true');
});

test('completes proof notation and asks for help without consuming a draft', async () => {
  const onSend = vi.fn();
  const onAsk = vi.fn();
  await act(async () => root.render(<Harness onAsk={onAsk} onSend={onSend}/>));
  expect(button('f⁻¹(B)', suggestion())).toBeDefined();
  await act(async () => field().focus());
  await input('prei');
  await click('preimage', suggestion());
  expect(field().value).toBe('preimage ');
  await input('for all');
  await key(' ');
  expect(field().value).toBe('∀ ');
  await click('Undo');
  expect(field().value).toBe('for all');
  await click('Hint 1/4');
  await click('Stuck');
  await click('Ask');
  expect(onAsk.mock.calls).toEqual([['hint'], ['stuck'], ['notation']]);
  expect(onSend).not.toHaveBeenCalled();
  expect(field().value).toBe('for all');
});

test('shows both numeric layouts and permits a one-step native IME edit', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<Harness onChange={onChange}/>));
  await click('?123', keyboard());
  await click('=\\<', keyboard());
  await click('²', keyboard());
  await click('Hide keyboard');
  expect(host.querySelector('.rows')).toBeNull();
  await click('Show keyboard');
  await click('Use device keyboard');
  expect(field().inputMode).toBe('text');
  onChange.mockClear();
  const compose = (type: 'compositionstart' | 'compositionend') => act(async () =>
    field().dispatchEvent(new CompositionEvent(type, {bubbles: true})));
  await compose('compositionstart');
  await input('²証');
  await input('²証明');
  expect(onChange).not.toHaveBeenCalled();
  expect(field().value).toBe('²証明');
  await compose('compositionend');
  expect(onChange.mock.calls).toEqual([['²証明']]);
  await key('z', {ctrlKey: true});
  expect(field().value).toBe('²');
});

test('touch holds choose the small digit and repeat Delete without a trailing duplicate', async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<Harness initial="abc"/>));
  const press = (name: string, type: 'pointerdown' | 'pointerup' | 'pointercancel') => act(async () =>
    button(name, keyboard()).dispatchEvent(new PointerEvent(type, {pointerId: 1, isPrimary: true, button: 0, bubbles: true, pointerType: 'touch'})));
  const trailingClick = (name: string) => act(async () =>
    button(name, keyboard()).dispatchEvent(new MouseEvent('click', {detail: 1, bubbles: true})));
  await press('q', 'pointerdown');
  await act(async () => vi.advanceTimersByTime(390));
  await press('q', 'pointerup');
  await trailingClick('q');
  expect(field().value).toBe('abc1');
  await press('Delete', 'pointerdown');
  expect(field().value).toBe('abc');
  await act(async () => vi.advanceTimersByTime(430));
  await press('Delete', 'pointerup');
  await trailingClick('Delete');
  expect(field().value).toBe('ab');
});

test('shows connection recovery instead of Ask while the tutor is responding', async () => {
  const onAsk = vi.fn();
  const onConnection = vi.fn();
  await act(async () => root.render(<Harness initial="Unfinished □" onAsk={onAsk} onConnection={onConnection} hintLevel={3}/>));
  expect(button('Hint 3/4').disabled).toBe(false);
  await click('Ask');
  expect(onAsk.mock.calls).toEqual([['notation']]);
  expect(field().value).toBe('Unfinished □');
  await act(async () => root.render(<Harness onAsk={onAsk} onConnection={onConnection} hintLevel={3} pending/>));
  expect(button('Ask')).toBeUndefined();
  expect(button('Hint 3/4').disabled).toBe(true);
  await click('Connect');
  expect(onConnection).toHaveBeenCalledTimes(1);
  expect(onAsk).toHaveBeenCalledTimes(1);
  expect(field().value).toBe('Unfinished □');
});

test('keeps the conversation open on a compact phone and reveals the math keyboard on demand', async () => {
  vi.stubGlobal('innerWidth', 360);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 510));
  await act(async () => root.render(<div className="lemma-tutor"><Harness/></div>));
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('hidden');
  await click('Show keyboard');
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('math');
  await click('q', keyboard());
  expect(field().value).toBe('q');
  await click('Hide keyboard');
  await act(async () => field().dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})));
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('math');
});

test('fits a focused native composer above an overlaid IME and restores normal sizing when put away', async () => {
  vi.stubGlobal('innerHeight', 750);
  const viewport = Object.assign(new EventTarget(), {height: 750, offsetTop: 0, scale: 1});
  vi.stubGlobal('visualViewport', viewport);
  await act(async () => root.render(<div className="lemma-tutor"><Harness initial="Draft"/></div>));
  const page = host.querySelector<HTMLElement>('.lemma-tutor')!;
  await click('Use device keyboard');
  expect(document.activeElement).toBe(field());
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('native');
  viewport.height = 430;
  await act(async () => viewport.dispatchEvent(new Event('resize')));
  expect(page.style.getPropertyValue('--tutor-visual-height')).toBe('430px');
  await click('Show keyboard');
  expect(page.style.getPropertyValue('--tutor-visual-height')).toBe('');
  expect(field().inputMode).toBe('none');
  expect(field().value).toBe('Draft');
});

test('reveals a clipped keyboard by scrolling only the outer tutor pane', async () => {
  vi.stubGlobal('innerWidth', 360);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(510);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (this.classList.contains('kb')) return new DOMRect(0, 310 - (this.closest('.lemma-tutor')?.scrollTop ?? 0), 360, 212);
    return new DOMRect(0, 0, 360, 510);
  });
  await act(async () => root.render(<div className="lemma-tutor"><div className="chat"/><Harness/></div>));
  const page = host.querySelector<HTMLElement>('.lemma-tutor')!;
  const chat = host.querySelector<HTMLElement>('.chat')!;
  chat.scrollTop = 23;
  expect(page.scrollTop).toBe(0);
  await click('Show keyboard');
  expect(page.scrollTop).toBe(12);
  expect(chat.scrollTop).toBe(23);
  expect(host.querySelector<HTMLElement>('.kb')!.scrollTop).toBe(0);
});

test('completes a word at the caret, suggests the following word and preserves mathematical identifiers', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => field().focus());
  await input('PREI suffix');
  await act(async () => field().setSelectionRange(4, 4));
  // Selection updates from a native event before accepting a suggestion.
  await key('ArrowRight');
  await click('PREIMAGE', suggestion());
  expect(field().value).toBe('PREIMAGE suffix');
  await input('by ');
  expect(button('definition', suggestion())).toBeDefined();
  await input('x_teh');
  await click('Space', keyboard());
  expect(field().value).toBe('x_teh ');
});

test('offers local typo corrections and can immediately restore what the learner typed', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => field().focus());
  await input('teh');
  expect(button('the', suggestion()).className).toBe('fix');
  await click('Space', keyboard());
  expect(field().value).toBe('the ');
  await click('Delete', keyboard());
  expect(field().value).toBe('teh');
  await click('Space', keyboard());
  expect(field().value).toBe('teh ');
});

test('uses the existing haptics switch for virtual keys, suggestions and mode changes', async () => {
  const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', {configurable: true, value: vibrate});
  try {
    await act(async () => root.render(<Harness/>));
    await click('p', keyboard());
    await click('Symbols');
    await click('∀', suggestion());
    expect(vibrate.mock.calls.length).toBe(3);
    setHapticsEnabled(false);
    await click('ABC', keyboard());
    await click('q', keyboard());
    expect(vibrate.mock.calls.length).toBe(3);
  } finally {
    if (originalVibrate) Object.defineProperty(navigator, 'vibrate', originalVibrate);
    else Reflect.deleteProperty(navigator, 'vibrate');
  }
});

test('rejecting autocorrect leaves the previous learner edit at the top of Undo', async () => {
  await act(async () => root.render(<Harness initial="te"/>));
  await click('h', keyboard());
  await click('Space', keyboard());
  expect(field().value).toBe('the ');
  await click('Delete', keyboard());
  expect(field().value).toBe('teh');
  await click('Undo');
  expect(field().value).toBe('te');
});

test('accepts a correction before punctuation and skips prefixes inside identifiers', async () => {
  await act(async () => root.render(<Harness initial="teh, therefore"/>));
  await act(async () => {field().focus(); field().setSelectionRange(3, 3);});
  await key('ArrowRight');
  await click('the', suggestion());
  expect(field().value).toBe('the, therefore');
  await input('teh_2');
  await act(async () => field().setSelectionRange(3, 3));
  await key('ArrowRight');
  expect(button('the', suggestion())).toBeUndefined();
});
