import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import type {InkInferenceResult, InkSnapshot} from '../../../src/features/tutor/input/types';

const recognizer = vi.hoisted(() => ({
  submitted: [] as InkSnapshot[],
  onResult: undefined as undefined | ((result: InkInferenceResult) => void),
}));
vi.mock('../../../src/features/tutor/input/inkRecognizer', () => ({
  TUTOR_MODEL_ASSET_SET: 'test-assets',
  createInkRecognizer: (callbacks: {onResult: (result: InkInferenceResult) => void}) => {
    recognizer.onResult = callbacks.onResult;
    return {prepare() {}, submit: (snapshot: InkSnapshot) => {recognizer.submitted.push(snapshot);}, cancel() {}, dispose() {}};
  },
}));

const {TutorComposer} = await import('../../../src/features/tutor/TutorComposer');
const {SETTLE_MS, IDLE_COMMIT_MS} = await import('../../../src/features/tutor/input/latentInk/latentInkPolicy');
const {DEFERRED_TAP_MS} = await import('../../../src/features/tutor/input/latentInk/useKeyInk');
const {setHapticsEnabled} = await import('../../../src/ui/v7/haptics');

let host: HTMLDivElement, root: Root;
const dialogMethods = ['showModal', 'close'] as const;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  sessionStorage.setItem('lemma.demo', '1');
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  dialogMethods.forEach(method => Object.defineProperty(HTMLDialogElement.prototype, method, {configurable: true,
    value(this: HTMLDialogElement) {this.open = method === 'showModal';}}));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setHapticsEnabled(false);
  localStorage.clear(); recognizer.submitted = [];
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  sessionStorage.removeItem('lemma.demo');
  window.history.replaceState(null, '', '/');
  vi.useRealTimers(); vi.restoreAllMocks(); setHapticsEnabled(true);
});

let setReadOnly: (readOnly: boolean) => void = () => {};
function Harness() {
  const [value, setValue] = useState('');
  const [readOnly, changeReadOnly] = useState(false);
  setReadOnly = changeReadOnly;
  const [answerActions, setAnswerActions] = useState<HTMLDivElement | null>(null);
  return <>
    <dialog><div ref={setAnswerActions}/></dialog>
    <TutorComposer value={value} onChange={setValue} onSend={() => {}} onAsk={() => {}} canSend readOnly={readOnly} pending={false}
      hasContext={false} onContext={() => {}} sessionActionsOpen={false} onCloseActions={() => {}} answerActions={answerActions}/>
  </>;
}
const field = () => host.querySelector('textarea')!;
const rows = () => host.querySelector<HTMLElement>('.kb .rows')!;
const button = (name: string, group: ParentNode = host) => [...group.querySelectorAll('button')]
  .find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;
const drawn = () => host.querySelector('[aria-label="Drawn symbol"]');
async function mount() {
  await act(async () => root.render(<Harness/>));
  await act(async () => {field().focus();});
  expect(rows()).toBeTruthy();
}
/** A real tap's click, as a browser sends it after pointerup (detail 1). */
function tapClick(target: Element) {
  target.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
}
function pointer(type: string, target: Element, x: number, y: number) {
  const event = new MouseEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0});
  Object.defineProperties(event, {pointerId: {value: 7}, isPrimary: {value: true}, pointerType: {value: 'touch'}});
  target.dispatchEvent(event);
}
/** A stroke that starts on a key, as a finger drawing over the keys does; the browser's click may follow. */
async function draw(from: [number, number], to: [number, number], key = 'g') {
  await act(async () => {
    const start = button(key, rows());
    pointer('pointerdown', start, ...from);
    pointer('pointermove', start, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    pointer('pointermove', rows(), ...to);
    pointer('pointerup', rows(), ...to);
    start.click();
  });
}
async function read(scores: Record<string, number>) {
  const snapshot = recognizer.submitted.at(-1)!;
  await act(async () => recognizer.onResult!({
    ...snapshot, scoreKind: 'probability',
    rawScores: Object.entries(scores).map(([id, score]) => ({classId: id, score, ...(id.startsWith('x-') ? {} : {symbolId: id})})),
  }));
}
const wait = (ms: number) => act(async () => {vi.advanceTimersByTime(ms);});

test('the idle keyboard and strip are the same with the drawing on and off', async () => {
  window.history.replaceState(null, '', '/?flags=-tutorKeyInk');
  await mount();
  const strip = host.querySelector('.kb .strip')!.outerHTML;
  const keys = [...rows().children].map(node => node.outerHTML);
  await act(async () => root.unmount());
  root = createRoot(host);
  window.history.replaceState(null, '', '/');
  await mount();
  expect(host.querySelector('.kb .strip')!.outerHTML).toBe(strip);
  // Only an overlay canvas and a spoken status are added, both out of the layout.
  const added = [...rows().children].filter(node => node.matches('canvas.tutor-key-ink, .tutor-key-ink-status'));
  expect(added).toHaveLength(2);
  expect([...rows().children].filter(node => !added.includes(node)).map(node => node.outerHTML)).toEqual(keys);
});

test('a tap is a key; a stroke over the keys draws and never presses the key under it', async () => {
  await mount();
  await act(async () => button('a', rows()).click());
  expect(field().value).toBe('a');
  await draw([10, 10], [60, 60]);
  expect(field().value).toBe('a');
  expect(recognizer.submitted).toHaveLength(1);
});

test('a confident, complete symbol goes in by itself; the strip then replaces it in one tap', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({forall: .95, exists: .03, 'not-exists': .02});
  expect(drawn()?.getAttribute('data-ink')).toBe('held');
  await wait(SETTLE_MS);
  expect(field().value).toBe('∀');
  expect(button('Keep ∀ (For all)')).toBeTruthy();
  await act(async () => button('Replace with ∃ (There exists)').click());
  expect(field().value).toBe('∃');
  expect(JSON.parse(localStorage.getItem('lemma.pad.latentInk.v1')!)).toEqual({inserted: 1, corrected: 1});
  await act(async () => button('b', rows()).click());
  expect(field().value).toBe('∃b');
  expect(drawn()).toBeNull();
});

