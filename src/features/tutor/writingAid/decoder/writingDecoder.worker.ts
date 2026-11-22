import {loadWritingDecoderLexicon} from './assets';
import {createDecoderLexicon, searchDecoderLexicon} from './lexicon';
import {isDecoderPrefix, MAX_DECODER_CANDIDATES, type DecoderQuery, type DecoderReply} from './protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DecoderQuery>) => void) | null;
  postMessage: (message: DecoderReply) => void;
};
let loading: ReturnType<typeof loadIndex> | undefined;
let index: Awaited<ReturnType<typeof loadIndex>> | undefined;
let latest: DecoderQuery | undefined;
let failed = false;
async function loadIndex() {return createDecoderLexicon(await loadWritingDecoderLexicon());}

function respond() {
  if (!index || !latest) return;
  const query = latest;
  latest = undefined;
  scope.postMessage({type: 'result', id: query.id, prefix: query.prefix,
    candidates: searchDecoderLexicon(index, query.prefix, MAX_DECODER_CANDIDATES)});
}

scope.onmessage = event => {
  const query = event.data;
  if (query?.type !== 'query' || !Number.isSafeInteger(query.id) || query.id < 1 || !isDecoderPrefix(query.prefix)) return;
  if (failed) {scope.postMessage({type: 'unavailable', id: query.id}); return;}
  latest = query;
  if (index) {respond(); return;}
  // One continuation for the entire cold load, not one retained closure per keystroke.
  if (!loading) {
    loading = loadIndex();
    void loading.then(loaded => {index = loaded; respond();}).catch(() => {
      failed = true;
      if (latest) scope.postMessage({type: 'unavailable', id: latest.id});
      latest = undefined;
    });
  }
};
