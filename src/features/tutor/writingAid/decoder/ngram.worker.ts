import {predictWritingAidPool, type WritingAidPool} from '../engine';
import type {WritingAidModel} from '../learning';
import type {WritingAidProposal, WritingAidRequest} from '../policy';
import {prepareWorkerTypeahead, restoreKeyTouches, writingDecoderReady, type KeyTouchSample, type LanguageDistribution, type ComponentProbabilities} from './ngramSpatial';
import {usesExpandedNgram, type TypeaheadArm} from '../replayArm';
import {activeSubjectNgram, selectSubjectNgram, typeaheadNgramFingerprint} from './kn';

export type WirePool = Readonly<Record<'words' | 'edit' | 'ghost', readonly Omit<WritingAidProposal, 'snapshot'>[]>> & Pick<WritingAidPool, 'trace'>;
export type NgramRequest = Readonly<{
  id: number; request: WritingAidRequest; model?: WritingAidModel; touches: readonly KeyTouchSample[];
}>;
export type ComponentQuery = {componentId: number; cursorEnd: number; revision: number; word: string};
export type PreloadRequest = {preload: true; expanded: boolean; arm?: TypeaheadArm};
export type PreloadReply = {preloaded: boolean};
export type ComponentReply = {componentId: number; subject?: string; probability?: ComponentProbabilities;
  assetSha256?: string; subjectAssetSha256?: string};
export type NgramReply = Readonly<{id: number; pool: WirePool; computeMs: number; assetSha256?: string;
  subjectAssetSha256?: string} | {id: number; failed: true}>;
type WorkerEndpoint = {
  onmessage: ((event: MessageEvent<NgramRequest | ComponentQuery | PreloadRequest>) => void) | null;
  postMessage: (reply: NgramReply | ComponentReply | PreloadReply) => void;
};
const worker = self as unknown as WorkerEndpoint;
let ready: Promise<void> | undefined;
let subject: string | undefined;
let measured: {cursorEnd: number; revision: number; subject?: string; language: LanguageDistribution;
  assetSha256?: string; subjectAssetSha256?: string} | undefined;
const withoutSnapshot = ({snapshot: _, ...fields}: WritingAidProposal) => fields;

worker.onmessage = async ({data}) => {
  if ('preload' in data) {
    try {
      await (ready ??= prepareWorkerTypeahead(data.expanded, data.arm));
      worker.postMessage({preloaded: writingDecoderReady()});
    } catch {worker.postMessage({preloaded: false});}
    return;
  }
  if ('componentId' in data) {
    const match = measured && measured.cursorEnd === data.cursorEnd && measured.revision === data.revision;
    worker.postMessage({componentId: data.componentId, ...(match && measured ? {subject: measured.subject,
      assetSha256: measured.assetSha256, subjectAssetSha256: measured.subjectAssetSha256,
      probability: measured.language.components(data.word)} : {})});
    return;
  }
  try {
    const expanded = Boolean(data.request.expanded);
    await (ready ??= prepareWorkerTypeahead(expanded, data.request.arm));
    if (expanded && usesExpandedNgram(data.request.arm) && data.request.subject !== subject) {
      subject = data.request.subject;
      const loading = selectSubjectNgram(subject);
      if (data.request.replayDiagnostics) await loading;
    }
    const start = performance.now();
    restoreKeyTouches(data.touches);
    measured = undefined;
    const pool = predictWritingAidPool(data.request, data.model, data.request.replayDiagnostics ? language => {
      measured = {cursorEnd: data.request.cursor.end, revision: data.request.target.editorRevision, language,
        subject: data.request.subject, assetSha256: typeaheadNgramFingerprint(),
        subjectAssetSha256: activeSubjectNgram(data.request.subject)?.fingerprint};
    } : undefined);
    worker.postMessage({id: data.id, pool: {trace: pool.trace, words: pool.words.map(withoutSnapshot), edit: pool.edit.map(withoutSnapshot),
      ghost: pool.ghost.map(withoutSnapshot)}, computeMs: performance.now() - start, assetSha256: typeaheadNgramFingerprint(),
      subjectAssetSha256: activeSubjectNgram(data.request.subject)?.fingerprint});
  } catch {
    worker.postMessage({id: data.id, failed: true});
  }
};
