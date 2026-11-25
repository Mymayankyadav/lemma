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
import {fetchVerifiedTypeaheadFile} from './assets';
import latexManifest from '../../../../../public/models/typeahead/latex-v1/manifest.json';

export const NGRAM_MANIFEST = manifest;
export const LATEX_MANIFEST = latexManifest;
export const BOS = 0, MATH_TOKEN = 1, NUM = 2, UNK = 3, EOS = 4;
const Q_STEP = manifest.build.quantisation.probability;
const B_STEP = manifest.build.quantisation.backoff;
const MAX_BYTES = 6 * 1024 * 1024;

export interface NgramModel {
  readonly words: readonly string[];
  readonly extended?: ExtendedNgram;
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

interface ExtendedRow {
  readonly history: Uint16Array;
  readonly start: Uint32Array;
  readonly backoff: Float32Array;
  readonly next: Uint16Array;
  readonly probability: Float32Array;
}

interface ExtendedNgram {
  readonly unigram: Float32Array;
  readonly rows: readonly ExtendedRow[];
}

function parseExtended(bytes: Uint8Array, view: DataView): NgramModel {
  const [order, size, header, expectedRows, expectedEdges, vocabBytes] =
    [8, 12, 16, 20, 24, 28].map(offset => view.getUint32(offset, true));
  if (order < 2 || order > 5 || size < 5 || size > 65536 || header !== 32 ||
      vocabBytes === 0 || vocabBytes > bytes.length - header) throw new Error('Invalid n-gram header');
  const words = new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(header, header + vocabBytes)).split('\n');
  const id = new Map(words.map((word, index) => [word, index]));
  if (words.length !== size || id.size !== size || words.some(word => !word) ||
      words[0] !== '<s>' || words[1] !== '<m>' || words[2] !== '<num>' || words[3] !== '<unk>' || words[4] !== '</s>') throw new Error('Invalid n-gram vocabulary');
  let at = header + Math.ceil(vocabBytes / 4) * 4;
  function section<T>(Type: {new(buffer: ArrayBuffer, offset: number, length: number): T; BYTES_PER_ELEMENT: number}, length: number): T {
    const end = at + Math.ceil(length * Type.BYTES_PER_ELEMENT / 4) * 4;
    if (end > bytes.length) throw new Error('Truncated n-gram section');
    const result = new Type(bytes.buffer as ArrayBuffer, at, length);
    at = end;
    return result;
  }
  const unigram = section(Float32Array, size);
  if (unigram.some(value => !(value >= 0 && value <= 1)) ||
      Math.abs(unigram.reduce((sum, value) => sum + value, 0) - 1) > 1e-4) throw new Error('Invalid n-gram unigram mass');
  const rows: ExtendedRow[] = [];
  let rowTotal = 0, edgeTotal = 0;
  for (let width = 1; width < order; width++) {
    const [count, edges] = section(Uint32Array, 2);
    const history = section(Uint16Array, count * width), start = section(Uint32Array, count + 1);
    const backoff = section(Float32Array, count), next = section(Uint16Array, edges);
    const probability = bytes[7] === 51
      ? Float32Array.from(section(Uint16Array, edges), code => code === 65535 ? 0 : 2 ** (-code / 2048))
      : section(Float32Array, edges);
    if (start[0] !== 0 || start[count] !== edges ||
        history.some(value => value >= size) || next.some(value => value >= size) ||
        backoff.some(value => !(value >= 0 && Number.isFinite(value))) ||
        probability.some(value => !(value >= 0 && value <= 1))) throw new Error('Invalid n-gram table');
    for (let row = 0; row < count; row++) {
      if (start[row] > start[row + 1] || row > 0 && compareHistory(history, row - 1, width, history.subarray(row * width, (row + 1) * width)) >= 0) {
        throw new Error('Unsorted n-gram history');
      }
      for (let edge = start[row] + 1; edge < start[row + 1]; edge++) {
        if (next[edge - 1] >= next[edge]) throw new Error('Unsorted n-gram continuation');
      }
    }
    rows.push({history, start, backoff, next, probability});
    rowTotal += count;
    edgeTotal += edges;
  }
  if (at !== bytes.length || rowTotal !== expectedRows || edgeTotal !== expectedEdges) throw new Error('Invalid n-gram length');
  const top = [...words.keys()].filter(index => index > EOS).sort((a, b) => unigram[b] - unigram[a] || a - b).slice(0, 256);
  return {words, id, top, extended: {unigram, rows}, uniQ: new Uint8Array(), biBow: new Int8Array(),
    biStart: new Uint32Array(), biNext: new Uint16Array(), biQ: new Uint8Array(),
    triKey: new Uint32Array(), triStart: new Uint32Array(), triBow: new Int8Array(), triNext: new Uint16Array(), triQ: new Uint8Array()};
}

