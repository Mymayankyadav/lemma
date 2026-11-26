import {findPhraseGhost, type PhraseGhostSearch} from '../phraseGhost';
import {PHRASE_GHOST_FINGERPRINT} from '../phraseGhostConfig';
import type {WritingAidRequest} from '../policy';

export interface PhraseGhostRequest {
  readonly id: number;
  readonly snapshot: WritingAidRequest;
  readonly deadline: number;
}

export interface PhraseGhostReply {
  readonly id: number;
  readonly fingerprint: string;
  readonly computeMs: number;
  readonly search?: PhraseGhostSearch;
}

const worker = self as unknown as {onmessage: (event: MessageEvent<PhraseGhostRequest>) => void; postMessage: (reply: PhraseGhostReply) => void};
worker.onmessage = ({data}) => {
  const start = performance.now();
  const search = performance.timeOrigin + start <= data.deadline ? findPhraseGhost(data.snapshot) : undefined;
  worker.postMessage({id: data.id, fingerprint: PHRASE_GHOST_FINGERPRINT, computeMs: performance.now() - start, search});
};
