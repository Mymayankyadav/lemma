/**
 * N221 · the complete unigram lexicon (unigram-v2: N219's v1 plus every accepted AOSP word, 114,780 words), loaded once
 * with N219's integrity check (pinned size and SHA-256) and cached like v1. Built by
 * scripts/writing-decoder/build-lexicon-v2.mjs.
 */
import manifest from '../../../../../public/models/writing-decoder/unigram-v2/manifest.json';
import type {DecoderCandidate, DecoderLexicon} from './lexicon';

export const MAX_COMPLETE_WORDS = 150_000;
const WORD = /^[a-z]{2,32}$/u;

/** "word<TAB>frequency[<TAB>logic]" lines in strict byte order; anything else rejects the whole file. */
export function parseLexiconTsv(text: string): DecoderLexicon {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  if (!lines.length || lines.length > MAX_COMPLETE_WORDS) throw new Error('Invalid writing decoder lexicon');
  const entries: DecoderCandidate[] = [];
  let previous = '';
  for (const line of lines) {
    const [word, count, tag, extra] = line.split('\t');
    const frequency = Number(count);
    if (!WORD.test(word) || word <= previous || !Number.isInteger(frequency) || frequency <= 0 || frequency > 1_000_000 ||
        (tag !== undefined && tag !== 'logic') || extra !== undefined) throw new Error('Invalid writing decoder entry');
    previous = word;
    entries.push(Object.freeze({word, frequency, ...(tag ? {riskTags: Object.freeze(['logic'] as const)} : {})}));
  }
  return Object.freeze({version: 1, entries: Object.freeze(entries)});
}

export async function loadCompleteLexicon(): Promise<DecoderLexicon> {
  const {readVerifiedDecoderAsset} = await import('./assets');
  const file = manifest.file;
  const url = new URL(`${import.meta.env.BASE_URL}models/writing-decoder/${manifest.assetSetVersion}/${file.path}`,
    self.location.origin).href;
  let cache: Cache | undefined;
  try {
    if (import.meta.env.MODE !== 'android') cache = await self.caches?.open(`lemma-writing-decoder-${file.sha256}`);
  } catch {/* Storage denial still permits a verified network or packaged load. */}
  let bytes: Uint8Array | undefined;
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    try {bytes = await readVerifiedDecoderAsset(cached, file);}
    catch {await cache?.delete(url).catch(() => undefined);}
  }
  if (!bytes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: controller.signal});
      bytes = await readVerifiedDecoderAsset(response, file);
    } finally {clearTimeout(timer);}
    await cache?.put(url, new Response(bytes.slice().buffer)).catch(() => undefined);
  }
  return parseLexiconTsv(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}