function compareHistory(stored: Uint16Array, row: number, width: number, target: ArrayLike<number>): number {
  const offset = row * width, targetOffset = target.length - width;
  for (let index = 0; index < width; index++) {
    const difference = stored[offset + index] - target[targetOffset + index];
    if (difference) return difference;
  }
  return 0;
}

function extendedRow(table: ExtendedRow, width: number, history: ArrayLike<number>): number {
  let low = 0, high = table.backoff.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareHistory(table.history, middle, width, history) < 0) low = middle + 1;
    else high = middle;
  }
  return low < table.backoff.length && compareHistory(table.history, low, width, history) === 0 ? low : -1;
}

export function parseNgram(input: Uint8Array): NgramModel {
  const bytes = input.byteOffset === 0 && input.byteLength === input.buffer.byteLength ? input : input.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength >= 32 && /^LEMMANG[23]$/u.test(String.fromCharCode(...bytes.subarray(0, 8)))) return parseExtended(bytes, view);
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
function extendedLog(model: ExtendedNgram, word: number, history: readonly number[]): number {
  let logBackoff = 0;
  for (let width = Math.min(history.length, model.rows.length); width > 0; width--) {
    const table = model.rows[width - 1], row = extendedRow(table, width, history);
    if (row < 0) continue;
    const edge = find(table.next, table.start[row], table.start[row + 1], word);
    if (edge >= 0) return logBackoff + Math.log(table.probability[edge]);
    logBackoff += Math.log(table.backoff[row]);
  }
  return logBackoff + Math.log(model.unigram[word]);
}

function lnBi(m: NgramModel, w: number, v: number): number {
  const at = find(m.biNext, m.biStart[v], m.biStart[v + 1], w);
  return at >= 0 ? -m.biQ[at] * Q_STEP : m.biBow[v] * B_STEP + lnUni(m, w);
}

/** ln P(w | u, v) for word ids. */
export function ngramLog(m: NgramModel, w: number, u: number, v: number): number {
  if (m.extended) return extendedLog(m.extended, w, [u, v]);
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
  if (m.extended) return historyNext(m, [u, v]);
  const out = new Set<number>();
  const ctx = find(m.triKey, 0, m.triKey.length, u * 65536 + v);
  if (ctx >= 0) for (let i = m.triStart[ctx]; i < m.triStart[ctx + 1]; i++) out.add(m.triNext[i]);
  for (let i = m.biStart[v]; i < m.biStart[v + 1]; i++) out.add(m.biNext[i]);
  for (const w of m.top) out.add(w);
  return [...out];
}

interface LegacyMass {
  readonly unigram: number;
  readonly bigram: Float64Array;
  readonly trigram: Float64Array;
}
const legacyMass = new WeakMap<NgramModel, LegacyMass>();
const fromQ = Float64Array.from({length: 256}, (_, value) => Math.exp(-value * Q_STEP));

/** Sum a stored row and the lower-order mass left outside its explicit outcomes. */
function rowMass(next: Uint16Array, q: Uint8Array, start: number, end: number, weight: number,
  lowerMass: number, lowerProbability: (word: number) => number): number {
  let explicit = 0, replaced = 0;
  for (let edge = start; edge < end; edge++) {
    explicit += fromQ[q[edge]];
    replaced += lowerProbability(next[edge]);
  }
  return explicit + weight * Math.max(0, lowerMass - replaced);
}

export function historyLogTotal(model: NgramModel, history: readonly number[]): number {
  if (model.extended) return 0; // Expanded rows are normalized by the exporter after float32 packing.
  let mass = legacyMass.get(model);
  if (!mass) {
    const bigram = new Float64Array(model.words.length);
    const trigram = new Float64Array(model.triKey.length);
    bigram.fill(NaN);
    trigram.fill(NaN);
    mass = {unigram: model.uniQ.reduce((sum, q) => sum + fromQ[q], 0), bigram, trigram};
    legacyMass.set(model, mass);
  }
  if (!history.length) return Math.log(mass.unigram);
  const v = history[history.length - 1];
  const bi = mass.bigram[v] || (mass.bigram[v] = rowMass(model.biNext, model.biQ, model.biStart[v], model.biStart[v + 1],
    Math.exp(model.biBow[v] * B_STEP), mass.unigram, word => fromQ[model.uniQ[word]]));
  if (history.length < 2) return Math.log(bi);
  const row = find(model.triKey, 0, model.triKey.length, history[history.length - 2] * 65536 + v);
  if (row < 0) return Math.log(bi);
  return Math.log(mass.trigram[row] || (mass.trigram[row] = rowMass(model.triNext, model.triQ,
    model.triStart[row], model.triStart[row + 1], Math.exp(model.triBow[row] * B_STEP), bi,
    word => Math.exp(lnBi(model, word, v)))));
}

