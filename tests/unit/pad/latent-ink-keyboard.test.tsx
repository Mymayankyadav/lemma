import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import type {InkInferenceResult, InkSnapshot} from '../../../src/features/tutor/input/types';

const recognizer = vi.hoisted(() => ({
  submitted: [] as InkSnapshot[],
  onResult: undefined as undefined | ((result: InkInferenceResult) => void),
  onReadiness: undefined as undefined | ((state: string) => void),
}));
vi.mock('../../../src/features/tutor/input/inkRecognizer', () => ({
  TUTOR_MODEL_ASSET_SET: 'test-assets',
  createInkRecognizer: (callbacks: {onResult: (result: InkInferenceResult) => void; onReadiness: (state: string) => void}) => {
    recognizer.onResult = callbacks.onResult; recognizer.onReadiness = callbacks.onReadiness;
    return {prepare() {}, submit: (snapshot: InkSnapshot) => {recognizer.submitted.push(snapshot);}, cancel() {}, dispose() {}};
  },
}));

const {LocalPadEditor} = await import('../../../src/features/pad/LocalPadEditor');
const {padEdit} = await import('../../../src/features/pad/padEdit');
const {SETTLE_MS, IDLE_COMMIT_MS} = await import('../../../src/features/pad/latentInk/latentInkPolicy');
const {DEFERRED_TAP_MS} = await import('../../../src/features/pad/latentInk/useLatentInk');

let host: HTMLDivElement, root: Root, text = '';
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  vi.useFakeTimers();
  history.replaceState(null, '', '/?flags=padLatentInk');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  localStorage.clear(); recognizer.submitted = []; text = '';
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  history.replaceState(null, '', '/'); vi.useRealTimers(); vi.restoreAllMocks();
});

function Harness() {
  const [value, setValue] = useState(padEdit(''));
  return <LocalPadEditor value={value} onEdit={edit => {text = edit.text; setValue(edit);}}/>;
}
const mount = () => act(async () => root.render(<Harness/>));
const button = (name: string) => [...host.querySelectorAll('button')]
  .find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;
const keys = () => host.querySelector<HTMLDivElement>('.pad-keyboard-body')!;
const status = () => host.querySelector('.pad-latent-strip [role="status"]')!.textContent;

function pointer(type: string, target: Element, x: number, y: number) {
  target.dispatchEvent(new MouseEvent(type, {bubbles: true, clientX: x, clientY: y, button: 0}));
}
/** A stroke that starts on a key, as a finger drawing over the keys does; the browser's click follows. */
async function draw(from: [number, number], to: [number, number], key = 'Plus') {
  await act(async () => {
    const start = button(key);
    pointer('pointerdown', start, ...from);
    pointer('pointermove', start, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    pointer('pointermove', start, ...to);
    pointer('pointerup', start, ...to);
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

test('a tap is a key; a stroke over the keys draws and never presses the key under it', async () => {
  await mount();
  await act(async () => button('Plus').click());
  expect(text).toBe('+');
  await draw([10, 10], [60, 60]);
  expect(text).toBe('+');
  expect(recognizer.submitted).toHaveLength(1);
  expect(recognizer.submitted[0].strokes[0].points.length).toBeGreaterThan(1);
});

test('a confident, complete symbol goes in by itself once the pen settles; Replace fixes it in one tap', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await read({forall: .95, exists: .03, 'not-exists': .02});
  expect(text).toBe('');
  await wait(SETTLE_MS);
  expect(text).toBe('∀');
  expect(status()).toBe('Inserted ∀. Replace with:');
  await act(async () => button('Replace with There exists').click());
  expect(text).toBe('∃');
  expect(JSON.parse(localStorage.getItem('lemma.pad.latentInk.v1')!)).toEqual({inserted: 1, corrected: 1});
});

test('an extendable reading waits: a stroke on it continues the symbol, a key tap puts it in before the key', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await wait(SETTLE_MS);
  expect(text).toBe('');
  expect(status()).toBe('Goes in when you move on, or choose:');
  await draw([12, 70], [60, 70]);
  expect(recognizer.submitted.at(-1)!.strokes).toHaveLength(2);
  await read({'less-than-or-equal': .96, 'less-than': .04});
  await wait(SETTLE_MS);
  expect(text).toBe('≤');
});

test('moving on to a key inserts the held symbol first, then the key', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'element-of': .95, epsilon: .05});
  await act(async () => button('Plus').click());
  expect(text).toBe('∈+');
});

test('an unclear reading waits for a choice, and goes in only when the learner moves on', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await read({forall: .6, exists: .4});
  await wait(IDLE_COMMIT_MS * 3);
  expect(text).toBe('');
  expect(status()).toBe('Choose a symbol:');
  await draw([300, 300], [340, 340]);
  expect(text).toBe('∀');
  expect(recognizer.submitted.at(-1)!.strokes).toHaveLength(1);
});

test('an unusable reading is left out, and says so', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await read({forall: .2, 'x-digit': .8});
  await act(async () => button('Plus').click());
  expect(text).toBe('+');
  expect(status()).toContain('Drawing left out');
});

test('a key tapped while the drawing is still being read waits for the reading, keeping the order', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await act(async () => button('Minus').click());
  expect(text).toBe('');
  await read({'element-of': .95, epsilon: .05});
  expect(text).toBe('∈−');
  await draw([10, 10], [60, 60]);
  await act(async () => button('Minus').click());
  await wait(DEFERRED_TAP_MS);
  expect(text).toBe('∈−−');
});

test('a finished symbol is not taken back by the next one drawn on the same spot', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await read({forall: .95, exists: .05});
  await wait(SETTLE_MS);
  expect(text).toBe('∀');
  await draw([20, 20], [40, 50]);
  expect(text).toBe('∀');
  expect(recognizer.submitted.at(-1)!.strokes).toHaveLength(1);
});

test('an extendable symbol that went in on a pause is taken back by a stroke on it, and continued', async () => {
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await wait(IDLE_COMMIT_MS);
  expect(text).toBe('<');
  await draw([12, 70], [60, 70]);
  expect(text).toBe('');
  expect(recognizer.submitted.at(-1)!.strokes).toHaveLength(2);
  await read({'less-than-or-equal': .96, 'less-than': .04});
  await wait(SETTLE_MS);
  expect(text).toBe('≤');
  expect(JSON.parse(localStorage.getItem('lemma.pad.latentInk.v1')!)).toEqual({inserted: 1, corrected: 0});
});

test('without the flag the keys are only keys', async () => {
  history.replaceState(null, '', '/');
  await mount();
  await draw([10, 10], [60, 60]);
  expect(text).toBe('+');
  expect(recognizer.submitted).toHaveLength(0);
  expect(host.querySelector('.pad-latent-strip')).toBeNull();
});
