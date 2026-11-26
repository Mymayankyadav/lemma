import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {moveAcceptedSpans} from './authorship';
import {createPhraseGhostClient} from './decoder/phraseGhostClient';
import type {WritingAidFeedback} from './learning';
import {phraseGhostContext, phraseGhostProposal, typedPhraseProgress, type PhraseGhostCandidate} from './phraseGhost';
import {meetsPhraseGhostOperatingPoint, PHRASE_GHOST_DEADLINE_MS, PHRASE_GHOST_FINGERPRINT, phraseGhostExactness,
  type PhraseGhostMode} from './phraseGhostConfig';
import {proposalEdit, sameWritingAidRequest, type WritingAidProposal, type WritingAidRequest} from './policy';

export interface PhraseGhostSample {
  mode: PhraseGhostMode;
  revision: number;
  selectionRevision: number;
  fingerprint: string;
  eligible: boolean;
  status: 'ineligible' | 'pending' | 'abstained' | 'candidate' | 'published' | 'shown' | 'expired' | 'superseded' | 'unavailable';
  reason?: string;
  candidate?: PhraseGhostCandidate;
  exactness?: number;
  rawCount?: number;
  rawScore?: number;
  computeMs?: number;
  elapsedMs?: number;
  frameMs?: number;
  reused?: boolean;
}

type Preview = {proposal: WritingAidProposal; sample: PhraseGhostSample; started: number; deadline: number; profile: object; generation: number};
type Retention = {proposal: WritingAidProposal; expected: string; timer: ReturnType<typeof setTimeout>};
const clock = () => performance.timeOrigin + performance.now();
const hidden = () => document.visibilityState === 'hidden';
const scopeMatches = (a: WritingAidRequest, b: WritingAidRequest) => a.phraseGhost === b.phraseGhost && a.contextKey === b.contextKey &&
  a.mode === b.mode && a.target.scopeKey === b.target.scopeKey && a.target.mountId === b.target.mountId &&
  a.target.modeRevision === b.target.modeRevision && a.aid === b.aid && a.mastery === b.mastery && a.subject === b.subject && a.step === b.step;
const sameSnapshot = (a: WritingAidRequest, b: WritingAidRequest) => scopeMatches(a, b) && sameWritingAidRequest(a, b);
function retains(retention: Retention, text: string): boolean {
  const {start, insert} = retention.proposal;
  return moveAcceptedSpans(retention.expected, text, [{start, end: start + insert.length, text: insert, source: 'phrase'}])
    .some(span => span.text === insert);
}