export function historyLog(model: NgramModel, word: number, history: readonly number[]): number {
  if (model.extended) return extendedLog(model.extended, word, history);
  const raw = history.length === 0 ? lnUni(model, word) : history.length === 1
    ? lnBi(model, word, history[0]) : ngramLog(model, word, history[history.length - 2], history[history.length - 1]);
  return raw - historyLogTotal(model, history);
}

export function historyNext(model: NgramModel, history: readonly number[]): number[] {
  if (!model.extended) return ngramNext(model, history[history.length - 2] ?? BOS, history[history.length - 1] ?? BOS);
  const result = new Set<number>();
  for (let width = Math.min(history.length, model.extended.rows.length); width > 0; width--) {
    const table = model.extended.rows[width - 1], row = extendedRow(table, width, history);
    if (row < 0) continue;
    for (let edge = table.start[row]; edge < table.start[row + 1]; edge++) result.add(table.next[edge]);
  }
  for (const word of model.top) result.add(word);
  return [...result];
}

/** Group successors in their original order so equal scores keep the decoder's order. */
type SuccessorIndex = {ids: Uint32Array; letters?: {starts: Uint32Array; ids: Uint32Array}};
const successorCache = new WeakMap<NgramModel, Map<string, SuccessorIndex>>();
const INDEX_BYTES = 2 * 1024 * 1024;

function initialBucket(word: string) {
  const letter = word.charCodeAt(0) - 97;
  return letter >= 0 && letter < 26 ? letter : 26;
}

function indexBytes(index: SuccessorIndex) {
  return index.ids.byteLength + (index.letters ? index.letters.ids.byteLength + index.letters.starts.byteLength : 0);
}

export function historyWords(model: NgramModel, history: readonly number[], prefix: string): string[] {
  let cache = successorCache.get(model);
  if (!cache) {cache = new Map(); successorCache.set(model, cache);}
  const key = history.join(',');
  const index: SuccessorIndex = cache.get(key) ?? {ids: Uint32Array.from(historyNext(model, history).filter(id => id > EOS))};
  if (prefix && index.ids.length >= 512 && !index.letters) {
    const starts = new Uint32Array(28);
    for (const id of index.ids) starts[initialBucket(model.words[id]) + 1]++;
    for (let i = 1; i < starts.length; i++) starts[i] += starts[i - 1];
    const cursor = starts.slice();
    const ids = new Uint32Array(index.ids.length);
    for (const id of index.ids) ids[cursor[initialBucket(model.words[id])]++] = id;
    index.letters = {ids, starts};
  }
  cache.delete(key);
  if (indexBytes(index) <= INDEX_BYTES) cache.set(key, index);
  let used = 0;
  for (const value of cache.values()) used += indexBytes(value);
  while (cache.size > 64 || used > INDEX_BYTES) {
    const [oldest, value] = cache.entries().next().value!;
    used -= indexBytes(value);
    cache.delete(oldest);
  }
  if (!prefix) return Array.from(index.ids, id => model.words[id]);
  const bucket = initialBucket(prefix);
  const ids = index.letters?.ids.subarray(index.letters.starts[bucket], index.letters.starts[bucket + 1]) ?? index.ids;
  const matches: string[] = [];
  for (const id of ids) if (model.words[id].startsWith(prefix)) matches.push(model.words[id]);
  return matches;
}

export const historyWidth = (model: NgramModel): number => model.extended?.rows.length ?? 2;

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

/** Replace complete maths before recognizing punctuation as sentence boundaries. */
export function recentSentenceTokens(before: string, maximum = 48): string[] {
  const prose = before.replace(IMAGE, ' ').replace(MATH_SPAN, ' zzmathzz ');
  let start = 0;
  for (const match of prose.matchAll(BREAK)) start = match.index! + match[0].length;
  return ((prose.slice(start).toLowerCase().match(TOKEN) ?? []).slice(-maximum)).map(tokenOf);
}

