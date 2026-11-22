import {act, createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {createWritingDecoderClient, type DecoderWorker, type WritingDecoderClient} from '../../../src/features/tutor/writingAid/decoder/client';
import type {DecoderCandidate} from '../../../src/features/tutor/writingAid/decoder/lexicon';
import type {DecoderQuery} from '../../../src/features/tutor/writingAid/decoder/protocol';
import type {WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';
import {useWritingAid, type WritingAidView} from '../../../src/features/tutor/writingAid/useWritingAid';

vi.mock('../../../src/data/mode', () => ({getMode: () => 'demo', getDemoProfile: () => 'decoder-runtime-test'}));

class FakeWorker implements DecoderWorker {
  static instances: FakeWorker[] = [];
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  onmessageerror: Worker['onmessageerror'] = null;
  requests: DecoderQuery[] = [];
  terminate = vi.fn();
  constructor() {FakeWorker.instances.push(this);}
  postMessage(message: DecoderQuery) {this.requests.push(message);}
  respond(data: unknown) {this.onmessage?.call(this as unknown as Worker, {data} as MessageEvent);}
  result(query: DecoderQuery, candidates: readonly DecoderCandidate[]) {
    this.respond({type: 'result', id: query.id, prefix: query.prefix, candidates});
  }
  fail(event: 'error' | 'messageerror') {
    if (event === 'error') this.onerror?.call(this as unknown as Worker, new ErrorEvent('error'));
    else this.onmessageerror?.call(this as unknown as Worker, new MessageEvent('messageerror'));
  }
}

const notation = {word: 'notation', frequency: 180} as const;
const notate = {word: 'notate', frequency: 160} as const;
const clients: WritingDecoderClient[] = [];
function client(worker = new FakeWorker(), timeoutMs = 1000) {
  const createWorker = vi.fn(() => worker);
  const runtime = createWritingDecoderClient({createWorker, timeoutMs});
  clients.push(runtime);
  return {runtime, worker, createWorker};
}

describe('writing decoder worker transport', () => {
  beforeEach(() => {vi.useFakeTimers(); FakeWorker.instances = [];});
  afterEach(() => {for (const runtime of clients.splice(0)) runtime.dispose(); vi.useRealTimers();});

  it('starts lazily for valid prefixes and sends no draft, owner, or question data', async () => {
    const {runtime, worker, createWorker} = client();
    for (const prefix of ['', 'n', 'NOTA', 'two words', '\\alpha', 'a'.repeat(32)]) {
      expect(await runtime.query(prefix)).toBeUndefined();
    }
    expect(createWorker).not.toHaveBeenCalled();
    const pending = runtime.query('nota');
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.requests).toEqual([{type: 'query', id: 1, prefix: 'nota'}]);
    worker.result(worker.requests[0], [notation]);
    expect(await pending).toEqual([notation]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves retired queries as fallback and ignores out-of-order or duplicate replies', async () => {
    const {runtime, worker, createWorker} = client();
    const first = runtime.query('nota');
    const second = runtime.query('notat');
    expect(await first).toBeUndefined();
    let settled = false;
    void second.then(() => {settled = true;});
    worker.result(worker.requests[0], [notation]);
    await Promise.resolve();
    expect(settled).toBe(false);
    worker.result(worker.requests[1], [notation]);
    expect(await second).toEqual([notation]);
    worker.result(worker.requests[1], [notation]);
    const third = runtime.query('denomina');
    worker.result(worker.requests[2], [{word: 'denominator', frequency: 120}]);
    expect(await third).toEqual([{word: 'denominator', frequency: 120}]);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('preserves logic risk tags instead of reducing replies to word strings', async () => {
    const {runtime, worker} = client();
    const pending = runtime.query('nonneg');
    const candidates = [{word: 'nonnegative', frequency: 100, riskTags: ['logic'] as const}];
    worker.result(worker.requests[0], candidates);
    const result = await pending;
    expect(result).toEqual(candidates);
    expect(result).not.toBe(candidates);
    expect(result?.[0].riskTags).toEqual(['logic']);
  });

  it('aborts a request without giving its late result authority over the next query', async () => {
    const {runtime, worker} = client();
    const abort = new AbortController();
    const first = runtime.query('nota', abort.signal);
    abort.abort();
    expect(await first).toBeUndefined();
    const second = runtime.query('denomina');
    worker.result(worker.requests[0], [notation]);
    worker.result(worker.requests[1], [{word: 'denominator', frequency: 100}]);
    expect(await second).toEqual([{word: 'denominator', frequency: 100}]);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not initialize for an already aborted request', async () => {
    const {runtime, createWorker} = client();
    const abort = new AbortController();
    abort.abort();
    expect(await runtime.query('nota', abort.signal)).toBeUndefined();
    expect(createWorker).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retires a failed asset load even when its last query was already cancelled', async () => {
    const {runtime, worker, createWorker} = client();
    const abort = new AbortController();
    const pending = runtime.query('nota', abort.signal);
    abort.abort();
    expect(await pending).toBeUndefined();
    worker.respond({type: 'unavailable', id: worker.requests[0].id});
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await runtime.query('notat')).toBeUndefined();
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('keeps the startup deadline after cancellation during a hung module or storage load', async () => {
    const {runtime, worker, createWorker} = client();
    const abort = new AbortController();
    const pending = runtime.query('nota', abort.signal);
    await vi.advanceTimersByTimeAsync(500);
    abort.abort();
    expect(await pending).toBeUndefined();
    await vi.advanceTimersByTimeAsync(499);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await runtime.query('notat')).toBeUndefined();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears startup on a valid retired reply without resurrecting its cancelled proposal', async () => {
    const {runtime, worker, createWorker} = client();
    const abort = new AbortController();
    const pending = runtime.query('nota', abort.signal);
    abort.abort();
    expect(await pending).toBeUndefined();
    worker.result(worker.requests[0], [notation]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(await pending).toBeUndefined();
    const next = runtime.query('notat');
    worker.result(worker.requests[1], [notation]);
    expect(await next).toEqual([notation]);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  const malformed = [
    ['wrong prefix', {type: 'result', id: 1, prefix: 'denomina', candidates: [notation]}],
    ['unknown risk tag', {type: 'result', id: 1, prefix: 'nota', candidates: [{...notation, riskTags: ['safe']}]}],
    ['duplicate word', {type: 'result', id: 1, prefix: 'nota', candidates: [notation, notation]}],
    ['non-prefix word', {type: 'result', id: 1, prefix: 'nota', candidates: [{word: 'question', frequency: 200}]}],
    ['invalid frequency', {type: 'result', id: 1, prefix: 'nota', candidates: [{...notation, frequency: NaN}]}],
    ['oversized candidate list', {type: 'result', id: 1, prefix: 'nota', candidates: Array(65).fill(notation)}],
    ['unavailable asset', {type: 'unavailable', id: 1}],
    ['missing request identity', {type: 'result', prefix: 'nota', candidates: [notation]}],
  ] as const;
  it.each(malformed)('falls back and stops retrying after %s', async (_name, reply) => {
    const {runtime, worker, createWorker} = client();
    const pending = runtime.query('nota');
    worker.respond(reply);
    expect(await pending).toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await runtime.query('notat')).toBeUndefined();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['error', 'messageerror'] as const)('keeps a worker %s failure sticky for this client', async event => {
    const {runtime, worker, createWorker} = client();
    const pending = runtime.query('nota');
    worker.fail(event);
    expect(await pending).toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await runtime.query('notat')).toBeUndefined();
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('contains worker construction and postMessage failures', async () => {
    for (const failure of ['construct', 'post'] as const) {
      const worker = new FakeWorker();
      if (failure === 'post') worker.postMessage = () => {throw new DOMException('Cannot clone', 'DataCloneError');};
      const createWorker = vi.fn(() => {
        if (failure === 'construct') throw new DOMException('Workers blocked', 'SecurityError');
        return worker;
      });
      const runtime = createWritingDecoderClient({createWorker});
      clients.push(runtime);
      expect(await runtime.query('nota')).toBeUndefined();
      expect(await runtime.query('notat')).toBeUndefined();
      expect(createWorker).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('bounds a silent worker wait and never restarts it after timeout', async () => {
    const {runtime, worker, createWorker} = client();
    const pending = runtime.query('nota');
    let settled = false;
    void pending.then(() => {settled = true;});
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await runtime.query('notat')).toBeUndefined();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes pending work idempotently and ignores a reply already queued before disposal', async () => {
    const {runtime, worker} = client();
    const pending = runtime.query('nota');
    const queuedHandler = worker.onmessage!;
    runtime.dispose();
    runtime.dispose();
    queuedHandler.call(worker as unknown as Worker, {data: {type: 'result', id: 1, prefix: 'nota', candidates: [notation]}} as MessageEvent);
    expect(await pending).toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await runtime.query('notat')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not lose a synchronous response during postMessage', async () => {
    const {runtime, worker} = client();
    worker.postMessage = query => worker.result(query, [notation]);
    expect(await runtime.query('nota')).toEqual([notation]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('writing decoder editor lifecycle', () => {
  let root: Root, host: HTMLDivElement, view: WritingAidView;
  function request(text: string, changes: Partial<WritingAidRequest> = {}): WritingAidRequest {
    return {cursor: padEdit(text), anchor: {text, start: 0}, mode: 'balanced', composing: false, readOnly: false,
      target: {scopeKey: 'demo:checkpoint-one', mountId: 'composer', editorRevision: 1, selectionRevision: 1, modeRevision: 1},
      ...changes};
  }
  function Harness({input}: {input: WritingAidRequest}) {view = useWritingAid(input); return null;}
  async function settle() {await act(async () => {await new Promise(resolve => setTimeout(resolve, 35));});}
  async function render(input: WritingAidRequest) {
    await act(async () => {root.render(createElement(Harness, {input}));});
    await act(async () => {await vi.dynamicImportSettled();});
    await settle();
  }

  beforeEach(() => {
    Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
    vi.useRealTimers();
    localStorage.clear();
    window.history.replaceState({}, '', '/?flags=writingDecoder');
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retains baseline suggestions while decoding and adds only a current validated completion', async () => {
    const input = request('I am reco');
    await render(input);
    expect(view.words.map(item => item.label)).toContain('recoin');
    expect(view.words.map(item => item.label)).not.toContain('record');
    const worker = FakeWorker.instances[0];
    expect(worker.requests.at(-1)?.prefix).toBe('reco');
    await act(async () => worker.result(worker.requests.at(-1)!, [{word: 'record', frequency: 160}]));
    expect(view.words.map(item => item.label)).toContain('record');
    expect(input.cursor.text).toBe('I am reco');
  });

  it('never initializes the decoder when its flag is off', async () => {
    window.history.replaceState({}, '', '/?flags=-writingDecoder');
    await render(request('nota'));
    expect(view.words.map(item => item.label)).toContain('notation');
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('rejects the former draft result while preserving the new baseline strip', async () => {
    await render(request('nota'));
    const worker = FakeWorker.instances[0], original = worker.requests.at(-1)!;
    await render(request('denomina'));
    await act(async () => worker.result(original, [notate]));
    expect(view.words.map(item => item.label)).toContain('denominator');
    expect(view.words.every(item => item.label.startsWith('denomina'))).toBe(true);
  });

  it('revokes a pending result when selection stops being a typing position', async () => {
    await render(request('nota'));
    const worker = FakeWorker.instances[0], original = worker.requests.at(-1)!;
    await render(request('nota', {cursor: padEdit('nota', 3, 4)}));
    await act(async () => worker.result(original, [notate]));
    expect(view.words).toEqual([]);
    expect(view.ghost).toBeNull();
    expect(view.edit).toBeNull();
  });

  it.each(['off', 'scope'] as const)('disposes a worker and rejects queued replies after an %s boundary', async boundary => {
    const input = request('nota');
    await render(input);
    const worker = FakeWorker.instances[0], original = worker.requests.at(-1)!, queuedHandler = worker.onmessage!;
    const next = boundary === 'off' ? request('nota', {mode: 'off'}) :
      request('denomina', {target: {...input.target, scopeKey: 'another-owner:checkpoint'}});
    await render(next);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await act(async () => queuedHandler.call(worker as unknown as Worker,
      {data: {type: 'result', id: original.id, prefix: original.prefix, candidates: [notate]}} as MessageEvent));
    expect(view.words.map(item => item.label)).not.toContain('notate');
    if (boundary === 'off') expect(view.words).toEqual([]);
    else expect(view.words.map(item => item.label)).toContain('denominator');
  });
});
