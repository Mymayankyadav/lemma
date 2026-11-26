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
  if (!text.length) throw new Error('Invalid writing decoder lexicon');
  const entries: DecoderCandidate[] = [];
  let previous = '';
  // Index directly from the verified buffer without allocating an additional array of 114,780 lines.
  for (let start = 0; start < text.length;) {
    if (entries.length === MAX_COMPLETE_WORDS) throw new Error('Invalid writing decoder lexicon');
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline;
    const tab = text.indexOf('\t', start);
    if (tab < start || tab >= end) throw new Error('Invalid writing decoder entry');
    const word = text.slice(start, tab);
    const nextTab = text.indexOf('\t', tab + 1);
    const tagged = nextTab >= 0 && nextTab < end;
    const frequency = Number(text.slice(tab + 1, tagged ? nextTab : end));
    if (!WORD.test(word) || word <= previous || !Number.isInteger(frequency) || frequency <= 0 || frequency > 1_000_000 ||
        tagged && text.slice(nextTab + 1, end) !== 'logic') throw new Error('Invalid writing decoder entry');
    previous = word;
    entries.push(Object.freeze({word, frequency, ...(tagged ? {riskTags: Object.freeze(['logic'] as const)} : {})}));
    start = end + 1;
  }
  return Object.freeze({version: 1, entries: Object.freeze(entries)});
}

async function completeLexiconBytes(offlineInstall?: AbortSignal): Promise<Uint8Array> {
  const {readVerifiedDecoderAsset} = await import('./assets');
  const file = manifest.file;
  const url = new URL(`${import.meta.env.BASE_URL}models/writing-decoder/${manifest.assetSetVersion}/${file.path}`,
    self.location.origin).href;
  let cache: Cache | undefined;
  try {
    if (import.meta.env.MODE !== 'android') cache = await self.caches?.open(`lemma-writing-decoder-${file.sha256}`);
  } catch {/* Storage denial still permits a verified network or packaged load. */}
  if (offlineInstall && !cache) throw new Error('Could not open offline model storage');
  let bytes: Uint8Array | undefined;
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    try {bytes = await readVerifiedDecoderAsset(cached, file);}
    catch {await cache?.delete(url).catch(() => undefined);}
  }
  if (!bytes) {
    const controller = new AbortController();
    const timer = offlineInstall ? undefined : setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: offlineInstall ?? controller.signal});
      bytes = await readVerifiedDecoderAsset(response, file);
    } finally {clearTimeout(timer);}
    if (offlineInstall) {
      offlineInstall.throwIfAborted();
      await cache!.put(url, new Response(bytes.slice().buffer));
    } else {
      await cache?.put(url, new Response(bytes.slice().buffer)).catch(() => undefined);
    }
  }
  return bytes;
}

export async function loadCompleteLexicon(): Promise<DecoderLexicon> {
  return parseLexiconTsv(new TextDecoder('utf-8', {fatal: true}).decode(await completeLexiconBytes()));
}

export async function saveCompleteLexiconForOffline(signal: AbortSignal): Promise<void> {
  await completeLexiconBytes(signal);
}