export function historyIds(model: NgramModel, before: string, maximum = historyWidth(model)): number[] {
  const tokens = recentSentenceTokens(before, maximum);
  const ids = tokens.map(token => model.id.get(token) ?? UNK);
  return Array<number>(Math.max(0, maximum - ids.length)).fill(BOS).concat(ids);
}

/** Legacy two-ID helper retained for callers working with the original trigram. */
export function contextIds(model: NgramModel, before: string): [number, number] {
  const [u, v] = historyIds(model, before, 2);
  return [u, v];
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
let expandedLatex: NgramModel | null = null;
let expandedLatexFingerprint: string | undefined;
export const latexModel = () => expandedLatex ?? latex.get();
export const setLatexModel = latex.set;
export const typeaheadLatexFingerprint = () => expandedLatexFingerprint ?? (latex.get() ? latexManifest.file.sha256 : undefined);
let latexLoading: Promise<void> | undefined;
export function loadLatexModel(expanded = false): Promise<void> {
  if (!expanded) return latex.load();
  return latexLoading ??= expandedAsset('latex-v2', null, 2 * MiB, 'latex').catch(() => undefined)
    .then(async result => {
      if (result) {
        expandedLatex = result.model;
        expandedLatexFingerprint = result.fingerprint;
      }
      else await latex.load();
      if (!latexModel()) latexLoading = undefined;
    });
}


interface ExpandedManifest {
  readonly version: 2;
  readonly kind: 'ngram' | 'latex';
  readonly order: number;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly vocabSha256: string;
  readonly subject: string | null;
  readonly weight?: number;
}

const expandedManifests = import.meta.glob<ExpandedManifest>('../../../../../public/models/typeahead/*/manifest.json', {import: 'default'});
const MiB = 1024 * 1024;
let expandedGeneral: NgramModel | null = null;
let expandedFingerprint: string | undefined;
export function typeaheadNgramFingerprint(): string | undefined {
  return expandedFingerprint ?? (ngramModel() ? manifest.file.sha256 : undefined);
}
let generalLoading: Promise<void> | undefined;
let subjectSelection: {subject: string; token: object; model?: NgramModel; weight?: number; fingerprint?: string} | undefined;
export const generalNgram = (): NgramModel | null => expandedGeneral ?? ngramModel();
export function activeSubjectNgram(subject?: string): {model: NgramModel; weight: number; fingerprint: string} | undefined {
  if (!subject || subjectSelection?.subject !== subject || !subjectSelection.model || !subjectSelection.fingerprint) return undefined;
  return {model: subjectSelection.model, weight: subjectSelection.weight ?? .2, fingerprint: subjectSelection.fingerprint};
}

async function expandedAsset(set: string, subject: string | null, budget: number, kind: ExpandedManifest['kind'] = 'ngram'): Promise<{model: NgramModel; weight?: number; fingerprint: string} | null> {
  const load = expandedManifests['../../../../../public/models/typeahead/' + set + '/manifest.json'];
  if (!load) return null;
  const file = await load();
  if (file.version !== 2 || file.kind !== kind || file.subject !== subject || file.order < 4 || file.order > 5 ||
      !/^[a-f0-9]{64}$/u.test(file.vocabSha256)) return null;
  const model = parseNgram(await fetchVerifiedTypeaheadFile(set, {...file, path: file.file}, budget, subject === null));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(model.words.join('\n')));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (fingerprint !== file.vocabSha256 || historyWidth(model) !== file.order - 1) return null;
  return {model, fingerprint: file.sha256, weight: typeof file.weight === 'number' && Number.isFinite(file.weight) ? Math.min(.65, Math.max(0, file.weight)) : undefined};
}

export function loadExpandedNgram(): Promise<void> {
  return generalLoading ??= expandedAsset('ngram-v2', null, 20 * MiB).then(result => {if (result) {expandedGeneral = result.model; expandedFingerprint = result.fingerprint;}})
    .catch(() => {generalLoading = undefined;});
}

export async function selectSubjectNgram(subject?: string): Promise<void> {
  if (subjectSelection?.subject === subject) return;
  subjectSelection = undefined;
  if (!subject || !/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(subject)) return;
  const token = {};
  subjectSelection = {subject, token};
  try {
    const result = await expandedAsset('subject-' + subject, subject, 4 * MiB);
    const general = generalNgram();
    if (!result || !general || subjectSelection?.token !== token || result.model.words.length !== general.words.length ||
        !result.model.words.every((word, index) => general.words[index] === word)) return;
    subjectSelection = {subject, token, ...result};
  } catch {/* General model remains the current fallback. */}
}
