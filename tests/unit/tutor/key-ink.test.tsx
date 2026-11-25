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

function Harness() {
  const [value, setValue] = useState('');
  const [answerActions, setAnswerActions] = useState<HTMLDivElement | null>(null);
  return <>
    <dialog><div ref={setAnswerActions}/></dialog>
    <TutorComposer value={value} onChange={setValue} onSend={() => {}} onAsk={() => {}} canSend readOnly={false} pending={false}
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

test('Delete clears a held drawing without deleting the answer', async () => {
  vi.useFakeTimers();
  await mount();
  await act(async () => button('a', rows()).click());
  await draw([10, 10], [60, 60]);
  await read({forall: .6, exists: .4});
  await act(async () => pointer('pointerdown', button('Delete', rows()), 300, 120));
  await act(async () => pointer('pointerup', button('Delete', rows()), 300, 120));
  expect(field().value).toBe('a');
  expect(drawn()).toBeNull();
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
