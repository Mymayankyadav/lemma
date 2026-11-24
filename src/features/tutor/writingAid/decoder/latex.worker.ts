import {latexSuggestions, type LatexSuggestion} from '../latexGrammar';
import {loadLatexModel, typeaheadLatexFingerprint} from './kn';

export type LatexQuery = Readonly<{
  math: string; typed: string; before: string; after: string; knownSymbols: readonly string[];
}>;
export type LatexWorkerRequest = Readonly<{id: number; query: LatexQuery; expanded: boolean}>;
export type LatexWorkerReply = Readonly<{id: number; results: readonly LatexSuggestion[]; assetSha256?: string}>;

const endpoint = self as unknown as {
  onmessage: ((event: MessageEvent<LatexWorkerRequest>) => void) | null;
  postMessage: (reply: LatexWorkerReply) => void;
};
let newest = 0;
endpoint.onmessage = async ({data: {id, query, expanded}}) => {
  newest = id;
  try {
    await loadLatexModel(expanded);
    if (id !== newest) return;
    const results = latexSuggestions(query.math, query.typed, query.before, 64, query);
    endpoint.postMessage({id, results, assetSha256: typeaheadLatexFingerprint()});
  } catch {
    endpoint.postMessage({id, results: []});
  }
};
