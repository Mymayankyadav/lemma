import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import type {InkInferenceResult, InkSnapshot} from '../../../src/features/tutor/input/types';
import type {TutorInkState} from '../../../src/features/tutor/TutorInk';

// N249: editing a drawing chip while a drawing over the keys is held. The tray's rasterising is replaced by a button
// that calls the composer's real insertion boundary with the new image and the image it replaces.
const recognizer = vi.hoisted(() => ({submitted: [] as InkSnapshot[], onResult: undefined as undefined | ((result: InkInferenceResult) => void)}));
vi.mock('../../../src/features/tutor/input/inkRecognizer', () => ({
  TUTOR_MODEL_ASSET_SET: 'test-assets',
  createInkRecognizer: (callbacks: {onResult: (result: InkInferenceResult) => void}) => {
    recognizer.onResult = callbacks.onResult;
    return {prepare() {}, submit: (snapshot: InkSnapshot) => {recognizer.submitted.push(snapshot);}, cancel() {}, dispose() {}};
  },
}));
const updated = '87654321-0123-4123-8123-123456789abc';
vi.mock('../../../src/features/tutor/TutorInk', async original => ({
  ...await original<typeof import('../../../src/features/tutor/TutorInk')>(),
  TutorInkTray: (props: {shown: boolean; editingImageId: string | null; onInsertImage: (id: string, replacesId?: string) => boolean}) =>
    props.shown ? <button type="button" onClick={() => props.onInsertImage(updated, props.editingImageId ?? undefined)}>Update drawing</button> : null,
}));

const {TutorComposer} = await import('../../../src/features/tutor/TutorComposer');
const {SETTLE_MS} = await import('../../../src/features/tutor/input/latentInk/latentInkPolicy');
const {setTutorAnswerSelection} = await import('../../../src/features/tutor/TutorAnswerEditor');
const {padEdit} = await import('../../../src/features/pad/padEdit');
const {imageReference} = await import('../../../supabase/functions/_shared/tutor-answer');
const {setHapticsEnabled} = await import('../../../src/ui/v7/haptics');

const imageId = '12345678-0123-4123-8123-123456789abc';
let host: HTMLDivElement, root: Root, current = '';
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  window.history.replaceState(null, '', '/');
  sessionStorage.setItem('lemma.demo', '1');
  for (const method of ['showModal', 'close'] as const) Object.defineProperty(HTMLDialogElement.prototype, method, {configurable: true,
    value(this: HTMLDialogElement) {this.open = method === 'showModal';}});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setHapticsEnabled(false);
  vi.useFakeTimers();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  sessionStorage.removeItem('lemma.demo');
  vi.useRealTimers(); vi.restoreAllMocks(); setHapticsEnabled(true);
});

const ink: TutorInkState = {
  ready: true, status: 'ready', error: '', snapshot: vi.fn(), retry: vi.fn(), continueWithText: vi.fn(), update: vi.fn(async () => {}),
  draft: {strokes: [], photos: [{id: imageId, kind: 'drawing', mimeType: 'image/png', blob: new Blob(['image'])}], width: 3, accent: false, inlineImages: true},
};
function Harness({initial}: {initial: string}) {
  const [value, setValue] = useState(initial);
  const [answerActions, setAnswerActions] = useState<HTMLDivElement | null>(null);
  return <>
    <dialog><div ref={setAnswerActions}/></dialog>
    <TutorComposer value={value} onChange={text => {current = text; setValue(text);}} ink={ink} onSend={() => {}} onAsk={() => {}} canSend
      readOnly={false} pending={false} hasContext={false} onContext={() => {}} sessionActionsOpen={false} onCloseActions={() => {}} answerActions={answerActions}/>
  </>;
}
const button = (name: string) => [...host.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;
const rows = () => host.querySelector<HTMLElement>('.kb .rows')!;
function pointer(type: string, target: Element, x: number, y: number) {
  const event = new MouseEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0});
  Object.defineProperties(event, {pointerId: {value: 7}, isPrimary: {value: true}, pointerType: {value: 'touch'}});
  target.dispatchEvent(event);
}

test('editing a drawing chip after a held drawing settles in front of it updates that same drawing', async () => {
  const initial = 'a ' + imageReference(imageId) + ' b';
  current = initial;
  await act(async () => root.render(<Harness initial={initial}/>));
  const field = host.querySelector<HTMLElement>('.tutor-answer-editor')!;
  await act(async () => field.focus());
  await act(async () => {setTutorAnswerSelection(field, padEdit(initial, 0)); field.click();});
  await act(async () => {
    const start = [...rows().querySelectorAll('button')].find(node => node.getAttribute('aria-label') === 'g')!;
    pointer('pointerdown', start, 10, 10); pointer('pointermove', start, 35, 35);
    pointer('pointermove', rows(), 60, 60); pointer('pointerup', rows(), 60, 60);
  });
  const snapshot = recognizer.submitted.at(-1)!;
  await act(async () => recognizer.onResult!({...snapshot, scoreKind: 'probability',
    rawScores: [{classId: 'lt', symbolId: 'less-than', score: .95}, {classId: 'other', score: .05}]}));
  await act(async () => {vi.advanceTimersByTime(SETTLE_MS);});
  expect(current).toBe(initial);
  await act(async () => button('Edit drawing').click());
  expect(current).toBe('<' + initial);
  await act(async () => button('Update drawing').click());
  expect(current).toBe('<a ' + imageReference(updated) + ' b');
  expect(host.textContent).not.toContain('no longer at this position');
});

test('a `[` queued in front of a drawing does not stop that drawing from opening and updating', async () => {
  const initial = imageReference(imageId);
  current = initial;
  await act(async () => root.render(<Harness initial={initial}/>));
  const field = host.querySelector<HTMLElement>('.tutor-answer-editor')!;
  await act(async () => field.focus());
  await act(async () => {setTutorAnswerSelection(field, padEdit(initial, 0)); field.click();});
  const key = (name: string) => [...rows().querySelectorAll('button')].find(node => node.getAttribute('aria-label') === name)!;
  await act(async () => {
    const start = key('g');
    pointer('pointerdown', start, 10, 10); pointer('pointermove', start, 35, 35);
    pointer('pointermove', rows(), 60, 60); pointer('pointerup', rows(), 60, 60);
  });
  // The drawing is still being read: these keys wait behind it.
  await act(async () => key('?123').click());
  await act(async () => key('=\\<').click());
  await act(async () => key('[').click());
  expect(current).toBe(initial);
  await act(async () => button('Edit drawing').click());
  expect(current).toBe('[' + initial);
  await act(async () => button('Update drawing').click());
  expect(current).toBe('[' + imageReference(updated));
});
