import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInkRasterizer } from '../../../src/features/tutor/input/detypifyRaster';
import { createInkRecognizer, TUTOR_MODEL_ASSET_SET } from '../../../src/features/tutor/input/inkRecognizer';
import type { InkWorkerRequest, InkWorkerResponse } from '../../../src/features/tutor/input/inkRecognizerProtocol';
import { MODEL_CLASS_COUNT } from '../../../src/features/tutor/input/modelAssets';
import type { InkSnapshot } from '../../../src/features/tutor/input/types';

class FakeWorker {
  static latest: FakeWorker;
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  requests: InkWorkerRequest[] = [];
  terminate = vi.fn();

  constructor() { FakeWorker.latest = this; }

  postMessage(message: InkWorkerRequest) { this.requests.push(message); }

  respond(message: InkWorkerResponse) { this.onmessage?.({ data: message } as MessageEvent); }

  ready() {
    this.respond({
      type: 'ready', assetSetVersion: TUTOR_MODEL_ASSET_SET, raster: 'worker',
      classes: Array.from({ length: MODEL_CLASS_COUNT }, (_, index) => ({
        classId: `class-${index}`, ...(index === 0 && { symbolId: 'forall' }),
      })),
    });
  }

  reply(id: number) {
    this.respond({
      type: 'result', assetSetVersion: TUTOR_MODEL_ASSET_SET,
      requestId: id, scores: new Float32Array(MODEL_CLASS_COUNT).fill(2),
    });
  }
}

function snapshot(inkRevision: number): InkSnapshot {
  return {
    target: { scopeKey: 'owner+question', mountId: 'draft', editorRevision: 1, selectionRevision: 2, modeRevision: 0 },
    sessionId: 'ink', assetSetVersion: TUTOR_MODEL_ASSET_SET, inkEpoch: 4, inkRevision, sampledAtMs: inkRevision * 3,
    strokes: [{ pointerType: 'touch', points: [{ x: 1, y: 3, t: 8 }, { x: 3, y: 1, t: 10 }] }],
    viewport: { width: 100, height: 100 }, overBudget: false, interrupted: false, completedRevision: null,
  };
}

const recognizers: ReturnType<typeof createInkRecognizer>[] = [];
function recognizer() {
  vi.stubGlobal('Worker', FakeWorker);
  const onReadiness = vi.fn();
  const onResult = vi.fn();
  const runtime = createInkRecognizer({ onReadiness, onResult });
  recognizers.push(runtime);
  return { runtime, onReadiness, onResult };
}

afterEach(() => {
  for (const runtime of recognizers.splice(0)) runtime.dispose();
  vi.unstubAllGlobals();
});

describe('local ink worker transport', () => {
  it('retains one replaceable request and combines every raw score with the exact private snapshot', () => {
    const { runtime, onReadiness, onResult } = recognizer();
    runtime.prepare();
    const worker = FakeWorker.latest;
    runtime.submit(snapshot(1));
    runtime.submit(snapshot(2));
    worker.ready();
    runtime.submit(snapshot(3));
    runtime.submit(snapshot(4));
    expect(onReadiness.mock.calls).toEqual([['loading'], ['ready']]);
    expect(worker.requests.map(request => request.type)).toEqual(['prepare', 'infer']);
    expect(worker.requests[1]).not.toHaveProperty('target');
    worker.reply(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toMatchObject({
      target: snapshot(2).target, inkRevision: 2, sampledAtMs: 6, scoreKind: 'logit',
    });
    const { rawScores } = onResult.mock.calls[0][0];
    expect(rawScores).toHaveLength(MODEL_CLASS_COUNT);
    expect(rawScores[0]).toEqual({ classId: 'class-0', score: 2, symbolId: 'forall' });
    expect(rawScores[1]).toEqual({ classId: 'class-1', score: 2 });
    expect(worker.requests.map(request => request.type)).toEqual(['prepare', 'infer', 'infer']);
    worker.reply(2);
    expect(onResult.mock.calls.map(([result]) => result.inkRevision)).toEqual([2, 4]);
  });

  it('drops cancelled and duplicate results and still delivers the next bounded request', () => {
    const { runtime, onResult } = recognizer();
    runtime.prepare();
    const worker = FakeWorker.latest;
    worker.ready();
    runtime.submit(snapshot(1));
    runtime.submit(snapshot(2));
    runtime.cancel();
    runtime.submit(snapshot(3));
    worker.reply(1);
    worker.reply(1);
    expect(onResult).not.toHaveBeenCalled();
    worker.reply(2);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toMatchObject({ inkRevision: 3 });
    runtime.dispose();
    worker.reply(2);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid geometry and treats a malformed worker result as unavailable', () => {
    const { runtime, onResult, onReadiness } = recognizer();
    runtime.prepare();
    const worker = FakeWorker.latest;
    worker.ready();
    runtime.submit({ ...snapshot(1), strokes: [{ pointerType: 'touch', points: [{ x: NaN, y: 0, t: 0 }] }] });
    expect(worker.requests.map(request => request.type)).toEqual(['prepare']);
    runtime.submit(snapshot(2));
    worker.respond({
      type: 'result', assetSetVersion: TUTOR_MODEL_ASSET_SET, requestId: 1, scores: new Float32Array(2),
    });
    expect(onResult).not.toHaveBeenCalled();
    expect(onReadiness).toHaveBeenLastCalledWith('unavailable');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

it('uses the pinned Detypify pixel geometry and re-centers the whole drawing after a stroke', () => {
  const rgba = new Uint8ClampedArray(224 * 224 * 4);
  rgba[4] = 64;
  rgba[5] = 255;
  const context = {
    resetTransform: vi.fn(), fillRect: vi.fn(), translate: vi.fn(), beginPath: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), getImageData: vi.fn(() => ({ data: rgba })),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  const rasterize = createInkRasterizer(canvas as unknown as HTMLCanvasElement)!;
  const first = { pointerType: 'touch', points: [{ x: 10, y: 20, t: 1 }, { x: 14, y: 20, t: 2 }] } as const;
  const second = { pointerType: 'touch', points: [{ x: 20, y: 18, t: 3 }, { x: 20, y: 22, t: 4 }] } as const;

  expect(rasterize([])).toBeUndefined();
  expect(rasterize([{ ...first, points: [first.points[0]] }])).toBeUndefined();
  const pixels = rasterize([first])!;
  expect([canvas.width, canvas.height]).toEqual([224, 224]);
  expect(context).toMatchObject({ fillStyle: 'black', strokeStyle: 'white', lineWidth: 9, lineCap: 'round' });
  expect(context.translate).toHaveBeenCalledWith(0.5, 0.5);
  expect(context.lineTo.mock.calls).toEqual([[9, 112], [215, 112]]);
  expect(pixels).toHaveLength(50_176);
  expect([...pixels.subarray(0, 3)]).toEqual([0, Math.fround(64 / 255), 0]);

  context.lineTo.mockClear();
  rasterize([first, second]);
  expect(context.resetTransform).toHaveBeenCalledTimes(2);
  expect(context.lineTo.mock.calls).toEqual([[9, 112], [91, 112], [215, 71], [215, 153]]);
});
