import {afterEach, describe, expect, it, vi} from 'vitest';
import {createNgramClient} from '../../../src/features/tutor/writingAid/decoder/ngramClient';
import {clearKeyTouches, recordKeyTouch} from '../../../src/features/tutor/writingAid/decoder/ngramSpatial';
import type {NgramReply, NgramRequest, PreloadRequest, PreloadReply} from '../../../src/features/tutor/writingAid/decoder/ngram.worker';
import type {WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';

class WorkerDouble extends EventTarget {
  readonly messages: NgramRequest[] = [];
  readonly preloads: PreloadRequest[] = [];
  static latest: WorkerDouble;
  constructor() {super(); WorkerDouble.latest = this;}
  postMessage(request: NgramRequest | PreloadRequest) {
    if ('preload' in request) this.preloads.push(request);
    else this.messages.push(request);
  }
  terminate = vi.fn();
  reply(data: NgramReply | PreloadReply) {this.dispatchEvent(new MessageEvent('message', {data}));}
}

const snapshot = (text: string, revision: number): WritingAidRequest => ({
  cursor: {text, start: text.length, end: text.length}, anchor: {text, start: 0}, mode: 'balanced',
  composing: false, readOnly: false, target: {scopeKey: 'owner', mountId: 'editor', editorRevision: revision, selectionRevision: 0, modeRevision: 0},
});

afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals(); clearKeyTouches();});

describe('N-gram worker client', () => {
  it('preloads without draft text and sends only the latest prefix when the dictionary is indexed', async () => {
    vi.stubGlobal('Worker', WorkerDouble);
    const client = createNgramClient()!, worker = WorkerDouble.latest;
    const warm = client.preload(false, 'personal');
    expect(client.preload(false, 'personal')).toBe(warm);
    const first = client.predict(snapshot('app', 1));
    const second = client.predict(snapshot('appl', 2));
    const latest = client.predict(snapshot('apply', 3));
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(worker.preloads).toEqual([{preload: true, expanded: false, arm: 'personal'}]);
    expect(worker.messages).toHaveLength(0);
    worker.reply({preloaded: true});
    await expect(warm).resolves.toBe(true);
    expect(worker.messages.map(message => message.request.cursor.text)).toEqual(['apply']);
    worker.reply({id: 3, pool: {words: [], edit: [], ghost: []}, computeMs: 1});
    await expect(latest).resolves.toMatchObject({computeMs: 1});
    client.close();
  });

  it('releases a preloading worker, its timers and pending draft when closed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerDouble);
    const client = createNgramClient()!, worker = WorkerDouble.latest;
    const warm = client.preload(true);
    const query = client.predict(snapshot('app', 1));
    client.close();
    worker.reply({preloaded: true});
    await expect(warm).resolves.toBe(false);
    await expect(query).resolves.toBe('unavailable');
    expect(worker.messages).toHaveLength(0);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('coalesces queued requests and ignores cancelled or mismatched replies', async () => {
    vi.stubGlobal('Worker', WorkerDouble);
    const client = createNgramClient()!;
    const worker = WorkerDouble.latest;
    const first = client.predict(snapshot('n', 1));
    client.cancel();
    await expect(first).resolves.toBeNull();
    const skipped = client.predict(snapshot('not', 2));
    recordKeyTouch(3, 'a', {x: 2, y: 2});
    const latest = snapshot('nota', 3);
    const pending = client.predict(latest);
    await expect(skipped).resolves.toBeNull();
    expect(worker.messages.map(message => message.request.cursor.text)).toEqual(['n']);
    worker.reply({id: 1, pool: {words: [], ghost: [], edit: []}, computeMs: 2});
    expect(worker.messages.map(message => message.request.cursor.text)).toEqual(['n', 'nota']);
    expect(worker.messages[1].touches).toEqual([{position: 3, letter: 'a', touch: {x: 2, y: 2}}]);
    worker.reply({id: 2, pool: {words: [], ghost: [], edit: []}, computeMs: 1});
    worker.reply({id: 3, pool: {words: [{kind: 'word', start: 0, end: 4, before: 'nota', label: 'notation', insert: 'notation '}],
      ghost: [], edit: []}, computeMs: 3});
    const result = await pending;
    expect(result).toMatchObject({computeMs: 3, pool: {words: [{insert: 'notation '}]}});
    if (result && result !== 'unavailable') expect(result.pool.words[0].snapshot).toBe(latest);
    client.close();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('releases a queued query when the active worker hangs after startup', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerDouble);
    const client = createNgramClient()!;
    const worker = WorkerDouble.latest;
    const cold = client.predict(snapshot('def', 1));
    worker.reply({id: 1, pool: {words: [], ghost: [], edit: []}, computeMs: 1});
    await expect(cold).resolves.toMatchObject({computeMs: 1});
    const active = client.predict(snapshot('defi', 2));
    const queued = client.predict(snapshot('defin', 3));
    await vi.advanceTimersByTimeAsync(500);
    await expect(active).resolves.toBe('unavailable');
    await expect(queued).resolves.toBe('unavailable');
    expect(client.diagnostics()).toEqual({requests: 2, failures: 1, dropped: 0, timeouts: 1});
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('makes worker startup and transport faults visible to the fallback', async () => {
    vi.stubGlobal('Worker', WorkerDouble);
    const client = createNgramClient()!;
    const result = client.predict(snapshot('def', 1));
    WorkerDouble.latest.dispatchEvent(new Event('error'));
    await expect(result).resolves.toBe('unavailable');
    await expect(client.predict(snapshot('defi', 2))).resolves.toBe('unavailable');
  });
});
