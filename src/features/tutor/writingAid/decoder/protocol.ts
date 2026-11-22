import type {DecoderCandidate} from './lexicon';

export interface DecoderQuery {
  readonly type: 'query';
  readonly id: number;
  /** Only the current lowercase prefix leaves the editor, never a draft or account identifier. */
  readonly prefix: string;
}

export type DecoderReply = {
  readonly type: 'result'; readonly id: number; readonly prefix: string;
  readonly candidates: readonly DecoderCandidate[];
} | {readonly type: 'unavailable'; readonly id: number};

export const MAX_DECODER_CANDIDATES = 64;
export const isDecoderPrefix = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z]{2,31}$/u.test(value);

/** Treat worker messages as data. A malformed list is a fallback, never partial trusted output. */
export function readDecoderCandidates(value: unknown, prefix: string): readonly DecoderCandidate[] | undefined {
  if (!isDecoderPrefix(prefix) || !Array.isArray(value) || value.length > MAX_DECODER_CANDIDATES) return;
  const seen = new Set<string>();
  const result: DecoderCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return;
    const {word, frequency, riskTags} = item;
    if (typeof word !== 'string' || !/^[a-z]{2,32}$/u.test(word) || !word.startsWith(prefix) ||
        word === prefix || seen.has(word) || typeof frequency !== 'number' || !Number.isFinite(frequency) ||
        frequency <= 0 || frequency > 1e9 || (riskTags !== undefined &&
          (!Array.isArray(riskTags) || riskTags.length > 1 || riskTags.some(tag => tag !== 'logic')))) return;
    seen.add(word);
    result.push({word, frequency, ...(riskTags?.length ? {riskTags: ['logic'] as const} : {})});
  }
  return result;
}
