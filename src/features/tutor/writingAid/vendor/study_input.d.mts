type JsonObject = Readonly<Record<string, unknown>>;
type Mode = 'balanced' | 'fast' | 'strict';

export function makeStudyInput(assets: {
  phrases: JsonObject;
  veto: JsonObject;
  policy: JsonObject;
  words: readonly string[];
  wordAssets: JsonObject;
  ranks: JsonObject;
  speedPolicy: JsonObject;
}, config: {seed: number; researchPool?: boolean; maxCandidates?: number}): {
  predict(text: string, options: {
    mode: Mode;
    surface: 'keys' | 'ghost';
    origin: 'learner';
    authoredText: string;
  }): {
    keys: readonly {word: string; kind?: string; risk?: string}[];
    ghost: {suffix: string; kind?: string} | null;
  };
  edit(row: {
    before: string;
    span: string;
    after: string;
    surface: 'blue' | 'red';
    origin: 'learner';
    authoredText: string;
  }, options: {mode: Mode}): {source: string; proposal: string; certificate?: {rule: string}} | null;
};
