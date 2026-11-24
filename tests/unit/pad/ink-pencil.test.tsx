import {act, useState, type ComponentProps} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {InkCanvas} from '../../../src/ui/v7/ink/InkCanvas';
import {initializePadInk, type PadInkHistory} from '../../../src/ui/v7/ink/ink';

const original = [{x: 30, y: 40}, {x: 90, y: 40}];
type CanvasOptions = Partial<Pick<ComponentProps<typeof InkCanvas>, 'mode' | 'onPan' | 'onStroke' | 'onStrokeEnd' | 'panTouches'>>;
type PointEvent = [event: 'down' | 'move' | 'up' | 'cancel' | 'lost', input: 'touch' | 'pen' | 'mouse', id: number, x?: number, y?: number];
let root: Root, host: HTMLElement, now: number;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function paper(options: CanvasOptions = {}, initial = initializePadInk([original])!) {
  const record = vi.fn<(history: PadInkHistory) => void>();
  function Canvas() {
    const [history, update] = useState(initial);
    return <InkCanvas label="Paper" history={history} onChange={next => {record(next); update(next);}} {...options}/>;
  }
  await act(async () => root.render(<Canvas/>));
  const svg = host.querySelector('svg')!;
  Object.assign(svg, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    getBoundingClientRect: () => new DOMRect(0, 0, 640, 400),
  });
  return {
    record,
    paths: () => Array.from(svg.querySelectorAll('path:not([data-live-stroke])'), element => element.getAttribute('d')),
    live: () => svg.querySelector('[data-live-stroke]'),
    send: (...events: PointEvent[]) => act(async () => {
      for (const [event, pointerType, pointerId, clientX = 30, clientY = 40] of events) {
        svg.dispatchEvent(new PointerEvent(event === 'lost' ? 'lostpointercapture' : 'pointer' + event, {
          bubbles: true, button: 0, pointerType, pointerId, clientX, clientY,
        }));
      }
    }),
  };
}

test('a palm contacting first does not commit ink or prevent a complete pen stroke, even without panning', async () => {
  const onStroke = vi.fn(), onStrokeEnd = vi.fn();
  const canvas = await paper({onStroke, onStrokeEnd});
  await canvas.send(['down', 'touch', 1], ['move', 'touch', 1, 60, 60]);
  expect(canvas.live()).not.toBeNull();
  expect(canvas.record).not.toHaveBeenCalled();
  await canvas.send(['down', 'pen', 2, 100, 120], ['lost', 'touch', 1], ['move', 'pen', 2, 130, 130]);
  expect(canvas.paths()).toEqual(['M30 40L90 40']);
  expect(canvas.live()).not.toBeNull();
  await canvas.send(['up', 'touch', 1], ['up', 'pen', 2, 150, 140]);
  expect(canvas.record).toHaveBeenCalledExactlyOnceWith({
    strokes: [original, [{x: 100, y: 120}, {x: 130, y: 130}, {x: 150, y: 140}]], undo: [[original]],
  });
  expect(onStroke).toHaveBeenCalledTimes(2);
  expect(onStrokeEnd).toHaveBeenCalledTimes(2);
});

test('pen takeover rolls back a provisional palm erasure and erases only what the pencil touches', async () => {
  const second = [{x: 150, y: 140}, {x: 200, y: 140}];
  const canvas = await paper({mode: 'eraser', onPan: vi.fn(), panTouches: 2}, initializePadInk([original, second])!);
  await canvas.send(['down', 'touch', 1]);
  expect(canvas.paths()).toEqual(['M150 140L200 140']);
  expect(canvas.record).not.toHaveBeenCalled();
  await canvas.send(['down', 'pen', 2, 160, 140], ['cancel', 'touch', 1]);
  expect(canvas.paths()).toEqual(['M30 40L90 40']);
  await canvas.send(['up', 'pen', 2, 165, 140]);
  expect(canvas.record).toHaveBeenCalledExactlyOnceWith({strokes: [original], undo: [[original, second]]});
});

