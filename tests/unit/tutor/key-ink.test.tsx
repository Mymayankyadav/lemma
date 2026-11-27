import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import type {InkInferenceResult, InkSnapshot} from '../../../src/features/tutor/input/types';
import type {TutorInkState} from '../../../src/features/tutor/TutorInk';

const recognizer = vi.hoisted(() => ({
  submitted: [] as InkSnapshot[],
  onResult: undefined as undefined | ((result: InkInferenceResult) => void),
  /** Report the model unavailable synchronously from submit, as a Worker that cannot be constructed does. */
  failSynchronously: false,
}));
vi.mock('../../../src/features/tutor/input/inkRecognizer', () => ({
  TUTOR_MODEL_ASSET_SET: 'test-assets',
  createInkRecognizer: (callbacks: {onResult: (result: InkInferenceResult) => void; onReadiness: (state: string) => void}) => {
    recognizer.onResult = callbacks.onResult;
    let unavailable = false;
    return {prepare() {}, submit: (snapshot: InkSnapshot) => {
      if (recognizer.failSynchronously) {
        if (!unavailable) {unavailable = true; callbacks.onReadiness('unavailable');}
        return;
      }
      recognizer.submitted.push(snapshot);
    }, cancel() {}, dispose() {}};
  },
}));

const {TutorComposer} = await import('../../../src/features/tutor/TutorComposer');
const {SETTLE_MS, IDLE_COMMIT_MS} = await import('../../../src/features/tutor/input/latentInk/latentInkPolicy');
const {DEFERRED_TAP_MS} = await import('../../../src/features/tutor/input/latentInk/useKeyInk');
const {setHapticsEnabled} = await import('../../../src/ui/v7/haptics');
const {setTutorAnswerSelection} = await import('../../../src/features/tutor/TutorAnswerEditor');
const {padEdit} = await import('../../../src/features/pad/padEdit');
const {imageReference} = await import('../../../supabase/functions/_shared/tutor-answer');
const {editBetween, mapSpan} = await import('../../../src/features/tutor/input/latentInk/rebase');

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
  localStorage.clear(); recognizer.submitted = []; recognizer.failSynchronously = false; sent = []; setup = {}; current = '';
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  sessionStorage.removeItem('lemma.demo');
  window.history.replaceState(null, '', '/');
  vi.useRealTimers(); vi.restoreAllMocks(); setHapticsEnabled(true);
});

let setReadOnly: (readOnly: boolean) => void = () => {};
let sent: string[] = [];
/** The rich editor (with ink) and a starting answer, for the chip and image cases. */
let setup: {initial?: string; ink?: TutorInkState} = {};
let current = '';
function Harness() {
  const [value, setValue] = useState(setup.initial ?? '');
  const [readOnly, changeReadOnly] = useState(false);
  setReadOnly = changeReadOnly;
  const [answerActions, setAnswerActions] = useState<HTMLDivElement | null>(null);
  return <>
    <dialog><div ref={setAnswerActions}/></dialog>
    <TutorComposer value={value} onChange={text => {current = text; setValue(text);}} ink={setup.ink} onSend={text => {sent.push(text);}} onAsk={() => {}} canSend readOnly={readOnly} pending={false}
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
/** A real tap's click, as a browser sends it after pointerup (detail 1); with its pointer id where browsers give one. */
function tapClick(target: Element, id?: number) {
  const event = new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1});
  if (id !== undefined) Object.defineProperty(event, 'pointerId', {value: id});
  target.dispatchEvent(event);
}
function pointer(type: string, target: Element, x: number, y: number, id = 7, kind = 'touch') {
  const event = new MouseEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0});
  Object.defineProperties(event, {pointerId: {value: id}, isPrimary: {value: true}, pointerType: {value: kind}});
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
    tapClick(start);
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

test('Send submits the keys tapped while a drawing was still being read', async () => {
  vi.useFakeTimers();
  await mount();
  for (const letter of 'abc') await act(async () => button(letter, rows()).click());
  await draw([10, 10], [60, 60]);
  await act(async () => button('x', rows()).click());
  await act(async () => button('y', rows()).click());
  expect(field().value).toBe('abc');
  await act(async () => button('Send').click());
  expect(sent).toEqual(['abcxy']);
});

