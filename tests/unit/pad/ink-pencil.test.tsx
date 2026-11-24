import {act, useState, type ComponentProps} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {InkCanvas} from '../../../src/ui/v7/ink/InkCanvas';
import {initializePadInk, type PadInkHistory} from '../../../src/ui/v7/ink/ink';

const original = [{x: 30, y: 40}, {x: 90, y: 40}];
type CanvasOptions = Partial<Pick<ComponentProps<typeof InkCanvas>, 'mode' | 'onPan' | 'onStroke' | 'onStrokeEnd' | 'panTouches' | 'pencilOnly' | 'pencilTipEraser' | 'eraserKind'>>;
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

test('Pencil-only rejects finger and mouse ink but still permits two-finger navigation', async () => {
  const onPan = vi.fn();
  const canvas = await paper({pencilOnly: true, onPan, panTouches: 2});
  await canvas.send(['down', 'touch', 1], ['move', 'touch', 1, 65, 45], ['up', 'touch', 1]);
  await canvas.send(['down', 'mouse', 2], ['up', 'mouse', 2, 70, 60]);
  expect(canvas.live()).toBeNull();
  expect(canvas.record).not.toHaveBeenCalled();
  await canvas.send(['down', 'touch', 3], ['down', 'touch', 4, 70, 80], ['move', 'touch', 3, 40, 40], ['move', 'touch', 4, 100, 84]);
  expect(onPan).toHaveBeenCalledWith(15, 2, 'touch', 2);
  await canvas.send(['up', 'touch', 3], ['up', 'touch', 4], ['down', 'pen', 5, 110, 80], ['up', 'pen', 5, 150, 80]);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M110 80L150 80']);
  expect(canvas.record).toHaveBeenCalledTimes(1);
});

test('Pencil-only also protects committed ink from touch or mouse in manual eraser mode', async () => {
  const canvas = await paper({pencilOnly: true, mode: 'eraser'});
  await canvas.send(['down', 'touch', 1], ['up', 'touch', 1], ['down', 'mouse', 2], ['up', 'mouse', 2]);
  expect(canvas.paths()).toEqual(['M30 40L90 40']);
  expect(canvas.record).not.toHaveBeenCalled();
  await canvas.send(['down', 'pen', 3], ['up', 'pen', 3]);
  expect(canvas.paths()).toEqual([]);
  expect(canvas.record).toHaveBeenCalledExactlyOnceWith({strokes: [], undo: [[original]]});
});

test('Pencil-only keeps deliberate one-contact Hand navigation', async () => {
  const onPan = vi.fn();
  const canvas = await paper({pencilOnly: true, mode: 'hand', onPan, panTouches: 2});
  await canvas.send(['down', 'touch', 1], ['move', 'touch', 1, 47, 54], ['up', 'touch', 1]);
  expect(onPan).toHaveBeenCalledExactlyOnceWith(17, 14, 'hand');
  expect(canvas.record).not.toHaveBeenCalled();
});

test('two nearby quick tip taps make no ink and only the next Pencil stroke erases', async () => {
  const canvas = await paper({pencilTipEraser: true});
  await canvas.send(['down', 'pen', 1, 110, 80]);
  expect(canvas.live()).not.toBeNull();
  now += 90;
  await canvas.send(['up', 'pen', 1, 114, 80]);
  now += 150;
  await canvas.send(['down', 'pen', 2, 120, 80]);
  now += 170;
  await canvas.send(['up', 'pen', 2, 120, 80]);
  expect(canvas.record).not.toHaveBeenCalled();
  await canvas.send(['down', 'pen', 3, 50, 40], ['up', 'pen', 3, 70, 40]);
  expect(canvas.record).toHaveBeenCalledExactlyOnceWith({strokes: [], undo: [[original]]});
  await canvas.send(['down', 'pen', 4, 110, 120], ['up', 'pen', 4, 150, 120]);
  expect(canvas.paths()).toEqual(['M110 120L150 120']);
  expect(canvas.record).toHaveBeenCalledTimes(2);
});