/** This asynchronous lane never participates in scoring or publishing the strip. */
export function usePhraseGhost(snapshot: WritingAidRequest, profile: object) {
  const mode = snapshot.phraseGhost;
  const client = useRef<ReturnType<typeof createPhraseGhostClient>>(undefined);
  const live = useRef({snapshot, profile});
  live.current = {snapshot, profile};
  const version = useRef(0);
  const [preview, setPreview] = useState<Preview>();
  const sample = useRef<{snapshot: WritingAidRequest; value: PhraseGhostSample}>(undefined);
  const progress = useRef<{snapshot: WritingAidRequest; insert: string; candidate: PhraseGhostCandidate} | undefined>(undefined);
  const pending = useRef<Retention | undefined>(undefined);
  const counts = useRef({eligible: 0, shown: 0, accepted: 0, retained: 0, undone: 0, removed: 0, censored: 0,
    typedThrough: 0, dismissed: 0, expired: 0, superseded: 0, ineligible: 0, abstained: 0, unavailable: 0});

  const endRetention = useCallback((outcome: 'retained' | 'undone' | 'removed' | 'censored') => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current = undefined;
    counts.current[outcome]++;
  }, []);

  useEffect(() => {
    if (!mode) return;
    const current = createPhraseGhostClient();
    client.current = current;
    function hide() {
      version.current++;
      setPreview(undefined);
      progress.current = undefined;
      endRetention('censored');
    }
    const onVisibility = () => {if (hidden()) hide();};
    const read = (event: Event) => {
      if (!live.current.snapshot.replayDiagnostics) return;
      const current = sample.current;
      const callback = (event as CustomEvent<(value: PhraseGhostSample | null) => void>).detail;
      if (typeof callback === 'function') callback(current && sameSnapshot(current.snapshot, live.current.snapshot) ? {...current.value} : null);
    };
    const readCounts = (event: Event) => {
      (event as CustomEvent<(value: typeof counts.current) => void>).detail?.({...counts.current});
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', hide);
    if (mode !== 'qualified') {
      window.addEventListener('lemma-typeahead-read-phrase-ghost', read);
      window.addEventListener('lemma-typeahead-read-phrase-ghost-counts', readCounts);
    }
    return () => {
      version.current++;
      current?.close();
      client.current = undefined;
      progress.current = undefined;
      endRetention('censored');
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('lemma-typeahead-read-phrase-ghost', read);
      window.removeEventListener('lemma-typeahead-read-phrase-ghost-counts', readCounts);
    };
  }, [mode, profile, endRetention]);

  useEffect(() => {
    if (!mode) return;
    const held = pending.current;
    if (held) {
      if (snapshot.readOnly || snapshot.composing || hidden() || !scopeMatches(held.proposal.snapshot, snapshot)) endRetention('censored');
      else if (!sameWritingAidRequest(held.proposal.snapshot, snapshot) && !retains(held, snapshot.cursor.text)) endRetention('removed');
    }
    const value: PhraseGhostSample = {mode, revision: snapshot.target.editorRevision, selectionRevision: snapshot.target.selectionRevision,
      fingerprint: PHRASE_GHOST_FINGERPRINT, eligible: false, status: 'ineligible'};
    sample.current = {snapshot, value};
    const old = progress.current;
    progress.current = undefined;
    const remaining = old && typedPhraseProgress(old.snapshot, snapshot, old.insert);
    if (remaining === '') counts.current.typedThrough++;
    else if (remaining && old) progress.current = {snapshot, insert: remaining, candidate: old.candidate};
    const started = snapshot.phraseGhostStartedAt;
    if (started === undefined || !snapshot.fasterTyping || !phraseGhostContext(snapshot) || hidden()) {
      counts.current.ineligible++;
      return;
    }
    value.eligible = true;
    counts.current.eligible++;
    const deadline = started + PHRASE_GHOST_DEADLINE_MS;
    const generation = version.current;
    let cancelled = false, queuedForPaint = false;
    const valid = () => !cancelled && !hidden() && generation === version.current && profile === live.current.profile &&
      sameSnapshot(snapshot, live.current.snapshot);
    function finish(status: 'expired' | 'superseded' | 'unavailable' | 'ineligible' | 'abstained', reason?: string) {
      value.status = status;
      value.reason = reason;
      counts.current[status]++;
    }
    function publish(proposal: WritingAidProposal) {
      if (!valid()) {finish('superseded'); return;}
      if (clock() > deadline) {finish('expired', 'publish'); return;}
      queuedForPaint = true;
      setPreview({proposal, sample: value, started: started!, deadline, profile, generation});
    }
    function cancel() {
      cancelled = true;
      if (queuedForPaint && value.status === 'candidate') finish('superseded');
    }
    if (remaining !== undefined && old && mode === 'lab') {
      const proposal = phraseGhostProposal(snapshot, remaining);
      if (proposal) {
        value.candidate = {...old.candidate, edit: proposalEdit(proposal)};
        value.reused = true;
        value.status = 'candidate';
        publish(proposal);
      } else if (remaining.length < 5) finish('abstained', 'typed-through');
      if (proposal || remaining.length < 5) return cancel;
    }
    const work = client.current?.predict(snapshot, deadline);
    if (!work) {finish('unavailable'); return;}
    value.status = 'pending';
    void work.reply.then(reply => {
      value.elapsedMs = clock() - started;
      if (!valid()) {finish('superseded'); return;}
      if (typeof reply === 'string') {finish(reply); return;}
      if (reply.fingerprint !== PHRASE_GHOST_FINGERPRINT) {finish('unavailable', 'fingerprint'); return;}
      value.computeMs = reply.computeMs;
      if (!reply.search || clock() > deadline) {finish('expired'); return;}
      const result = reply.search;
      if (result.status === 'ineligible') {finish('ineligible', result.reason); return;}
      value.rawCount = result.rawCount;
      value.rawScore = result.rawScore;
      if (result.status === 'abstained') {finish('abstained', result.reason); return;}
      const candidate = result.candidate;
      const proposal = phraseGhostProposal(snapshot, candidate.edit.insert);
      const edit = proposal && proposalEdit(proposal);
      if (!proposal || candidate.edit.start !== edit?.start || candidate.edit.end !== edit.end || candidate.edit.caret !== edit.caret) {
        finish('abstained', 'live-policy');
        return;
      }
      value.status = 'candidate';
      value.candidate = candidate;
      value.exactness = phraseGhostExactness(candidate.group, candidate.score);
      if (mode === 'lab' && candidate.labAdmitted || mode === 'qualified' && meetsPhraseGhostOperatingPoint(value.exactness)) publish(proposal);
    });
    return () => {
      cancel();
      work.cancel();
    };
  }, [mode, profile, snapshot, endRetention]);

  const current = preview && preview.profile === profile && preview.generation === version.current &&
    sameSnapshot(preview.proposal.snapshot, snapshot) && !hidden() ? preview : undefined;
  useLayoutEffect(() => {
    if (!current || current.sample.status !== 'candidate') return;
    const at = clock();
    if (at > current.deadline) {
      current.sample.status = 'expired';
      current.sample.reason = 'layout';
      current.sample.frameMs = at - current.started;
      counts.current.expired++;
      setPreview(undefined);
      return;
    }
    current.sample.status = 'published';
    current.sample.frameMs = at - current.started;
  }, [current]);

  const shown = useCallback((proposal: WritingAidProposal) => {
    const report = sample.current;
    if (!report || report.value.status !== 'published' || !sameSnapshot(report.snapshot, proposal.snapshot)) return;
    const value = report.value;
    if (!value.candidate) return;
    value.status = 'shown';
    if (!value.reused) counts.current.shown++;
    progress.current = {snapshot: proposal.snapshot, insert: proposal.insert, candidate: value.candidate};
  }, []);

  const feedback = useCallback((signal: WritingAidFeedback, proposal: WritingAidProposal) => {
    if (proposal.snapshot.phraseGhost !== 'lab') return;
    if (signal === 'undo') {
      if (pending.current?.proposal === proposal) endRetention('undone');
      else counts.current.undone++;
      return;
    }
    if (signal !== 'accept' && signal !== 'dismiss') return;
    progress.current = undefined;
    if (signal === 'dismiss') {counts.current.dismissed++; return;}
    counts.current.accepted++;
    endRetention('censored');
    const expected = proposal.snapshot.cursor.text + proposal.insert;
    const timer = setTimeout(() => {
      const held = pending.current;
      const latest = live.current.snapshot;
      if (held?.timer !== timer) return;
      if (hidden() || latest.readOnly || latest.composing || !scopeMatches(proposal.snapshot, latest)) endRetention('censored');
      else endRetention(retains(held, latest.cursor.text) ? 'retained' : 'removed');
    }, 3000);
    pending.current = {proposal, expected, timer};
  }, [endRetention]);

  return {proposal: current?.proposal, shown, feedback};
}