test('Escape and switching to the device keyboard settle a drawing before the keys close', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await act(async () => button('a', rows()).click());
  await act(async () => {field().dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));});
  expect(host.querySelector('.kb .rows')).toBeNull();
  expect(field().value).toBe('a');
  await act(async () => button('Keys').click());
  expect(rows()).toBeTruthy();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await act(async () => button('Use device keyboard').click());
  expect(host.querySelector('.kb .rows')).toBeNull();
  expect(field().inputMode).toBe('text');
  expect(field().value).toBe('a<');
});

test('Browse symbols settles a held drawing first, and its timer cannot fire later', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await act(async () => button('Maths symbols', rows()).click());
  await act(async () => button('Browse symbols', rows()).click());
  expect(field().value).toBe('<');
  await wait(IDLE_COMMIT_MS * 2);
  expect(field().value).toBe('<');
});

test('a nearby stroke continues a drawing whose reading has not come back yet', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await wait(500);
  await draw([12, 70], [60, 70]);
  expect(recognizer.submitted.at(-1)!.strokes).toHaveLength(2);
  expect(recognizer.submitted.at(-1)!.inkEpoch).toBe(recognizer.submitted[0].inkEpoch);
});

test('a cancelled first stroke leaves nothing held: the next key goes in at once', async () => {
  await mount();
  const start = button('g', rows());
  await act(async () => {
    pointer('pointerdown', start, 10, 10);
    pointer('pointermove', start, 40, 40);
    pointer('pointercancel', rows(), 40, 40);
  });
  await act(async () => button('a', rows()).click());
  expect(field().value).toBe('a');
  expect(drawn()).toBeNull();
});

test('a cancelled continuation leaves the held symbol to go in as before', async () => {
  vi.useFakeTimers();
  await mount();
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await wait(500);
  const start = button('g', rows());
  await act(async () => {
    pointer('pointerdown', start, 12, 70);
    pointer('pointermove', start, 40, 70);
    pointer('pointercancel', rows(), 40, 70);
  });
  await wait(IDLE_COMMIT_MS);
  expect(field().value).toBe('<');
});

test('a touch arriving during a pen stroke neither ends the stroke nor presses a key', async () => {
  await mount();
  const penKey = button('g', rows()), touchKey = button('p', rows());
  await act(async () => {
    pointer('pointerdown', penKey, 10, 10, 7, 'pen');
    pointer('pointermove', penKey, 30, 30, 7, 'pen');
    pointer('pointerdown', touchKey, 300, 20, 8, 'touch');
    pointer('pointerup', touchKey, 300, 20, 8, 'touch');
    tapClick(touchKey);
    pointer('pointermove', rows(), 60, 60, 7, 'pen');
    pointer('pointerup', rows(), 60, 60, 7, 'pen');
  });
  expect(field().value).toBe('');
  expect(recognizer.submitted).toHaveLength(1);
  expect(recognizer.submitted[0].strokes[0].pointerType).toBe('pen');
});

test('a model that fails at once shows its geometry fallback, not empty Reading slots', async () => {
  recognizer.failSynchronously = true;
  await mount();
  const start = button('g', rows());
  await act(async () => {
    pointer('pointerdown', start, 80, 10);
    pointer('pointermove', start, 10, 45);
    pointer('pointermove', rows(), 80, 80);
    pointer('pointerup', rows(), 80, 80);
  });
  expect(drawn()?.getAttribute('data-ink')).toBe('held');
});

const imageId = '12345678-0123-4123-8123-123456789abc';
const inkFixture = (draft: Partial<TutorInkState['draft']> = {}): TutorInkState => ({
  ready: true, status: 'ready', error: '', snapshot: vi.fn(), retry: vi.fn(), continueWithText: vi.fn(), update: vi.fn(async () => {}),
  draft: {strokes: [], photos: [{id: imageId, kind: 'drawing', mimeType: 'image/png', blob: new Blob(['image'])}], width: 3, accent: false,
    inlineImages: true, ...draft},
});
const richField = () => host.querySelector<HTMLElement>('.tutor-answer-editor')!;
async function mountRich(initial: string, ink: TutorInkState, caret: number) {
  setup = {initial, ink};
  current = initial;
  await act(async () => root.render(<Harness/>));
  await act(async () => richField().focus());
  await act(async () => {setTutorAnswerSelection(richField(), padEdit(initial, caret)); richField().click();});
  expect(rows()).toBeTruthy();
}