test('a lone short tip dot is kept, and long tip dots commit without waiting', async () => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  try {
    const canvas = await paper({pencilTipEraser: true});
    await canvas.send(['down', 'pen', 1, 110, 80], ['up', 'pen', 1, 110, 80]);
    expect(canvas.record).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(300));
    expect(canvas.paths()).toEqual(['M30 40L90 40', 'M110 80h.01']);
    await canvas.send(['down', 'pen', 2, 130, 100]);
    now += 181;
    await canvas.send(['up', 'pen', 2, 130, 100]);
    expect(canvas.paths()).toEqual(['M30 40L90 40', 'M110 80h.01', 'M130 100h.01']);
    expect(canvas.record).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test.each([['far apart', 100, 132], ['too far apart in time', 301, 112], ['moving beyond tap slop', 100, 115]] as const)(
  'tip taps %s do not erase or lose ordinary marks',
  async (scenario, gap, x) => {
    const canvas = await paper({pencilTipEraser: true});
    await canvas.send(['down', 'pen', 1, 110, 80], ['up', 'pen', 1, 110, 80]);
    now += gap;
    await canvas.send(['down', 'pen', 2, scenario === 'moving beyond tap slop' ? 110 : x, 80], ['up', 'pen', 2, x, 80]);
    now += 50;
    await canvas.send(['down', 'pen', 3, 50, 40], ['up', 'pen', 3, 70, 40]);
    expect(canvas.paths()).toEqual([
      'M30 40L90 40', 'M110 80h.01',
      scenario === 'moving beyond tap slop' ? 'M110 80L115 80' : `M${x} 80h.01`, 'M50 40L70 40',
    ]);
  },
);

test('the tip uses the selected pixel eraser for one swept commit and rolls back a cancelled pass', async () => {
  const horizontal = [{x: 100, y: 180}, {x: 300, y: 180}];
  const canvas = await paper({pencilTipEraser: true, eraserKind: 'pixel'}, initializePadInk([original, horizontal])!);
  const arm = async () => {
    await canvas.send(['down', 'pen', 1, 330, 100], ['up', 'pen', 1, 330, 100]);
    now += 80;
    await canvas.send(['down', 'pen', 2, 334, 100], ['up', 'pen', 2, 334, 100]);
  };
  await arm();
  await canvas.send(['down', 'pen', 3, 200, 140], ['move', 'pen', 3, 200, 180], ['cancel', 'pen', 3, 200, 220]);
  expect(canvas.paths()).toEqual(['M30 40L90 40', 'M100 180L300 180']);
  expect(canvas.record).not.toHaveBeenCalled();
  await canvas.send(['down', 'pen', 4, 310, 240], ['up', 'pen', 4, 350, 240]);
  await arm();
  // Neither reported end touches ink, but the swept path crosses the old line.
  await canvas.send(['down', 'pen', 3, 200, 140], ['up', 'pen', 3, 200, 220]);
  const committed = canvas.record.mock.calls.at(-1)![0];
  const newStroke = [{x: 310, y: 240}, {x: 350, y: 240}];
  expect(committed.strokes).toHaveLength(4);
  expect(committed.strokes[0]).toEqual(original);
  expect(committed.strokes[1][0]).toEqual(horizontal[0]);
  expect(committed.strokes[1].at(-1)!.x).toBeLessThan(200);
  expect(committed.strokes[2][0].x).toBeGreaterThan(200);
  expect(committed.strokes[2].at(-1)).toEqual(horizontal[1]);
  expect(committed.strokes[3]).toEqual(newStroke);
  expect(committed.undo).toEqual([[original, horizontal], [original, horizontal, newStroke]]);
  expect(canvas.record).toHaveBeenCalledTimes(2);
});

test('hovering Pencil does not postpone intentional finger panning on Pencil-only paper', async () => {
  const onPan = vi.fn();
  const canvas = await paper({pencilOnly: true, onPan, panTouches: 2});
  await canvas.send(['move', 'pen', 10, 110, 100]);
  await canvas.send(['down', 'touch', 1, 30, 40], ['down', 'touch', 2, 70, 80]);
  await canvas.send(['move', 'touch', 1, 41, 40], ['move', 'touch', 2, 95, 82]);
  expect(onPan).toHaveBeenCalledTimes(1);
  expect(canvas.record).not.toHaveBeenCalled();
});
