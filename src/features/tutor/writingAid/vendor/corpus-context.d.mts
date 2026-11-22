export interface CorpusContextRanks {
  readonly bigram?: Readonly<Record<string, number>>;
  readonly trigram?: Readonly<Record<string, number>>;
}
export interface CorpusContextConfig {
  readonly ranker?: string | null;
  readonly contextWords?: number | null;
}
/** Tokenizes the existing learner window once; callers pass an already admitted lowercase word. */
export function createCorpusContextScorer(left: string, ranks?: CorpusContextRanks | null,
  config?: CorpusContextConfig): (word: string, prior: number) => number;
