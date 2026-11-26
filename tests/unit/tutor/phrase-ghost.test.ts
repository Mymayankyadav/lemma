import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {createPhraseGhostClient} from '../../../src/features/tutor/writingAid/decoder/phraseGhostClient';
import type {PhraseGhostRequest} from '../../../src/features/tutor/writingAid/decoder/phraseGhost.worker';
import {findPhraseGhost, phraseGhostProposal, typedPhraseProgress} from '../../../src/features/tutor/writingAid/phraseGhost';
import {PHRASE_GHOST_FINGERPRINT, meetsPhraseGhostOperatingPoint, phraseGhostExactness,
  phraseGhostQualified} from '../../../src/features/tutor/writingAid/phraseGhostConfig';
import {applyWritingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';

const target = {scopeKey: 'answer', mountId: 'editor', editorRevision: 10, selectionRevision: 11, modeRevision: 2};
function request(text: string, updates: Partial<WritingAidRequest> = {}): WritingAidRequest {
  return {cursor: padEdit(text), anchor: text ? {text, start: 0} : null, target,
    mode: 'balanced', fasterTyping: true, expanded: true, phraseGhost: 'lab', composing: false, readOnly: false, ...updates};
}

describe('local phrase preview', () => {
  it('returns one exact punctuation-inclusive insertion without touching the draft', () => {
    const snapshot = request('On the ot');
    const result = findPhraseGhost(snapshot);
    expect(result).toMatchObject({status: 'candidate', rawCount: 1, candidate: {lane: 'approved', context: 'prefix',
      margin: null, labAdmitted: true, edit: {start: 9, end: 9, insert: 'her hand,', caret: 18}}});
    const proposal = phraseGhostProposal(snapshot, 'her hand,')!;
    expect(snapshot.cursor.text).toBe('On the ot');
    expect(proposal.source).toBe('phrase');
    expect(applyWritingAidProposal(snapshot, proposal)).toMatchObject({text: 'On the other hand,', start: 18, end: 18});
    expect(applyWritingAidProposal(request('On the oth'), proposal)).toBeNull();
    expect(applyWritingAidProposal(request('On the ot', {target: {...target, modeRevision: 3}}), proposal)).toBeNull();
    expect(findPhraseGhost(request('on the ot'))).toMatchObject({candidate: {edit: {insert: 'her hand,'}}});
  });

  it('shows no candidate for a proof gap, equation, untrusted text, strict mode or selection', () => {
    const denied = [request('Choose\nOn the ot'), request('Since On the ot'), request('$x + On the ot'),
      request('"On the ot'), request('Tutor: On the ot'), request('On the ot', {cursor: padEdit('On the ot', 3, 9)}),
      request('On the ot', {cursor: padEdit('On the ot', 7)}), request('On the ot', {composing: true}),
      request('On the ot', {readOnly: true}), request('On the ot', {mode: 'strict'}),
      request('On the ot', {anchor: {text: 'On the ot', start: 5}}),
      request('On the ot', {acceptedSpans: [{start: 1, end: 5}]}),
      request('On the ot', {aid: {guardsUnavailable: true} as WritingAidRequest['aid']})];
    expect(denied.map(findPhraseGhost)).toEqual(denied.map(() => ({status: 'ineligible', reason: 'context'})));
  });

  it('keeps the unfiltered top score when a withheld phrase straddles the authored prefix', () => {
    const snapshot = request('On the ot');
    const blocked = request('On the ot', {aid: {withhold: ['the other hand']} as WritingAidRequest['aid']});
    const baseline = findPhraseGhost(snapshot);
    expect(findPhraseGhost(blocked)).toMatchObject({status: 'abstained', reason: 'policy', rawCount: 1,
      rawScore: baseline.status === 'candidate' ? baseline.rawScore : null});
    expect(phraseGhostProposal(blocked, 'her hand,')).toBeUndefined();
  });

  it('requires two wholly authored same-paragraph repetitions for lab admission', () => {
    const text = 'A different point. A different point. A different p';
    const snap = request(text);
    expect(findPhraseGhost(snap)).toMatchObject({candidate: {lane: 'repetition', repetitions: 2, labAdmitted: true, edit: {insert: 'oint.'}}});
    const priorAccepted = request(text, {acceptedSpans: [{start: 30, end: 36}]});
    expect(findPhraseGhost(priorAccepted)).toMatchObject({candidate: {lane: 'repetition', repetitions: 1, labAdmitted: false}});
    expect(findPhraseGhost(request('A different point.\n\nA different p'))).toMatchObject({status: 'abstained', reason: 'no-literal'});
    expect(findPhraseGhost(request('A critical witness. A critical witness. A critical w'))).toMatchObject({status: 'abstained'});
  });

  it('reuses only literal learner-owned progress through the same rule and edit revision', () => {
    const old = request('On the ot');
    const nextTarget = {...target, editorRevision: 11, selectionRevision: 12};
    const next = request('On the oth', {target: nextTarget});
    expect(typedPhraseProgress(old, next, 'her hand,')).toBe('er hand,');
    expect(typedPhraseProgress(old, request('On the oz', {target: nextTarget}), 'her hand,')).toBeUndefined();
    expect(typedPhraseProgress(old, {...next, contextKey: 'another turn'}, 'her hand,')).toBeUndefined();
    expect(typedPhraseProgress(old, {...next, acceptedSpans: [{start: 9, end: 10}]}, 'her hand,')).toBeUndefined();
    expect(typedPhraseProgress(old, {...next, target: {...nextTarget, modeRevision: 3}}, 'her hand,')).toBeUndefined();
    expect(typedPhraseProgress(old, request('On the other hand,', {target: nextTarget}), 'her hand,')).toBe('');
  });

  it('pins the wording and provider code and abstains when the exactness gate has no evidence', () => {
    const dir = resolve('src/features/tutor/writingAid');
    const digest = (files: string[]) => {
      const hash = createHash('sha256');
      for (const file of files) hash.update(readFileSync(resolve(dir, file)));
      return hash.digest('hex');
    };
    expect(PHRASE_GHOST_FINGERPRINT).toBe('phrase-trie-v1:' + digest(['phrase-ghost-bank.json']) + ':' +
      digest(['phraseGhost.ts', 'eligibility.ts', 'usePhraseGhost.ts', 'decoder/phraseGhost.worker.ts']));
    expect(phraseGhostQualified()).toBe(false);
    expect(phraseGhostExactness('approved:prefix:medium', 100)).toBeUndefined();
    expect(meetsPhraseGhostOperatingPoint(1)).toBe(false);
  });

  it('keeps one running and one queued worker request and discards replies that arrive after expiration', async () => {
    class TestWorker extends EventTarget {
      readonly posted: PhraseGhostRequest[] = [];
      constructor() {super(); worker = this;}
      postMessage(value: PhraseGhostRequest) {this.posted.push(value);}
      terminate() {}
      reply(index: number) {
        this.dispatchEvent(new MessageEvent('message', {data: {id: this.posted[index].id, fingerprint: PHRASE_GHOST_FINGERPRINT,
          computeMs: 0, search: {status: 'abstained', reason: 'no-literal', rawCount: 0}}}));
      }
    }
    let worker: TestWorker;
    vi.stubGlobal('Worker', TestWorker);
    vi.useFakeTimers();
    try {
      const client = createPhraseGhostClient()!;
      const deadline = () => performance.timeOrigin + performance.now() + 60;
      const active = client.predict(request('On the o'), deadline());
      active.cancel();
      const superseded = client.predict(request('On the ot'), deadline());
      const newest = client.predict(request('On the oth'), deadline());
      expect(await active.reply).toBe('superseded');
      expect(await superseded.reply).toBe('superseded');
      expect(worker!.posted).toHaveLength(1);
      worker!.reply(0);
      expect(worker!.posted.map(value => value.snapshot.cursor.text)).toEqual(['On the o', 'On the oth']);
      await vi.advanceTimersByTimeAsync(70);
      expect(await newest.reply).toBe('expired');
      worker!.reply(1);
      expect(await newest.reply).toBe('expired');
      client.close();
    } finally {vi.useRealTimers(); vi.unstubAllGlobals();}
  });
});
