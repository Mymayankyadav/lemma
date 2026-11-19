import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {LocalPadWorkspace} from '../../../src/features/pad/LocalPadWorkspace';
import {makePadFile} from '../../../src/features/pad/padExport';
import {padEdit} from '../../../src/features/pad/padEdit';
import {
  PAD_INK_LIMIT, appendPadPoint, clearPadInk, finishPadStroke, initializePadInk,
  padStrokePath, paperPoint, undoPadInk, type PadInkHistory,
} from '../../../src/features/pad/padInk';

const dot = [{x: 16, y: 20}];
const box = {left: 10, top: 20, width: 320, height: 200};

test('maps proportional coordinates identically after resizing, clamps edges and rejects invalid layouts', () => {
  expect(paperPoint(90, 170, box)).toEqual({x: 160, y: 300});
  expect(paperPoint(240, 340, {left: 40, top: 40, width: 800, height: 400})).toEqual({x: 160, y: 300});
  expect(paperPoint(-15, 500, box)).toEqual({x: 0, y: 400});
  expect(paperPoint(10, 20, {...box, height: 0})).toBeNull();
  expect(paperPoint(Infinity, 20, box)).toBeNull();
});

test('bounds points, strokes, and undo while making clear reversible', () => {
  const fullStroke = Array.from({length: PAD_INK_LIMIT.points}, (_, x) => ({x, y: 20}));
  expect(appendPadPoint(fullStroke, {x: 300, y: 20})).toBe(fullStroke);
  expect(appendPadPoint(dot, dot[0])).toBe(dot);
  const before = initializePadInk(Array.from({length: PAD_INK_LIMIT.strokes}, () => dot))!;
  expect(finishPadStroke(before, dot)).toBe(before);
  expect(finishPadStroke(before, [])).toBe(before);
  const cleared = clearPadInk(before);
  expect(cleared.strokes).toEqual([]);
  expect(undoPadInk(cleared)).toEqual(before);
  let edited = initializePadInk()!;
  for (let i = 0; i < 20; i++) edited = finishPadStroke(edited, dot);
  expect(edited.undo).toHaveLength(PAD_INK_LIMIT.undo);
  expect(padStrokePath(dot)).toBe('M16 20h.01');
});

test('rejects corrupt snapshots instead of silently dropping strokes; valid hydration copies points', () => {
  expect(initializePadInk([[{x: 0, y: 401}]])).toBeNull();
  expect(initializePadInk([[{x: '1', y: 0}]])).toBeNull();
  expect(initializePadInk([Array(1)])).toBeNull();
  const incoming = [[{x: 10, y: 20}]];
  const history = initializePadInk(incoming)!;
  incoming[0][0].x = 90;
  expect(history.strokes[0][0].x).toBe(10);
});

test('exports an exact versioned backup and inert readable notes with fixed-viewBox ink', () => {
  const notes = padEdit('\n<iframe src="https://example.test"> & $x$', 5, 9, 'backward');
  expect(JSON.parse(makePadFile(notes, [dot], 'backup').contents)).toEqual({
    format: 'lemma-pad', version: 1, notes, ink: {width: 640, height: 400, strokes: [dot]},
  });
  const html = new DOMParser().parseFromString(makePadFile(notes, [dot], 'readable').contents, 'text/html');
  expect(html.querySelector('pre')?.textContent).toBe(notes.text);
  expect(html.querySelector('iframe, img, script, link, a')).toBeNull();
  expect(html.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 640 400');
  expect(html.querySelector('path')?.getAttribute('d')).toBe('M16 20h.01');
});

let root: Root, host: HTMLElement;
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function Workspace({record}: {record: (history: PadInkHistory) => void}) {
  const [notes, setNotes] = useState(padEdit('My proof'));
  const [ink, setInk] = useState(initializePadInk()!);
  return <LocalPadWorkspace value={notes} onEdit={setNotes} ink={ink} onInk={value => {record(value); setInk(value);}}/>;
}
function button(label: string) {
  return Array.from(host.querySelectorAll('button')).find(candidate => candidate.textContent === label)!;
}
function point(target: SVGSVGElement, type: string, pointerId: number, clientX = 50, clientY = 60) {
  target.dispatchEvent(new PointerEvent(type, {bubbles: true, button: 0, pointerId, clientX, clientY}));
}

test('commits only completed strokes and keeps ink stable after rotation, clear, undo and scroll', async () => {
  const record = vi.fn(), fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await act(async () => root.render(<Workspace record={record}/>));
  const svg = host.querySelector('svg')!;
  Object.assign(svg, {setPointerCapture: vi.fn(), getBoundingClientRect: () => box});
  await act(async () => {point(svg, 'pointerdown', 1); point(svg, 'pointermove', 1, 90, 100);});
  expect(svg.querySelector('path')).not.toBeNull();
  expect(record).not.toHaveBeenCalled();
  await act(async () => {point(svg, 'lostpointercapture', 1); point(svg, 'pointerup', 1);});
  expect(svg.querySelector('path')).toBeNull();
  expect(record).not.toHaveBeenCalled();
  await act(async () => {
    point(svg, 'pointerdown', 2);
    point(svg, 'pointermove', 3, 900, 100);
    point(svg, 'pointerup', 2, 110, 120);
  });
  expect(record).toHaveBeenCalledTimes(1);
  const geometry = 'M80 80L200 200';
  expect(svg.querySelector('path')?.getAttribute('d')).toBe(geometry);
  Object.assign(svg, {getBoundingClientRect: () => ({...box, width: 640, height: 400})});
  await act(async () => button('Scroll').click());
  expect(svg.dataset.mode).toBe('scroll');
  await act(async () => {point(svg, 'pointerdown', 4); point(svg, 'pointerup', 4);});
  expect(record).toHaveBeenCalledTimes(1);
  expect(svg.querySelector('path')?.getAttribute('d')).toBe(geometry);
  await act(async () => button('Clear ink').click());
  expect(svg.querySelector('path')).toBeNull();
  await act(async () => button('Undo ink').click());
  expect(svg.querySelector('path')?.getAttribute('d')).toBe(geometry);
  expect(fetch).not.toHaveBeenCalled();
});

test('an export failure preserves the note and does not publish ink changes', async () => {
  const record = vi.fn();
  vi.stubGlobal('URL', class extends URL {static createObjectURL(): string {throw new Error('unavailable');}});
  await act(async () => root.render(<Workspace record={record}/>));
  await act(async () => button('Export Pad backup').click());
  expect(host.textContent).toContain('Could not start the export. Your Pad is unchanged.');
  expect(host.querySelector('textarea')?.value).toBe('My proof');
  expect(record).not.toHaveBeenCalled();
});
