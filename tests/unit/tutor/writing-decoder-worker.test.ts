import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {DecoderLexicon} from '../../../src/features/tutor/writingAid/decoder/lexicon';
import type {DecoderQuery, DecoderReply} from '../../../src/features/tutor/writingAid/decoder/protocol';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../../src/features/tutor/writingAid/decoder/assets', () => ({loadWritingDecoderLexicon: load}));
let scope: {onmessage: ((event: MessageEvent<DecoderQuery>) => void) | null; postMessage: ReturnType<typeof vi.fn>};
const lexicon: DecoderLexicon = {version: 1, entries: [
  {word: 'none', frequency: 100, riskTags: ['logic']},
  {word: 'notation', frequency: 90}, {word: 'notion', frequency: 80}, {word: 'record', frequency: 120},
]};
const query = (id: number, prefix: string) => scope.onmessage?.({data: {type: 'query', id, prefix}} as MessageEvent<DecoderQuery>);
const settle = async () => {await Promise.resolve(); await Promise.resolve(); await Promise.resolve();};

beforeEach(() => {
  vi.resetModules(); load.mockReset();
  scope = {onmessage: null, postMessage: vi.fn()}; vi.stubGlobal('self', scope);
});
afterEach(() => vi.unstubAllGlobals());

describe('actual decoder worker module', () => {
  it('loads once, coalesces a burst of cold prefixes, then responds without reloading', async () => {
    let resolve!: (asset: DecoderLexicon) => void;
    load.mockImplementation(() => new Promise<DecoderLexicon>(done => {resolve = done;}));
    await import('../../../src/features/tutor/writingAid/decoder/writingDecoder.worker');
    for (let id = 1; id <= 1000; id++) query(id, id === 1000 ? 'reco' : 'nota');
    expect(load).toHaveBeenCalledOnce(); expect(scope.postMessage).not.toHaveBeenCalled();
    resolve(lexicon); await settle();
    expect(scope.postMessage.mock.calls).toEqual([[{type: 'result', id: 1000, prefix: 'reco',
      candidates: [{word: 'record', frequency: 120}]}]]);
    query(1001, 'non');
    expect(scope.postMessage).toHaveBeenLastCalledWith({type: 'result', id: 1001, prefix: 'non',
      candidates: [{word: 'none', frequency: 100, riskTags: ['logic']}]} satisfies DecoderReply);
    expect(load).toHaveBeenCalledOnce();
  });

  it('latches a failed asset load and fails future queries immediately', async () => {
    let reject!: (reason: Error) => void;
    load.mockImplementation(() => new Promise<DecoderLexicon>((_resolve, fail) => {reject = fail;}));
    await import('../../../src/features/tutor/writingAid/decoder/writingDecoder.worker');
    query(1, 'nota'); query(2, 'reco'); reject(new Error('integrity failure')); await settle();
    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({type: 'unavailable', id: 2});
    query(3, 'notat');
    expect(scope.postMessage).toHaveBeenLastCalledWith({type: 'unavailable', id: 3});
    expect(load).toHaveBeenCalledOnce();
  });

  it('ignores malformed queries before loading an asset', async () => {
    await import('../../../src/features/tutor/writingAid/decoder/writingDecoder.worker');
    for (const value of [null, {}, {type: 'query', id: 0, prefix: 'nota'}, {type: 'query', id: 1, prefix: ''},
      {type: 'query', id: 2, prefix: 'private draft'}, {type: 'other', id: 3, prefix: 'nota'}]) {
      scope.onmessage?.({data: value} as MessageEvent<DecoderQuery>);
    }
    expect(load).not.toHaveBeenCalled(); expect(scope.postMessage).not.toHaveBeenCalled();
  });
});
