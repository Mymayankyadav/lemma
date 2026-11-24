/**
 * N233 · the maths-prose Kneser-Ney trigram (public/models/typeahead/ngram-v1, built by scripts/typeahead/build-ngram.py).
 * The file is pinned by size and SHA-256 (manifest.json), loaded once, cached, and read in place from typed arrays.
 *
 *   P(w | u, v) = P3(w | u, v) if the trigram is stored, else bow(u, v) · P(w | v)
 *   P(w | v)    = P2(w | v)    if the bigram is stored,  else bow(v) · P(w)
 *
 * Tokens follow the builder: lower-case words, digits → <num>, a maths span or any single letter except "a" and "i" → <m>,
 * unknown words → <unk>. A lookup costs a few binary searches, well under a millisecond.
 */
import manifest from '../../../../../public/models/typeahead/ngram-v1/manifest.json';
import latexManifest from '../../../../../public/models/typeahead/latex-v1/manifest.json';

export const NGRAM_MANIFEST = manifest;
export const LATEX_MANIFEST = latexManifest;
export const BOS = 0, MATH_TOKEN = 1, NUM = 2, UNK = 3, EOS = 4;
const Q_STEP = manifest.build.quantisation.probability;
const B_STEP = manifest.build.quantisation.backoff;
const MAX_BYTES = 6 * 1024 * 1024;

export interface NgramModel {
  readonly words: readonly string[];
  readonly id: ReadonlyMap<string, number>;
  readonly uniQ: Uint8Array;
  readonly biBow: Int8Array;
  readonly biStart: Uint32Array;
  readonly biNext: Uint16Array;
  readonly biQ: Uint8Array;
  readonly triKey: Uint32Array;
  readonly triStart: Uint32Array;
  readonly triBow: Int8Array;
  readonly triNext: Uint16Array;
  readonly triQ: Uint8Array;
  /** The most likely words overall (never a special token), for next-word candidates with no context. */
  readonly top: readonly number[];
}

export function parseNgram(input: Uint8Array): NgramModel {
  const bytes = input.byteOffset === 0 && input.byteLength === input.buffer.byteLength ? input : input.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 32 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'LMN1' || view.getUint32(4, true) !== 1) {
    throw new Error('Invalid typeahead model');
  }
  const [V, nBi, nCtx, nTri, blob] = [8, 12, 16, 20, 24].map(offset => view.getUint32(offset, true));
  let at = 32;
  const section = <T extends ArrayBufferView>(Type: {new (buffer: ArrayBuffer, offset: number, length: number): T; BYTES_PER_ELEMENT: number}, length: number): T => {
    const out = new Type(bytes.buffer as ArrayBuffer, bytes.byteOffset + at, length);
    at += Math.ceil(length * Type.BYTES_PER_ELEMENT / 4) * 4;
    return out;
  };
  const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(at, at + blob));
  at += Math.ceil(blob / 4) * 4;
  const words = text.split('\n');
  if (words.length !== V) throw new Error('Invalid typeahead vocabulary');
  const uniQ = section(Uint8Array, V), biBow = section(Int8Array, V), biStart = section(Uint32Array, V + 1);
  const biNext = section(Uint16Array, nBi), biQ = section(Uint8Array, nBi);
  const triKey = section(Uint32Array, nCtx), triStart = section(Uint32Array, nCtx + 1), triBow = section(Int8Array, nCtx);
  const triNext = section(Uint16Array, nTri), triQ = section(Uint8Array, nTri);
  if (at > bytes.byteLength) throw new Error('Truncated typeahead model');
  const id = new Map<string, number>();
  words.forEach((word, index) => id.set(word, index));
  const top = [...words.keys()].filter(index => index > EOS).sort((a, b) => uniQ[a] - uniQ[b] || a - b).slice(0, 256);
  return {words, id, uniQ, biBow, biStart, biNext, biQ, triKey, triStart, triBow, triNext, triQ, top};
}

