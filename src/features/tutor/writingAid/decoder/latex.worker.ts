import {latexSuggestions, type LatexSuggestion} from '../latexGrammar';
import {loadLatexModel} from './kn';

export type LatexQuery = Readonly<{
  math: string; typed: string; before: string; after: string; knownSymbols: readonly string[];
}>;
export type LatexWorkerRequest = Readonly<{id: number; query: LatexQuery}>;
export type LatexWorkerReply = Readonly<{id: number; results: readonly LatexSuggestion[]}>;

const endpoint = self as unknown as {
  onmessage: ((event: MessageEvent<LatexWorkerRequest>) => void) | null;
  postMessage: (reply: LatexWorkerReply) => void;
};
const ready = loadLatexModel();
let newest = 0;
endpoint.onmessage = async ({data: {id, query}}) => {
  newest = id;
  try {
    await ready;
    if (id !== newest) return;
    const results = latexSuggestions(query.math, query.typed, query.before, 64, query);
    endpoint.postMessage({id, results});
  } catch {
    endpoint.postMessage({id, results: []});
  }
};
