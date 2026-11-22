import {createHash, webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  DECODER_ASSET_MANIFEST, loadWritingDecoderLexicon, readVerifiedDecoderAsset,
} from '../../../src/features/tutor/writingAid/decoder/assets';

const sample = new TextEncoder().encode('{"test":"public asset"}');
const file = {path: 'lexicon.json', bytes: sample.byteLength,
  sha256: createHash('sha256').update(sample).digest('hex')};
const real = new Uint8Array(readFileSync('public/models/writing-decoder/unigram-v1/lexicon.json'));
const response = (bytes: Uint8Array = real) => new Response(bytes.slice().buffer);

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});

describe('bounded and hash-pinned decoder assets', () => {
  it('accepts only the exact pinned bytes, including streamed chunks', async () => {
    const stream = new ReadableStream<Uint8Array>({start(controller) {
      controller.enqueue(sample.slice(0, 4)); controller.enqueue(sample.slice(4)); controller.close();
    }});
    expect(Array.from(await readVerifiedDecoderAsset(new Response(stream), file))).toEqual(Array.from(sample));
  });

  it('rejects same-size corruption, truncation and an HTTP failure', async () => {
    const corrupted = sample.slice(); corrupted[0] ^= 1;
    await expect(readVerifiedDecoderAsset(response(corrupted), file)).rejects.toThrow('integrity');
    await expect(readVerifiedDecoderAsset(response(sample.slice(1)), file)).rejects.toThrow('Incomplete');
    await expect(readVerifiedDecoderAsset(new Response(null, {status: 404}), file)).rejects.toThrow('Invalid');
  });

  it('cancels an oversized stream before allocating or parsing more than the pinned length', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({start(controller) {
      controller.enqueue(new Uint8Array(file.bytes + 1));
    }, cancel});
    await expect(readVerifiedDecoderAsset(new Response(stream), file)).rejects.toThrow('exceeds');
    expect(cancel).toHaveBeenCalledOnce();
    await expect(readVerifiedDecoderAsset(new Response(null, {headers: {'content-length': String(file.bytes + 1)}}), file))
      .rejects.toThrow('Invalid');
  });

  it('rejects invalid manifest sizes and hashes before reading response data', async () => {
    for (const invalid of [{...file, bytes: 0}, {...file, bytes: 5 * 1024 * 1024},
      {...file, bytes: 1.2}, {...file, sha256: 'not-a-digest'}]) {
      await expect(readVerifiedDecoderAsset(response(sample), invalid)).rejects.toThrow('Invalid');
    }
  });

  it('uses a verified offline cache without fetching or persisting a draft', async () => {
    let saved: Response | undefined;
    const cache = {match: vi.fn(async () => saved?.clone()), delete: vi.fn(),
      put: vi.fn(async (_url: string, value: Response) => {saved = value;})};
    vi.stubGlobal('caches', {open: vi.fn(async () => cache)});
    const fetcher = vi.fn(async () => response()); vi.stubGlobal('fetch', fetcher);
    const first = await loadWritingDecoderLexicon();
    expect(first.entries).toHaveLength(DECODER_ASSET_MANIFEST.entryCount);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/models/writing-decoder/unigram-v1/lexicon.json'),
      expect.objectContaining({credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store'}));
    fetcher.mockRejectedValue(new Error('offline'));
    expect((await loadWritingDecoderLexicon()).entries).toEqual(first.entries);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
    expect([...cache.put.mock.calls[0]][0]).not.toContain('prefix');
  });

  it('evicts a corrupt cache entry and verifies its replacement', async () => {
    const corrupted = real.slice(); corrupted[5] ^= 1;
    const cache = {match: vi.fn(async () => response(corrupted)), delete: vi.fn(async () => true), put: vi.fn(async () => {})};
    vi.stubGlobal('caches', {open: vi.fn(async () => cache)});
    const fetcher = vi.fn(async () => response()); vi.stubGlobal('fetch', fetcher);
    expect((await loadWritingDecoderLexicon()).entries.length).toBe(DECODER_ASSET_MANIFEST.entryCount);
    expect(cache.delete).toHaveBeenCalledOnce(); expect(cache.put).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('loads when storage is denied, and never caches an invalid network response', async () => {
    vi.stubGlobal('caches', {open: vi.fn(async () => {throw new Error('Storage denied');})});
    vi.stubGlobal('fetch', vi.fn(async () => response()));
    expect((await loadWritingDecoderLexicon()).entries.length).toBe(DECODER_ASSET_MANIFEST.entryCount);
    const cache = {match: vi.fn(async () => undefined), put: vi.fn()};
    vi.stubGlobal('caches', {open: vi.fn(async () => cache)});
    vi.stubGlobal('fetch', vi.fn(async () => response(real.slice(1))));
    await expect(loadWritingDecoderLexicon()).rejects.toThrow('Incomplete');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('aborts a stalled network load independently of a cancelled editor query', async () => {
    vi.useFakeTimers(); vi.stubGlobal('caches', undefined);
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init.signal!;
      signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
    })));
    const failed = expect(loadWritingDecoderLexicon()).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(8001);
    await failed;
    expect(signal?.aborted).toBe(true);
  });
});