test('an extendable reading waits for the next stroke, or goes in before the next key', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await wait(SETTLE_MS);
  expect(field().value).toBe('');
  await draw([12, 70], [60, 70]);
  expect(recognizer.submitted.at(-1)!.strokes).toHaveLength(2);
  await read({'less-than-or-equal': .96, 'less-than': .04});
  await wait(SETTLE_MS);
  expect(field().value).toBe('≤');
  await draw([200, 10], [250, 60]);
  await read({'element-of': .95, epsilon: .05});
  await act(async () => button('a', rows()).click());
  expect(field().value).toBe('≤∈a');
});

test('an unclear reading waits for a choice and goes in only when the learner moves on', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({forall: .6, exists: .4});
  await wait(IDLE_COMMIT_MS * 3);
  expect(field().value).toBe('');
  await draw([300, 100], [340, 140]);
  expect(field().value).toBe('∀');
});

test('Delete clears a held drawing without deleting the answer, with the whole tap or a long press', async () => {
  vi.useFakeTimers();
  await mount();
  await act(async () => button('a', rows()).click());
  for (const hold of [0, 600]) {
    await draw([10, 10], [60, 60]);
    await read({forall: .6, exists: .4});
    const remove = button('Delete', rows());
    await act(async () => pointer('pointerdown', remove, 300, 120));
    await wait(hold);
    await act(async () => {pointer('pointerup', remove, 300, 120); tapClick(remove);});
    expect(field().value).toBe('a');
    expect(drawn()).toBeNull();
  }
  // The next Delete is an ordinary one again.
  await act(async () => {
    const remove = button('Delete', rows());
    pointer('pointerdown', remove, 300, 120); pointer('pointerup', remove, 300, 120); tapClick(remove);
  });
  expect(field().value).toBe('');
});

test('every key tapped while the drawing is read goes in, in order, after the symbol', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await act(async () => button('a', rows()).click());
  await act(async () => button('b', rows()).click());
  expect(field().value).toBe('');
  await read({forall: .95, exists: .05});
  expect(field().value).toBe('∀ab');
});

test('keys tapped while the reading never comes still go in, in order', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await act(async () => button('a', rows()).click());
  await act(async () => button('b', rows()).click());
  await wait(DEFERRED_TAP_MS);
  expect(field().value).toBe('ab');
});

test('a reading that arrives after the selection changed does not edit the new selection', async () => {
  vi.useFakeTimers();
  await mount();
  for (const letter of 'abc') await act(async () => button(letter, rows()).click());
  expect(field().value).toBe('abc');
  await draw([10, 10], [60, 60]);
  await act(async () => {field().setSelectionRange(0, 3);});
  await read({forall: .95, exists: .05});
  await wait(SETTLE_MS);
  expect(field().value).toBe('abc');
  expect(host.querySelector('.tutor-key-ink-status')?.textContent).toContain('left out');
});