test('stationary pen and the post-lift window block new touches while stale contacts cannot join a later pan', async () => {
  const onPan = vi.fn();
  const canvas = await paper({onPan, panTouches: 2});
  await canvas.send(['down', 'touch', 1], ['down', 'pen', 2, 100, 100]);
  now += 1200;
  await canvas.send(['down', 'touch', 3], ['down', 'touch', 4], ['move', 'touch', 3, 40, 50], ['move', 'touch', 4, 50, 60]);
  expect(canvas.record).not.toHaveBeenCalled();
  expect(onPan).not.toHaveBeenCalled();
  await canvas.send(['up', 'pen', 2, 120, 120]);
  now += 200;
  await canvas.send(['down', 'touch', 5], ['move', 'touch', 5, 65, 60]);
  now += 1000;
  await canvas.send(['move', 'touch', 1, 40, 50], ['move', 'touch', 3, 60, 50], ['move', 'touch', 4, 70, 50], ['move', 'touch', 5, 80, 50]);
  expect(onPan).not.toHaveBeenCalled();
  expect(canvas.live()).toBeNull();
  // A fresh finger must be able to draw even while the rejected contacts have yet to lift.
  await canvas.send(['down', 'touch', 6, 230, 200], ['up', 'touch', 6, 260, 200]);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M100 100L120 120', 'M230 200L260 200']);
  expect(onPan).not.toHaveBeenCalled();
});

test('a cancelled pen stroke retains ink and ignores cancel coordinates; touch recovers after the guard', async () => {
  const canvas = await paper();
  await canvas.send(['down', 'pen', 1, 100, 100], ['move', 'pen', 1, 130, 130], ['cancel', 'pen', 1, 250, 250], ['lost', 'pen', 1]);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M100 100L130 130']);
  await canvas.send(['down', 'touch', 2], ['up', 'touch', 2, 50, 60]);
  expect(canvas.record).toHaveBeenCalledTimes(1);
  now += 1000;
  await canvas.send(['down', 'touch', 2], ['move', 'touch', 2, 50, 60], ['cancel', 'touch', 2, 300, 300]);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M100 100L130 130', 'M30 40L50 60']);
  expect(canvas.record).toHaveBeenCalledTimes(2);
});

test('intentional two-finger pan discards the tentative first finger stroke without changing saved ink', async () => {
  const onPan = vi.fn();
  const canvas = await paper({onPan, panTouches: 2});
  await canvas.send(['down', 'touch', 1], ['down', 'touch', 2, 70, 80], ['move', 'touch', 1, 40, 40]);
  expect(onPan).not.toHaveBeenCalled();
  expect(canvas.live()).not.toBeNull();
  await canvas.send(['move', 'touch', 2, 100, 84], ['move', 'touch', 1, 60, 44], ['up', 'touch', 1], ['up', 'touch', 2]);
  expect(onPan).toHaveBeenCalledWith(10, 2, 'touch', 2);
  expect(canvas.live()).toBeNull();
  expect(canvas.paths()).toEqual(['M30 40L90 40']);
  expect(canvas.record).not.toHaveBeenCalled();
});

test('an interrupted finger stroke before pen contact is still retained', async () => {
  const canvas = await paper({onPan: vi.fn(), panTouches: 2});
  await canvas.send(['down', 'touch', 1, 30, 60], ['move', 'touch', 1, 50, 60], ['cancel', 'touch', 1, 300, 300]);
  await canvas.send(['down', 'pen', 2, 110, 160], ['up', 'pen', 2, 150, 160]);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M30 60L50 60', 'M110 160L150 160']);
  expect(canvas.record).toHaveBeenCalledTimes(2);
});

test('pen contact ends an ongoing touch pan, without resuming it when the pen lifts', async () => {
  const onPan = vi.fn();
  const canvas = await paper({onPan, panTouches: 2});
  await canvas.send(['down', 'touch', 1], ['down', 'touch', 2, 70, 80], ['move', 'touch', 1, 45, 45], ['move', 'touch', 2, 80, 90]);
  expect(onPan).toHaveBeenCalledTimes(1);
  await canvas.send(['down', 'pen', 3, 100, 100], ['move', 'touch', 1, 55, 55], ['up', 'pen', 3, 120, 120]);
  now += 1000;
  await canvas.send(['move', 'touch', 1, 65, 65], ['move', 'touch', 2, 90, 100], ['up', 'touch', 1], ['up', 'touch', 2]);
  expect(onPan).toHaveBeenCalledTimes(1);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M100 100L120 120']);
});

test('a reused pointer ID starts a fresh lifetime after a rejected contact ends outside the canvas', async () => {
  const canvas = await paper({onPan: vi.fn(), panTouches: 2});
  await canvas.send(['down', 'pen', 1, 100, 100], ['down', 'touch', 2], ['up', 'pen', 1, 120, 120]);
  // No terminal event for touch 2 reaches the canvas. A new contact reuses its ID.
  now += 1000;
  await canvas.send(['down', 'touch', 2, 180, 200], ['up', 'touch', 2, 220, 200]);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M100 100L120 120', 'M180 200L220 200']);
});