test('a pen cancelled on its key before drawing releases the keys to the next touch', async () => {
  await mount();
  const pen = button('g', rows()), key = button('a', rows());
  await act(async () => {
    pointer('pointerdown', pen, 10, 10, 7, 'pen');
    pointer('pointercancel', pen, 10, 10, 7, 'pen');
    pointer('pointerdown', key, 40, 60, 8, 'touch');
    pointer('pointerup', key, 40, 60, 8, 'touch');
    tapClick(key);
  });
  expect(field().value).toBe('a');
});

test('each refused touch has its click consumed, whatever the order of lifts and clicks', async () => {
  vi.useFakeTimers();
  await mount();
  const pen = button('g', rows()), p = button('p', rows()), o = button('o', rows());
  await act(async () => {
    pointer('pointerdown', pen, 10, 10, 7, 'pen');
    pointer('pointermove', pen, 30, 30, 7, 'pen');
    pointer('pointerdown', p, 300, 20, 8, 'touch');
    pointer('pointerdown', o, 280, 20, 9, 'touch');
    pointer('pointermove', rows(), 60, 60, 7, 'pen');
    // The pen lifts first; its own click lands on the keys' area and is consumed as the stroke's.
    pointer('pointerup', rows(), 60, 60, 7, 'pen');
    tapClick(rows());
    // Then the refused touches lift and click, the later one first.
    pointer('pointerup', o, 280, 20, 9, 'touch');
    tapClick(o);
    pointer('pointerup', p, 300, 20, 8, 'touch');
    tapClick(p);
  });
  await read({forall: .95, exists: .05});
  await wait(SETTLE_MS);
  expect(field().value).toBe('∀');
});

test('the pen’s own tap on a key a refused touch rests on still counts', async () => {
  await mount();
  const g = button('g', rows());
  await act(async () => {
    pointer('pointerdown', g, 10, 10, 7, 'pen');
    pointer('pointerdown', g, 12, 12, 8, 'touch');
    pointer('pointerup', g, 10, 10, 7, 'pen');
    tapClick(g);
    pointer('pointercancel', g, 12, 12, 8, 'touch');
  });
  expect(field().value).toBe('g');
});

test('opening an equation chip settles a held drawing and edits the same equation', async () => {
  vi.useFakeTimers();
  await mountRich('a $x$ b', inkFixture(), 0);
  await draw([10, 10], [60, 60]);
  await read({'less-than': .95, 'x-other': .05});
  await wait(SETTLE_MS);
  expect(current).toBe('a $x$ b');
  await act(async () => button('Edit equation x').click());
  expect(current).toBe('<a $x$ b');
  await wait(IDLE_COMMIT_MS * 2);
  const latex = host.querySelector<HTMLTextAreaElement>('.tutor-equation-edit textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(latex, 'y');
    latex.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await act(async () => button('Done').click());
  expect(current).toBe('<a $y$ b');
});

test('Send counts an unfinished drawing only while the settled answer still refers to it', async () => {
  vi.useFakeTimers();
  const reference = imageReference(imageId);
  await mountRich(reference, inkFixture({editingDrawing: {id: imageId, strokes: [], width: 3, accent: false}}), 0);
  await act(async () => {setTutorAnswerSelection(richField(), padEdit(reference, 0, reference.length)); richField().click();});
  await draw([10, 10], [60, 60]);
  await act(async () => button('x', rows()).click());
  await act(async () => {richField().dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true}));});
  expect(sent).toEqual(['x']);
});

test('a span is followed through the edits that went in, by their ranges, not by matching text', () => {
  const snap = (text: string, start: number, end = start) => ({text, start, end});
  // `[` typed before an image reference that itself starts with `[`.
  const bracket = editBetween(snap('[[img]]', 0), snap('[[[img]]', 1))!;
  expect(bracket).toEqual({start: 0, end: 0, delta: 1});
  expect(mapSpan([bracket], 0, 7)).toBe(1);
  // Deleting the first of two identical equations (and its space) removes it; the second moves to the front.
  const removed = editBetween(snap('$x$ $x$', 0, 4), snap('$x$', 0))!;
  expect(mapSpan([removed], 0, 3)).toBeNull();
  expect(mapSpan([removed], 4, 3)).toBe(0);
  // A symbol typed after a span leaves it where it was; one typed over it removes it.
  expect(mapSpan([editBetween(snap('a $x$ b', 7), snap('a $x$ b<', 8))!], 2, 3)).toBe(2);
  expect(mapSpan([editBetween(snap('a $x$ b', 2, 5), snap('a < b', 3))!], 2, 3)).toBeNull();
  expect(mapSpan([], 4, 2)).toBe(4);
});