test('a long-press digit goes in after the held symbol, not before it', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await wait(SETTLE_MS);
  expect(field().value).toBe('');
  const q = button('q', rows());
  await act(async () => pointer('pointerdown', q, 20, 20));
  await wait(400);
  await act(async () => {pointer('pointerup', q, 20, 20); tapClick(q);});
  expect(field().value).toBe('<1');
});

test('a key queued behind a drawing never edits a selection made after it was tapped', async () => {
  vi.useFakeTimers();
  await mount();
  for (const letter of 'abc') await act(async () => button(letter, rows()).click());
  await draw([10, 10], [60, 60]);
  await act(async () => button('x', rows()).click());
  expect(field().value).toBe('abc');
  // The learner selects the existing text while the drawing is still being read.
  await act(async () => {field().setSelectionRange(0, 3); field().click();});
  expect(field().value).toBe('abc');
  await read({forall: .95, exists: .05});
  await wait(DEFERRED_TAP_MS + SETTLE_MS);
  expect(field().value).toBe('abc');
  expect(host.querySelector('.tutor-key-ink-status')?.textContent).toContain('1 key tapped meanwhile left out');
});

test('a key queued behind a drawing is not applied once the answer becomes read-only', async () => {
  vi.useFakeTimers();
  await mount();
  for (const letter of 'abc') await act(async () => button(letter, rows()).click());
  await draw([10, 10], [60, 60]);
  await act(async () => button('x', rows()).click());
  await act(async () => setReadOnly(true));
  await wait(DEFERRED_TAP_MS * 2);
  expect(field().value).toBe('abc');
});

test('switching the keys’ layout keeps a held symbol, which goes in before the next key', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await wait(SETTLE_MS);
  await act(async () => button('?123', rows()).click());
  await act(async () => button('1', rows()).click());
  expect(field().value).toBe('<1');
});

test('keys queued behind a drawing being read survive a layout switch, in order', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await act(async () => button('a', rows()).click());
  await act(async () => button('?123', rows()).click());
  await act(async () => button('1', rows()).click());
  expect(field().value).toBe('');
  await read({forall: .95, exists: .05});
  expect(field().value).toBe('∀a1');
});

test('leaving the keys for equation mode settles a pending drawing and its queued keys first', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await act(async () => button('a', rows()).click());
  expect(field().value).toBe('<a');
  await draw([200, 10], [250, 60]);
  await act(async () => button('b', rows()).click());
  await act(async () => button('Equation mode').click());
  expect(field().value).toBe('<ab');
});

test('a sideways slide on Space still moves the caret instead of drawing', async () => {
  await mount();
  const space = button('Space', rows());
  await act(async () => {
    pointer('pointerdown', space, 100, 150);
    pointer('pointermove', space, 130, 151);
    pointer('pointerup', space, 130, 151);
  });
  expect(recognizer.submitted).toHaveLength(0);
});

test('with the flag off a stroke over the keys is a key press, as before', async () => {
  window.history.replaceState(null, '', '/?flags=-tutorKeyInk');
  await mount();
  await draw([10, 10], [60, 60]);
  expect(field().value).toBe('g');
  expect(recognizer.submitted).toHaveLength(0);
  expect(host.querySelector('.tutor-key-ink')).toBeNull();
});

test('the drawn symbol’s readings have the strip to themselves, above a pending spelling fix', async () => {
  await mount();
  await act(async () => {
    const node = field();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, 'teh');
    node.setSelectionRange(3, 3);
    node.dispatchEvent(new InputEvent('input', {bubbles: true, data: 'teh', inputType: 'insertText'}));
  });
  await vi.waitFor(async () => {
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 20));});
    expect(button('Replace teh with the')).toBeDefined();
  });
  await draw([10, 10], [60, 60]);
  await read({forall: .6, exists: .4});
  expect(button('Insert ∀ (For all)')).toBeDefined();
  expect(button('Replace teh with the')).toBeUndefined();
  expect(host.querySelector('.writing-aid-floating-choice')).toBeNull();
  await act(async () => button('Insert ∀ (For all)').click());
  expect(field().value).toBe('teh∀');
  expect(button('Keep ∀ (For all)')).toBeDefined();
  // Moving on hands the strip back.
  await act(async () => button('Space', rows()).click());
  expect(field().value).toBe('teh∀ ');
  expect(drawn()).toBeNull();
});
