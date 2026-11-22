/** Unigram retrieval only. The writing-aid policy still decides whether a word may be offered. */
export interface DecoderCandidate {
  readonly word: string;
  /** Relative unigram rank, not a calibrated probability or correction confidence. */
  readonly frequency: number;
  readonly riskTags?: readonly 'logic'[];
}

export interface DecoderLexicon {
  readonly version: 1;
  readonly entries: readonly DecoderCandidate[];
}

export interface DecoderLexiconIndex {
  readonly entries: readonly DecoderCandidate[];
  readonly tree: Uint32Array;
  readonly base: number;
}

export const MAX_DECODER_WORDS = 100_000;
export const MAX_DECODER_CANDIDATES = 64;
const WORD = /^[a-z]{2,32}$/u;

/** Bound memory and reject malformed data before constructing the search index. */
export function parseDecoderLexicon(value: unknown): DecoderLexicon {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
      !('entries' in value) || !Array.isArray(value.entries) ||
      value.entries.length === 0 || value.entries.length > MAX_DECODER_WORDS) {
    throw new Error('Invalid writing decoder lexicon');
  }
  const entries: DecoderCandidate[] = [];
  let previous = '';
  for (const row of value.entries) {
    if (!row || typeof row !== 'object' || typeof row.word !== 'string' || !WORD.test(row.word) ||
        row.word <= previous || typeof row.frequency !== 'number' || !Number.isFinite(row.frequency) ||
        row.frequency <= 0 || row.frequency > 1_000_000 ||
        (row.riskTags !== undefined && (!Array.isArray(row.riskTags) || row.riskTags.length !== 1 || row.riskTags[0] !== 'logic'))) {
      throw new Error('Invalid writing decoder entry');
    }
    previous = row.word;
    entries.push(Object.freeze({word: row.word, frequency: row.frequency,
      ...(row.riskTags ? {riskTags: Object.freeze(['logic'] as const)} : {})}));
  }
  return Object.freeze({version: 1, entries: Object.freeze(entries)});
}

function better(entries: readonly DecoderCandidate[], a: number, b: number): number {
  if (a === entries.length) return b;
  if (b === entries.length) return a;
  return entries[a].frequency > entries[b].frequency ||
    (entries[a].frequency === entries[b].frequency && a < b) ? a : b;
}

/** A range-max tree provides exact top-k retrieval without scanning/truncating an alphabetical prefix. */
export function createDecoderLexicon(asset: DecoderLexicon): DecoderLexiconIndex {
  const {entries} = asset;
  let base = 1;
  while (base < entries.length) base *= 2;
  const tree = new Uint32Array(base * 2).fill(entries.length);
  for (let i = 0; i < entries.length; i++) tree[base + i] = i;
  for (let i = base - 1; i > 0; i--) tree[i] = better(entries, tree[i * 2], tree[i * 2 + 1]);
  return {entries, tree, base};
}

function lowerBound(entries: readonly DecoderCandidate[], word: string): number {
  let low = 0, high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].word < word) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Preserve risk metadata across the worker boundary. This function never supplies a next word. */
export function searchDecoderLexicon(
  index: DecoderLexiconIndex, prefix: string, limit = 32,
): readonly DecoderCandidate[] {
  if (typeof prefix !== 'string' || !/^[a-zA-Z]{1,32}$/u.test(prefix) ||
      !Number.isFinite(limit) || limit < 1) return [];
  const count = Math.min(MAX_DECODER_CANDIDATES, Math.floor(limit));
  const lower = prefix.toLowerCase(), {entries, tree, base} = index;
  let left = lowerBound(entries, lower), right = lowerBound(entries, lower + '{');
  if (entries[left]?.word === lower) left++;
  if (left >= right) return [];
  const heap: number[] = [];
  const before = (a: number, b: number) => better(entries, tree[a], tree[b]) === tree[a];
  function push(node: number) {
    if (tree[node] === entries.length) return;
    let at = heap.length;
    heap.push(node);
    while (at > 0) {
      const parent = (at - 1) >>> 1;
      if (!before(node, heap[parent])) break;
      heap[at] = heap[parent]; at = parent;
    }
    heap[at] = node;
  }
  function pop(): number {
    const top = heap[0], last = heap.pop()!;
    if (!heap.length) return top;
    let at = 0;
    while (at * 2 + 1 < heap.length) {
      let child = at * 2 + 1;
      if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
      if (before(last, heap[child])) break;
      heap[at] = heap[child]; at = child;
    }
    heap[at] = last;
    return top;
  }
  // Cover only the matching range. Every heap node carries its best descendant.
  for (left += base, right += base; left < right; left >>>= 1, right >>>= 1) {
    if (left & 1) push(left++);
    if (right & 1) push(--right);
  }
  const results: DecoderCandidate[] = [];
  while (heap.length && results.length < count) {
    const node = pop();
    if (node >= base) results.push(entries[tree[node]]);
    else { push(node * 2); push(node * 2 + 1); }
  }
  return results;
}