test('a refused mouse released outside the keys does not swallow its next tap', async () => {
  vi.useFakeTimers();
  await mount();
  const pen = button('g', rows()), k = button('k', rows()), a = button('a', rows());
  await act(async () => {
    pointer('pointerdown', pen, 10, 10, 7, 'pen');
    pointer('pointermove', pen, 30, 30, 7, 'pen');
    pointer('pointerdown', k, 300, 60, 1, 'mouse');
    pointer('pointerup', document.body, 600, 600, 1, 'mouse');
    pointer('pointermove', rows(), 60, 60, 7, 'pen');
    pointer('pointerup', rows(), 60, 60, 7, 'pen');
  });
  await read({forall: .95, exists: .05});
  await wait(2000);
  await act(async () => {pointer('pointerdown', a, 40, 60, 1, 'mouse'); pointer('pointerup', a, 40, 60, 1, 'mouse'); tapClick(a, 1);});
  expect(field().value).toBe('∀a');
});

test('a refused contact lifted without a click leaves no trace on later taps, keyboard activations or a re-enabled keyboard', async () => {
  vi.useFakeTimers();
  await mount();
  const pen = button('g', rows()), p = button('p', rows());
  const refuse = async () => act(async () => {
    pointer('pointerdown', pen, 10, 10, 7, 'pen');
    pointer('pointerdown', p, 300, 20, 8, 'touch');
    pointer('pointerup', p, 300, 20, 8, 'touch');
    pointer('pointerup', pen, 10, 10, 7, 'pen');
  });
  await refuse();
  // The same pointer id taps p for real.
  await act(async () => {pointer('pointerdown', p, 300, 20, 8, 'touch'); pointer('pointerup', p, 300, 20, 8, 'touch'); tapClick(p, 8);});
  expect(field().value).toBe('p');
  await act(async () => button('Space', rows()).click());
  await refuse();
  // A keyboard activation of the same key, later.
  await wait(2000);
  await act(async () => p.click());
  expect(field().value).toBe('p p');
  await act(async () => button('Space', rows()).click());
  // A refused contact still down while the keys are disabled and enabled again.
  await act(async () => {pointer('pointerdown', pen, 10, 10, 7, 'pen'); pointer('pointerdown', p, 300, 20, 8, 'touch');});
  await act(async () => setReadOnly(true));
  await act(async () => setReadOnly(false));
  await act(async () => {pointer('pointerup', document.body, 600, 600, 8, 'touch'); pointer('pointerup', pen, 10, 10, 7, 'pen');});
  await act(async () => {pointer('pointerdown', p, 300, 20, 8, 'touch'); pointer('pointerup', p, 300, 20, 8, 'touch'); tapClick(p, 8);});
  expect(field().value).toBe('p p p');
});

test('an equation chip removed by a queued Delete does not open, and its surviving twin opens as itself', async () => {
  for (const [chip, opens] of [[0, false], [1, true]] as const) {
    vi.useFakeTimers();
    await mountRich('$x$ $x$', inkFixture(), 0);
    await act(async () => {setTutorAnswerSelection(richField(), padEdit('$x$ $x$', 0, 4)); richField().click();});
    await draw([10, 10], [60, 60]);
    await act(async () => button('Delete', rows()).click());
    expect(current).toBe('$x$ $x$');
    const chips = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(node => node.getAttribute('aria-label') === 'Edit equation x');
    await act(async () => chips[chip].click());
    expect(current).toBe('$x$');
    expect(Boolean(host.querySelector('.tutor-equation-edit'))).toBe(opens);
    await act(async () => root.unmount());
    root = createRoot(host);
  }
});

test('a delayed tap on Unfinished drawing does not reopen a drawing the queued keys removed', async () => {
  vi.useFakeTimers();
  const reference = imageReference(imageId);
  await mountRich(reference, inkFixture({editingDrawing: {id: imageId, strokes: [], width: 3, accent: false}}), 0);
  await act(async () => {setTutorAnswerSelection(richField(), padEdit(reference, 0, reference.length)); richField().click();});
  await draw([10, 10], [60, 60]);
  await act(async () => button('x', rows()).click());
  await wait(700);
  await act(async () => {button('Unfinished drawing').dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 1}));});
  await wait(100);
  expect(current).toBe('x');
  await wait(200);
  expect(current).toBe('x');
  expect(rows()).toBeTruthy();
});