function find(array: Uint16Array | Uint32Array, from: number, to: number, target: number): number {
  let low = from, high = to;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (array[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low < to && array[low] === target ? low : -1;
}

const lnUni = (m: NgramModel, w: number) => -m.uniQ[w] * Q_STEP;
function lnBi(m: NgramModel, w: number, v: number): number {
  const at = find(m.biNext, m.biStart[v], m.biStart[v + 1], w);
  return at >= 0 ? -m.biQ[at] * Q_STEP : m.biBow[v] * B_STEP + lnUni(m, w);
}

/** ln P(w | u, v) for word ids. */
export function ngramLog(m: NgramModel, w: number, u: number, v: number): number {
  const ctx = find(m.triKey, 0, m.triKey.length, u * 65536 + v);
  if (ctx >= 0) {
    const at = find(m.triNext, m.triStart[ctx], m.triStart[ctx + 1], w);
    if (at >= 0) return -m.triQ[at] * Q_STEP;
    return m.triBow[ctx] * B_STEP + lnBi(m, w, v);
  }
  return lnBi(m, w, v);
}

/** Ids the context (u, v) makes likely: its stored trigram and bigram continuations, then the commonest words. */
export function ngramNext(m: NgramModel, u: number, v: number): number[] {
  const out = new Set<number>();
  const ctx = find(m.triKey, 0, m.triKey.length, u * 65536 + v);
  if (ctx >= 0) for (let i = m.triStart[ctx]; i < m.triStart[ctx + 1]; i++) out.add(m.triNext[i]);
  for (let i = m.biStart[v]; i < m.biStart[v + 1]; i++) out.add(m.biNext[i]);
  for (const w of m.top) out.add(w);
  return [...out];
}

// ── tokens ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const MATH_SPAN = /\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;
const IMAGE = /\[\[lemma-image:[^\]]*\]\]/g;
const TOKEN = /zzmathzz|[a-z]+(?:'[a-z]+)?|\d+/g;
const BREAK = /[.!?]\s+|\n\s*\n/g;

/** A word as the model sees it. */
export function tokenOf(word: string): string {
  const lower = word.toLowerCase();
  if (lower === 'zzmathzz') return '<m>';
  if (/^\d+$/.test(lower)) return '<num>';
  if (lower.length === 1 && /[a-z]/.test(lower) && lower !== 'a' && lower !== 'i') return '<m>';
  return lower;
}

/** The ids of the two tokens before the caret in the current sentence (<s> pads a sentence start). */
export function contextIds(m: NgramModel, before: string): [number, number] {
  const tail = before.slice(-400).replace(IMAGE, ' ');
  let start = 0;
  for (const match of tail.matchAll(BREAK)) start = match.index! + match[0].length;
  const tokens = (tail.slice(start).replace(MATH_SPAN, ' zzmathzz ').toLowerCase().match(TOKEN) ?? []).map(tokenOf);
  const ids = tokens.slice(-2).map(token => m.id.get(token) ?? UNK);
  return [ids.length > 1 ? ids[0] : BOS, ids.length ? ids[ids.length - 1] : BOS];
}

// ── loading ─────────────────────────────────────────────────────────────────────────────────────────────────────────
type AssetManifest = typeof manifest;

/** One pinned asset: loaded once, verified by size and SHA-256, cached on the device by hash. */
function createSlot(asset: AssetManifest) {
  let model: NgramModel | null = null;
  let loading: Promise<void> | null = null;
  async function readVerified(response: Response): Promise<Uint8Array> {
    const {bytes, sha256} = asset.file;
    if (!response.ok || bytes > MAX_BYTES || Number(response.headers.get('content-length')) > bytes) throw new Error('Invalid typeahead asset');
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength !== bytes) throw new Error('Unexpected typeahead asset size');
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== sha256) throw new Error('Typeahead asset integrity check failed');
    return data;
  }
  return {
    get: () => model,
    set(value: NgramModel | null) {model = value; loading = null;},
    /** A failure leaves the previous suggestions as they were. */
    load(): Promise<void> {
      if (model) return Promise.resolve();
      return loading ??= (async () => {
        const url = new URL(`${import.meta.env.BASE_URL}models/typeahead/${asset.assetSetVersion}/${asset.file.path}`, self.location.origin).href;
        let cache: Cache | undefined;
        try {
          if (import.meta.env.MODE !== 'android') cache = await self.caches?.open(`lemma-typeahead-${asset.file.sha256}`);
        } catch {/* Storage denial still permits a verified network or packaged load. */}
        let bytes: Uint8Array | undefined;
        const cached = await cache?.match(url).catch(() => undefined);
        if (cached) {
          try {bytes = await readVerified(cached);} catch {await cache?.delete(url).catch(() => undefined);}
        }
        if (!bytes) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          try {
            bytes = await readVerified(await fetch(url, {mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal}));
          } finally {clearTimeout(timer);}
          await cache?.put(url, new Response(bytes.slice().buffer)).catch(() => undefined);
        }
        model = parseNgram(bytes);
      })().catch(() => {loading = null;});
    },
  };
}

const prose = createSlot(manifest), latex = createSlot(latexManifest);
export const ngramModel = prose.get;
export const setNgramModel = prose.set;
export const loadNgram = prose.load;
/** N235: the LaTeX-token model for the strip inside $…$. */
export const latexModel = latex.get;
export const setLatexModel = latex.set;
export const loadLatexModel = latex.load;
