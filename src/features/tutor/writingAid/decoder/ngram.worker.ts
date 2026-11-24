import {predictWritingAidPool, type WritingAidPool} from '../engine';
import type {WritingAidModel} from '../learning';
import type {WritingAidProposal, WritingAidRequest} from '../policy';
import {prepareWorkerTypeahead, restoreKeyTouches, type KeyTouchSample, type LanguageDistribution, type ComponentProbabilities} from './ngramSpatial';
import {usesExpandedNgram} from '../replayArm';
import {selectSubjectNgram, typeaheadNgramFingerprint} from './kn';

export type WirePool = Readonly<Record<keyof WritingAidPool, readonly Omit<WritingAidProposal, 'snapshot'>[]>>;
export type NgramRequest = Readonly<{
  id: number; request: WritingAidRequest; model?: WritingAidModel; touches: readonly KeyTouchSample[];
}>;
export type ComponentQuery = {componentId: number; cursorEnd: number; revision: number; word: string};
export type ComponentReply = {componentId: number; subject?: string; probability?: ComponentProbabilities};
export type NgramReply = Readonly<{id: number; pool: WirePool; computeMs: number; assetSha256?: string} | {id: number; failed: true}>;
type WorkerEndpoint = {
  onmessage: ((event: MessageEvent<NgramRequest | ComponentQuery>) => void) | null;
  postMessage: (reply: NgramReply | ComponentReply) => void;
};
const worker = self as unknown as WorkerEndpoint;
let ready: Promise<void> | undefined;
let subject: string | undefined;
let measured: {cursorEnd: number; revision: number; language: LanguageDistribution} | undefined;
const withoutSnapshot = ({snapshot: _, ...fields}: WritingAidProposal) => fields;

worker.onmessage = async ({data}) => {
  if ('componentId' in data) {
    const match = measured && measured.cursorEnd === data.cursorEnd && measured.revision === data.revision;
    worker.postMessage({componentId: data.componentId, subject, probability: match ? measured?.language.components(data.word) : undefined});
    return;
  }
  try {
    await (ready ??= prepareWorkerTypeahead(data.request.arm));
    if (usesExpandedNgram(data.request.arm) && data.request.subject !== subject) {
      subject = data.request.subject;
      void selectSubjectNgram(subject);
    }
    const start = performance.now();
    restoreKeyTouches(data.touches);
    measured = undefined;
    const pool = predictWritingAidPool(data.request, data.model, data.request.replayDiagnostics ? language => {
      measured = {cursorEnd: data.request.cursor.end, revision: data.request.target.editorRevision, language};
    } : undefined);
    worker.postMessage({id: data.id, pool: {words: pool.words.map(withoutSnapshot), edit: pool.edit.map(withoutSnapshot),
      ghost: pool.ghost.map(withoutSnapshot)}, computeMs: performance.now() - start, assetSha256: typeaheadNgramFingerprint()});
  } catch {
    worker.postMessage({id: data.id, failed: true});
  }
};
