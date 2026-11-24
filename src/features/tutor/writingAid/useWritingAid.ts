import {moveAcceptedSpans} from './authorship';
import {normalizeAidScopePrefix} from './answerAids';
import {exposureIdentity, visibleTime} from './visibleTime';
import {typeaheadFrozenProfile, typeaheadGhostProbe, typeaheadGraphTrial, typeaheadReplayEnabled, usesNeural, usesPersonalization, usesTutorBias} from './replayArm';
import {countPersonalTransition, learnSlateChoice, observeLocalCalibration, writingAidWeek} from './adaptation';
import {isFlagOn} from '../../../flags';
import {createNgramClient, type NgramClient} from './decoder/ngramClient';
import {prepareMainTypeaheadFallback} from './decoder/ngramSpatial';
import {createNeuralClient, type NeuralClient} from './decoder/neuralClient';
import type {NeuralReply} from './decoder/neural.worker';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, canSuggestWritingAid, eligibleGhostContext, eligibleNeuralContext, proposalEligible,
  sameWritingAidRequest, writingAidProposal, writingAidProposalKey,
  type WritingAidProposal, type WritingAidRefreshSurface, type WritingAidRequest, type WritingAidSuggestions,
} from './policy';
import {recordWritingAidVocabulary, scoreWritingAidProposal, updateWritingAidModel, writingAidFeatures, type WritingAidFeedback} from './learning';
import {saveWritingAidImpressions, saveWritingAidModel, useWritingAidPersonalization} from './personalization';
import {applyNeuralReply, selectWritingAidPool, type WritingAidPool} from './poolRanking';

type Flags = Readonly<Record<WritingAidRefreshSurface, boolean>>;
type Lists = Record<WritingAidRefreshSurface, readonly WritingAidProposal[]>;
type Exclusions = Record<WritingAidRefreshSurface, Set<string>>;
interface Cycle {
  snapshot: WritingAidRequest;
  excluded: Exclusions;
  attempted: Record<WritingAidRefreshSurface, boolean>;
}
interface LearningScope {scopeKey: string; generation: string}
interface Prediction {
  assets?: {ngram?: string; neural?: string};
  snapshot: WritingAidRequest;
  sequence: number;
  learningScope: LearningScope;
  suggestions: WritingAidSuggestions;
  pool: WritingAidPool;
}
interface Exposure {proposal: WritingAidProposal; key: string}
interface PendingAcceptance {
  proposal: WritingAidProposal; expected: string; learningScope: LearningScope; timer: number; deadline: number; kept: boolean;
  retention: 'pending' | 'observed' | 'censored';
}

function retainsAcceptedText(value: PendingAcceptance, draft: string): boolean {
  const start = value.proposal.start, text = value.proposal.insert.trimEnd();
  if (!text || value.expected.slice(start, start + text.length) !== text) return false;
  return moveAcceptedSpans(value.expected, draft, [{start, end: start + text.length, text, source: 'word'}])
    .some(span => span.text === text);
}

function censorRetention(value: PendingAcceptance | null): void {
  if (value?.retention === 'pending') {
    clearTimeout(value.timer);
    value.retention = 'censored';
  }
}

export interface WritingAidView extends WritingAidSuggestions {
  readonly assetHashes: Readonly<{ngram?: string; neural?: string}>;
  readonly rankedWords: readonly WritingAidProposal[];
  /** Indicate actual visibility; undisplayed candidates are never treated as rejections. */
  readonly shown: (surface: WritingAidRefreshSurface, displayed: readonly WritingAidProposal[], covered?: boolean) => void;
  readonly refresh: (surface: WritingAidRefreshSurface, displayed: readonly WritingAidProposal[]) => void;
  readonly feedback: (signal: WritingAidFeedback, proposal: WritingAidProposal) => void;
  readonly isCurrent: (proposal: WritingAidProposal) => boolean;
  readonly canRefresh: Flags;
  readonly exhausted: Flags;
}

const noFlags: Flags = Object.freeze({words: false, edit: false, ghost: false});
const freshLists = (): Lists => ({words: [], edit: [], ghost: []});
const freshCycle = (snapshot: WritingAidRequest): Cycle => ({snapshot,
  excluded: {words: new Set(), edit: new Set(), ghost: new Set()},
  attempted: {words: false, edit: false, ghost: false},
});
function advanceCycle(previous: Cycle, snapshot: WritingAidRequest): Cycle {
  const next = freshCycle(snapshot), old = previous.snapshot;
  // A declined replacement remains declined for that occurrence while its
  // preceding text and source remain intact. Deletion creates a fresh decision.
  if (old.target.scopeKey !== snapshot.target.scopeKey || old.target.mountId !== snapshot.target.mountId ||
      old.mode !== snapshot.mode || old.contextKey !== snapshot.contextKey) return next;
  for (const key of previous.excluded.edit) {
    try {
      const [, start, end, before] = JSON.parse(key) as [string, number, number, string, string];
      if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start &&
          snapshot.cursor.text.slice(0, end) === old.cursor.text.slice(0, end) &&
          snapshot.cursor.text.slice(start, end) === before) next.excluded.edit.add(key);
    } catch {/* Exclusion keys are internal; ignore a malformed key. */}
  }
  next.attempted.edit = next.excluded.edit.size > 0 && previous.attempted.edit;
  return next;
}
const surfaceOf = (proposal: WritingAidProposal): WritingAidRefreshSurface =>
  proposal.kind === 'word' ? 'words' : proposal.kind === 'ghost' ? 'ghost' : 'edit';
const proposalsFor = (suggestions: WritingAidSuggestions, surface: WritingAidRefreshSurface): readonly WritingAidProposal[] =>
  surface === 'words' ? suggestions.words : suggestions[surface] ? [suggestions[surface]!] : [];
const sameProposal = (a: WritingAidProposal, b: WritingAidProposal) =>
  writingAidProposalKey(a) === writingAidProposalKey(b) && sameWritingAidRequest(a.snapshot, b.snapshot);

/** The model and draft stay local. Stale and hidden proposals cannot be fed back. */
export function useWritingAid(request: WritingAidRequest): WritingAidView {
  const {cursor, anchor, target, mode, composing, readOnly, contextKey, aid, mastery, subject, step, question, middleEdits, arm, replayDiagnostics} = request;
  const {scopeKey, mountId, editorRevision, selectionRevision, modeRevision} = target;
  const {words, replace, correction, ghost} = request.surfaces ?? ALL_WRITING_AID_SURFACES;
  const snapshot = useMemo<WritingAidRequest>(() => ({
    cursor, anchor, mode, composing, readOnly, contextKey, aid, mastery, subject, step, question, middleEdits, arm, replayDiagnostics,
    target: {scopeKey, mountId, editorRevision, selectionRevision, modeRevision},
    surfaces: {words, replace, correction, ghost},
  }), [cursor, anchor, mode, composing, readOnly, contextKey, aid, mastery, subject, step, question, middleEdits, arm, replayDiagnostics, scopeKey, mountId, editorRevision, selectionRevision, modeRevision,
    words, replace, correction, ghost]);
  const storedPersonalization = useWritingAidPersonalization();
  const personalization = usesPersonalization(arm) && !typeaheadFrozenProfile() ? storedPersonalization : {...storedPersonalization, enabled: false};
  const {scopeKey: profileScope, generation} = personalization;
  const learningScope = useMemo<LearningScope>(() => ({scopeKey: profileScope, generation}), [profileScope, generation]);
  const cycle = useRef<Cycle>(freshCycle(snapshot));
  if (!sameWritingAidRequest(cycle.current.snapshot, snapshot)) cycle.current = advanceCycle(cycle.current, snapshot);
  const [sequence, setSequence] = useState(0);
  const [result, setResult] = useState<Prediction>();
  const current = result && result.sequence === sequence && result.learningScope === learningScope &&
    sameWritingAidRequest(snapshot, result.snapshot) ? result : undefined;
  const live = useRef({snapshot, current, personalization, learningScope});
  live.current = {snapshot, current, personalization, learningScope};
  const [visibility] = useState(visibleTime);
  useEffect(() => {
    const hide = () => {visibility.hide(Date.now()); censorRetention(pending.current);};
    const changed = () => {if (document.visibilityState === 'hidden') hide();};
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', changed);
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, [visibility]);
  const displayed = useRef<Lists>(freshLists());
  const coveredOffers = useRef<Lists>(freshLists());
  const exposures = useRef<Exposure[]>([]);
  const pending = useRef<PendingAcceptance | null>(null);
  const previous = useRef<WritingAidRequest | null>(null);

  const ngram = useRef<NgramClient | undefined>(undefined);
  const ghostProbe = useRef<{snapshot: WritingAidRequest; learningScope: LearningScope; reply: NeuralReply} | undefined>(undefined);
  useEffect(() => {
    if (!isFlagOn('typeaheadV2') || mode === 'off' || readOnly) return;
    const client = createNgramClient();
    ngram.current = client;
    return () => {client?.close(); ngram.current = undefined;};
  }, [readOnly, mode, scopeKey, mountId, profileScope, generation]);

  useEffect(() => {
    if (!typeaheadReplayEnabled()) return;
    function componentSample(event: Event) {
      const {id, target} = (event as CustomEvent<{id: string; target: string}>).detail ?? {};
      if (typeof id !== 'string' || typeof target !== 'string' || target.length > 128) return;
      const word = target.trim().toLowerCase();
      const current = live.current.current;
      const client = ngram.current;
      if (!current || !client || !/^[\p{L}\p{M}]+(?:['’\p{Pd}][\p{L}\p{M}]+)*$/u.test(word)) return;
      void client.components(word, current.snapshot).then(detail => {
        window.dispatchEvent(new CustomEvent('lemma-typeahead-components-result', {detail: {...detail, id}}));
      }).catch(() => undefined);
    }
    function ghostSample(event: Event) {
      if (!typeaheadGhostProbe()) return;
      const id = (event as CustomEvent<{id?: string}>).detail?.id;
      if (typeof id !== 'string' || document.visibilityState === 'hidden') return;
      const {snapshot, learningScope} = live.current;
      const sample = ghostProbe.current;
      if (!sample || sample.learningScope !== learningScope || !sameWritingAidRequest(sample.snapshot, snapshot)) return;
      const buckets = new Set<string>();
      const candidates = sample.reply.ghostProbe?.filter(candidate => {
        const {end} = snapshot.cursor;
        const length = candidate.text.length;
        const bucket = length < 8 ? 'short' : length < 16 ? 'medium' : 'long';
        const proposal = writingAidProposal(snapshot, 'ghost', end, end, candidate.text);
        if (buckets.has(bucket) || !proposalEligible(snapshot, proposal)) return false;
        buckets.add(bucket);
        return true;
      });
      window.dispatchEvent(new CustomEvent('lemma-typeahead-ghost-probe-result',
        {detail: {id, candidates, modelFingerprint: sample.reply.modelFingerprint}}));
    }
    window.addEventListener('lemma-typeahead-components-request', componentSample);
    window.addEventListener('lemma-typeahead-ghost-probe-request', ghostSample);
    return () => {
      window.removeEventListener('lemma-typeahead-components-request', componentSample);
      window.removeEventListener('lemma-typeahead-ghost-probe-request', ghostSample);
    };
  }, []);

  const neural = useRef<NeuralClient | undefined>(undefined);
  const neuralEpoch = [scopeKey, mountId, contextKey, profileScope, generation, mode].join('|');
  useEffect(() => {
    if (!isFlagOn('typeaheadV2') || !usesNeural(arm) || mode === 'off' || readOnly) return;
    let closed = false;
    void createNeuralClient(typeaheadGraphTrial()).then(client => {
      if (closed) client?.close();
      else neural.current = client;
    }).catch(() => undefined);
    return () => {closed = true; neural.current?.close(); neural.current = undefined;};
  }, [readOnly, mode, scopeKey, mountId, profileScope, generation, arm]);
  useEffect(() => neural.current?.reset(), [neuralEpoch]);

  const impressionBatch = useRef<{scope: LearningScope; count: number; at: number; timer: number} | null>(null);
  const flushImpressions = useCallback(() => {
    const batch = impressionBatch.current;
    if (!batch) return;
    impressionBatch.current = null;
    window.clearTimeout(batch.timer);
    saveWritingAidImpressions(batch.scope.scopeKey, batch.scope.generation, batch.count, batch.at);
  }, []);
  const recordImpression = useCallback((scope: LearningScope, at: number) => {
    if (impressionBatch.current?.scope !== scope) flushImpressions();
    const batch = impressionBatch.current;
    if (batch) batch.count++;
    else impressionBatch.current = {scope, count: 1, at, timer: window.setTimeout(flushImpressions, 600)};
  }, [flushImpressions]);
  useEffect(() => {
    window.addEventListener('pagehide', flushImpressions);
    return () => {window.removeEventListener('pagehide', flushImpressions); flushImpressions();};
  }, [flushImpressions, learningScope]);

  const retireFeedback = useCallback(() => {
    visibility.reset();
    exposures.current = [];
    displayed.current = freshLists();
    coveredOffers.current = freshLists();
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  }, [visibility]);

  useLayoutEffect(() => {
    previous.current = null;
    return retireFeedback;
  }, [learningScope, retireFeedback]);

  const save = useCallback(() => {
    const {scopeKey, generation, model} = live.current.personalization;
    saveWritingAidModel(scopeKey, generation, model);
  }, []);

  const eligible = useCallback((proposal: WritingAidProposal): boolean => {
    const {snapshot, current: prediction} = live.current;
    if (!sameWritingAidRequest(snapshot, proposal.snapshot)) return false;
    if (proposal.source === 'notation' || proposal.source === 'equation') return !snapshot.readOnly && !snapshot.composing;
    if (!prediction) return false;
    const surface = surfaceOf(proposal);
    const choices = surface === 'words' && isFlagOn('typeaheadV2') ? prediction.pool.words : proposalsFor(prediction.suggestions, surface);
    return !cycle.current.excluded[surface].has(writingAidProposalKey(proposal)) &&
      choices.some(item => sameProposal(item, proposal));
  }, []);

  const isCurrent = useCallback((proposal: WritingAidProposal): boolean => eligible(proposal) &&
    displayed.current[surfaceOf(proposal)].some(item => sameProposal(item, proposal)), [eligible]);

  const shown = useCallback((surface: WritingAidRefreshSurface, proposals: readonly WritingAidProposal[], covered = false) => {
    const now = Date.now();
    if (document.visibilityState === 'hidden' || live.current.snapshot.readOnly || live.current.snapshot.composing) {
      visibility.hide(now);
      exposures.current = [];
      displayed.current = freshLists();
      coveredOffers.current = freshLists();
      return;
    }
    // Preserve the last visible slate for an explicit Refresh in Session actions.
    // A covered offer is ineligible for taps, exposure time and passive learning.
    if (covered && displayed.current[surface].length) coveredOffers.current[surface] = displayed.current[surface];
    if (!covered) coveredOffers.current[surface] = [];
    const visible = proposals.filter(proposal => surfaceOf(proposal) === surface && eligible(proposal)).slice(0, surface === 'words' ? 3 : 1);
    const {current: prediction, personalization} = live.current;
    // Empty while a prediction is pending is not a hide. An empty report for
    // an available current proposal means that surface really is hidden.
    if (!visible.length && prediction && proposalsFor(prediction.suggestions, surface).length) {
      exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surface);
    }
    displayed.current[surface] = visible;
    visibility.update(surface, visible.map(exposureIdentity), now);
    if (surface === 'edit' || !personalization.enabled) return;
    for (const proposal of visible) {
      // The same word displayed through successive typed prefixes is one exposure.
      const key = exposureIdentity(proposal);
      const sameContinuation = proposal.kind === 'ghost' && exposures.current.some(item => item.proposal.kind === 'ghost' &&
        item.proposal.snapshot.cursor.text + item.proposal.insert === proposal.snapshot.cursor.text + proposal.insert);
      if (!sameContinuation && !exposures.current.some(item => item.key === key)) {
        exposures.current.push({proposal, key});
        if (isFlagOn('typeaheadV2')) recordImpression(live.current.learningScope, Date.now());
      }
    }
    if (exposures.current.length > 24) exposures.current.splice(0, exposures.current.length - 24);
  }, [eligible, recordImpression, visibility]);

  const refresh = useCallback((surface: WritingAidRefreshSurface, proposals: readonly WritingAidProposal[]) => {
    const visible = proposals.filter(proposal => surfaceOf(proposal) === surface && eligible(proposal) &&
      (isCurrent(proposal) || coveredOffers.current[surface].some(item => sameProposal(item, proposal))))
      .slice(0, surface === 'words' ? 3 : 1);
    if (!visible.length) return;
    const model = live.current.personalization;
    for (const proposal of visible) {
      cycle.current.excluded[surface].add(writingAidProposalKey(proposal));
      if (model.enabled) updateWritingAidModel(model.model, 'refresh', writingAidFeatures(proposal));
    }
    cycle.current.attempted[surface] = true;
    displayed.current[surface] = [];
    coveredOffers.current[surface] = [];
    visibility.update(surface, [], Date.now());
    // Explicitly rejected proposals do not get additional passive feedback.
    exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surface);
    if (model.enabled) save();
    setSequence(value => value + 1);
  }, [eligible, isCurrent, save, visibility]);

  const feedback = useCallback((signal: WritingAidFeedback, proposal: WritingAidProposal) => {
    const {snapshot, personalization: state, learningScope} = live.current;
    if (snapshot.mode === 'off') return;
    const accepted = pending.current;
    if (signal === 'undo' || signal === 'kept') {
      if (!accepted || accepted.learningScope !== learningScope || !sameProposal(accepted.proposal, proposal)) return;
      if (signal === 'kept' && accepted.kept) return;
      if (signal === 'undo' || !isFlagOn('typeaheadV2')) window.clearTimeout(accepted.timer);
      if (signal === 'undo') pending.current = null;
      else accepted.kept = true;
    } else if (!isCurrent(proposal)) return;
    if (state.enabled) {
      if (isFlagOn('typeaheadV2')) {
        const weekly = writingAidWeek(state.model.adaptation);
        const keys = Math.max(0, proposal.insert.length - proposal.before.length - 1);
        if (signal === 'accept') {
          weekly.accepts++;
          observeLocalCalibration(state.model.adaptation, proposal, 'accept', true);
          weekly.keysSaved += keys;
          const slate = displayed.current[surfaceOf(proposal)];
          const winner = slate.find(item => sameProposal(item, proposal));
          if (winner) learnSlateChoice(state.model.adaptation, winner, slate, item =>
            visibility.elapsed(surfaceOf(item), exposureIdentity(item), Date.now()));
          for (const alternative of slate) if (!sameProposal(alternative, proposal) &&
              visibility.elapsed(surfaceOf(alternative), exposureIdentity(alternative), Date.now()) >= 300) {
            observeLocalCalibration(state.model.adaptation, alternative, 'accept', false);
          }
        } else if (signal === 'dismiss') {
          observeLocalCalibration(state.model.adaptation, proposal, 'accept', false);
        } else if (signal === 'undo') {
          if (accepted?.retention === 'pending' && Date.now() <= accepted.deadline) {
            observeLocalCalibration(state.model.adaptation, proposal, 'retain', false);
          }
          weekly.undos++; weekly.keysSaved = Math.max(0, weekly.keysSaved - keys);}
      }
      updateWritingAidModel(state.model, signal, writingAidFeatures(proposal));
      if (signal === 'accept') {
        // Only alternatives known to have been visible count as declined.
        for (const other of displayed.current[surfaceOf(proposal)]) {
          if (!sameProposal(other, proposal) && isCurrent(other)) {
            updateWritingAidModel(state.model, 'alternate', writingAidFeatures(other));
          }
        }
      }
      save();
    }
    if (signal === 'accept') {
      retireFeedback();
      if (!state.enabled) return;
      const {start, end, insert} = proposal, text = proposal.snapshot.cursor.text;
      const expected = text.slice(0, start) + insert + text.slice(end);
      const deadline = Date.now() + 3000;
      const timer = window.setTimeout(() => {
        const held = pending.current, latest = live.current;
        if (!held || held.timer !== timer || held.learningScope !== latest.learningScope) return;
        if (held.retention !== 'pending') return;
        if (latest.snapshot.mode !== 'off' && document.visibilityState !== 'hidden' && !latest.snapshot.readOnly && !latest.snapshot.composing &&
            retainsAcceptedText(held, latest.snapshot.cursor.text) && latest.personalization.enabled) {
          if (isFlagOn('typeaheadV2')) {
            writingAidWeek(latest.personalization.model.adaptation).retained++;
            observeLocalCalibration(latest.personalization.model.adaptation, held.proposal, 'retain', true);
          }
          if (!held.kept) updateWritingAidModel(latest.personalization.model, 'kept', writingAidFeatures(held.proposal));
          held.kept = true;
          held.retention = 'observed';
          save();
        } else held.retention = 'censored';
      }, 3000);
      pending.current = {proposal, expected, learningScope, timer, deadline, kept: false, retention: 'pending'};
    } else if (signal === 'dismiss') {
      exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surfaceOf(proposal));
    }
  }, [isCurrent, retireFeedback, save, visibility]);

  useEffect(() => {
    const old = previous.current;
    previous.current = snapshot;
    if (!old) return;
    const sameEditor = old.target.scopeKey === snapshot.target.scopeKey && old.target.mountId === snapshot.target.mountId;
    const direct = sameEditor && !snapshot.composing && !snapshot.readOnly && snapshot.anchor &&
      !snapshot.anchor.continuation && snapshot.anchor.text === snapshot.cursor.text &&
      snapshot.cursor.text.length > old.cursor.text.length && snapshot.cursor.text.startsWith(old.cursor.text) &&
      old.cursor.start === old.cursor.end && old.cursor.end === old.cursor.text.length &&
      snapshot.cursor.start === snapshot.cursor.end && snapshot.cursor.end === snapshot.cursor.text.length;
    if (!sameEditor || old.contextKey !== snapshot.contextKey || old.mode !== snapshot.mode || snapshot.mode === 'off') {
      retireFeedback();
      return;
    }
    if (snapshot.readOnly || snapshot.composing || document.visibilityState === 'hidden') {
      visibility.hide(Date.now());
      censorRetention(pending.current);
      exposures.current = [];
      displayed.current = freshLists();
      coveredOffers.current = freshLists();
      return;
    }
    const model = live.current.personalization;
    const held = pending.current;
    if (held && snapshot.cursor.text !== old.cursor.text && snapshot.cursor.text !== held.expected) {
      if (!retainsAcceptedText(held, snapshot.cursor.text)) {
        window.clearTimeout(held.timer);
        if (model.enabled) {
          if (isFlagOn('typeaheadV2') && held.retention === 'pending' && Date.now() <= held.deadline) {
            observeLocalCalibration(model.model.adaptation, held.proposal, 'retain', false);
          }
          updateWritingAidModel(model.model, 'partial-edit', writingAidFeatures(held.proposal));
          save();
        }
        pending.current = null;
      }
    }
    if (!direct) {
      if (snapshot.cursor.text !== old.cursor.text) exposures.current = [];
      return;
    }
    if (!model.enabled) return;
    let changed = false;
    const authored = snapshot.anchor!;
    const newlyCompleted = authored.text.slice(authored.start);
    if (isFlagOn('typeaheadV2')) {
      const words = [...newlyCompleted.matchAll(/[\p{L}\p{M}]{1,32}(?=[^\p{L}\p{M}])/gu)];
      for (let index = 1; index < words.length; index++) {
        const prior = words[index - 1], word = words[index];
        const separator = newlyCompleted.slice(prior.index + prior[0].length, word.index);
        const wordEnd = authored.start + word.index + word[0].length;
        if (/^[ \t]+$/u.test(separator) && wordEnd >= old.cursor.text.length && wordEnd < snapshot.cursor.text.length) {
          countPersonalTransition(model.model.adaptation, prior[0], word[0], snapshot.subject);
          changed = true;
        }
      }
    }
    for (const match of newlyCompleted.matchAll(/[\p{L}\p{M}]{4,32}(?=[^\p{L}\p{M}])/gu)) {
      const end = authored.start + match.index + match[0].length;
      if (end >= old.cursor.text.length && end < snapshot.cursor.text.length) {
        recordWritingAidVocabulary(model.model, match[0]);
        updateWritingAidModel(model.model, 'personal-use', {
          kind: 'word', candidate: match[0], previous: '', prefix: match[0], mode: snapshot.mode,
        });
        changed = true;
      }
    }
    const remaining: Exposure[] = [];
    for (const item of exposures.current) {
      const proposal = item.proposal;
      if (proposal.source === 'notation' || proposal.source === 'equation') continue;
      if (proposal.start < authored.start || proposal.start > old.cursor.text.length) continue;
      const tail = snapshot.cursor.text.slice(proposal.start);
      if (proposal.kind === 'ghost') {
        const actual = tail.toLocaleLowerCase(), expected = proposal.insert.toLocaleLowerCase();
        const matches = actual.startsWith(expected);
        const diverges = actual.length >= Math.min(5, expected.length) && !expected.startsWith(actual) && !matches;
        if (!matches && !diverges) {remaining.push(item); continue;}
        if (visibility.elapsed(surfaceOf(proposal), item.key, Date.now()) >= 300) {
          if (isFlagOn('typeaheadV2')) observeLocalCalibration(model.model.adaptation, proposal, 'exact', matches);
          updateWritingAidModel(model.model, matches ? 'continued-match' : 'divergent', writingAidFeatures(proposal));
          changed = true;
        }
        continue;
      }
      const completed = tail.match(/^([\p{L}\p{M}]+(?:['’\p{Pd}][\p{L}\p{M}]+)*)(?=[^\p{L}\p{M}'’\p{Pd}])/u);
      if (!completed) {remaining.push(item); continue;}
      if (visibility.elapsed(surfaceOf(proposal), item.key, Date.now()) >= 300) {
        const matches = completed[1].toLocaleLowerCase() === proposal.label.toLocaleLowerCase();
        if (isFlagOn('typeaheadV2')) observeLocalCalibration(model.model.adaptation, proposal, 'exact', matches);
        updateWritingAidModel(model.model, matches ? 'continued-match' : 'divergent',
          writingAidFeatures(proposal));
        changed = true;
      }
    }
    exposures.current = remaining;
    if (changed) save();
  }, [snapshot, learningScope, retireFeedback, save, visibility]);

  useEffect(() => {
    if (mode === 'off' || !words && !replace && !correction && !ghost) return;
    const startedAt = Date.now();
    let cancelled = false;
    let frame: number | undefined;
    const {enabled, model: learned} = live.current.personalization;
    const model = enabled ? learned : undefined;
    if (!canSuggestWritingAid(snapshot)) return;
    const worker = ngram.current;
    const stillCurrent = () => !cancelled && learningScope === live.current.learningScope &&
      sameWritingAidRequest(snapshot, live.current.snapshot);
    const workerReply = worker?.predict(snapshot, model);
    function report(pool: WritingAidPool, ngramSha?: string) {
      if (!stillCurrent()) return;
      const suggestions = selectWritingAidPool(pool, model, cycle.current.excluded);
      setResult({snapshot, sequence, learningScope, pool, suggestions, assets: {ngram: ngramSha}});
      const client = neural.current;
      if (!client || !eligibleNeuralContext(snapshot)) return;
      const draft = snapshot.cursor.text.slice(0, snapshot.cursor.end);
      const prefix = /\p{L}[\p{L}\p{M}'’\p{Pd}]{0,31}$/u.exec(draft)?.[0] ?? '';
      const aids = snapshot.aid?.level === 'none' ? '' : [...snapshot.aid?.terms ?? [], ...snapshot.aid?.symbols ?? [],
        ...(usesTutorBias(arm) ? snapshot.aid?.ranking?.hints : undefined)?.filter(hint => hint.role === 'given' || hint.role === 'neutral')
          .filter(hint => !hint.scope?.subject || hint.scope.subject === subject)
          .filter(hint => !hint.scope?.step || hint.scope.step === step)
          .filter(hint => !hint.scope?.mode || hint.scope.mode === 'prose')
          .filter(hint => !hint.scope?.prefixes?.length || hint.scope.prefixes.some(value =>
            normalizeAidScopePrefix(hint.kind, prefix).startsWith(normalizeAidScopePrefix(hint.kind, value))))
          .filter(hint => !hint.scope?.phraseStates?.length && hint.priority !== 'deemphasize')
          .map(hint => hint.entry) ?? []].join(' ');
      const ghostAllowed = isFlagOn('proofAssistGhost') && eligibleGhostContext(snapshot);
      const probe = ghostAllowed && typeaheadGhostProbe();
      void client.predict({epoch: neuralEpoch, prompt: {question: question?.filter(Boolean).join('\n') ?? '', aids, draft},
        prefix, words: pool.words.filter(entry => entry.source !== 'symbol').map(entry => entry.label),
        startedAt, deadline: startedAt + 60, ghost: ghostAllowed, probeGhost: probe}).then(reply => {
        if (!reply || cancelled || Date.now() > startedAt + 60 || learningScope !== live.current.learningScope ||
            !sameWritingAidRequest(snapshot, live.current.snapshot)) return;
        if (probe) ghostProbe.current = {snapshot, learningScope, reply};
        const updated = applyNeuralReply(pool, snapshot, reply);
        const selected = selectWritingAidPool(updated, model, cycle.current.excluded);
        setResult({snapshot, sequence, learningScope, pool: updated, suggestions: selected, assets: {ngram: ngramSha, neural: reply.assetSha256}});
      }).catch(() => undefined);
    }
    const showFallback = async () => {
      if (isFlagOn('typeaheadV2')) await prepareMainTypeaheadFallback(arm);
      const engine = await import('./engine');
      if (!stillCurrent()) return;
      frame = window.requestAnimationFrame(() => {
        if (!stillCurrent()) return;
        try {report(engine.predictWritingAidPool(snapshot, model));}
        catch {setResult({snapshot, sequence, learningScope, suggestions: NO_WRITING_AID, pool: {words: [], edit: [], ghost: []}});}
      });
    };
    if (workerReply) {
      void workerReply.then(reply => {
        if (!stillCurrent() || reply === null) return;
        if (reply === 'unavailable') return showFallback();
        performance.clearMarks('lemma.typeahead.ngram');
        performance.mark('lemma.typeahead.ngram', {detail: {...worker?.diagnostics(), computeMs: reply.computeMs, elapsedMs: reply.elapsedMs, assetSha256: reply.assetSha256}});
        report(reply.pool, reply.assetSha256);
      }).catch(() => undefined);
    } else void showFallback().catch(() => undefined);
    return () => {cancelled = true; worker?.cancel(); if (frame !== undefined) window.cancelAnimationFrame(frame);};
  }, [snapshot, sequence, learningScope, personalization.enabled, mode, words, replace, correction, ghost, neuralEpoch, subject, step, question, arm]);

  const suggestions = current?.suggestions ?? NO_WRITING_AID;
  const rankedWords = current?.pool.words.filter(proposal => !cycle.current.excluded.words.has(writingAidProposalKey(proposal)))
    .map(proposal => personalization.enabled
      ? {...proposal, score: (proposal.score ?? 0) + scoreWritingAidProposal(personalization.model, proposal)}
      : proposal).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) ?? [];
  const canRefresh: Flags = current ? Object.fromEntries((['words', 'edit', 'ghost'] as const).map(surface => {
    const alreadyShown = new Set(proposalsFor(suggestions, surface).map(writingAidProposalKey));
    return [surface, current.pool[surface].some(proposal => !cycle.current.excluded[surface].has(writingAidProposalKey(proposal)) &&
      !alreadyShown.has(writingAidProposalKey(proposal)))];
  })) as unknown as Flags : noFlags;
  const exhausted: Flags = current ? {
    words: cycle.current.attempted.words && !suggestions.words.length,
    edit: cycle.current.attempted.edit && !suggestions.edit,
    ghost: cycle.current.attempted.ghost && !suggestions.ghost,
  } : noFlags;
  return {...suggestions, assetHashes: current?.assets ?? {}, rankedWords, shown, refresh, feedback, isCurrent, canRefresh, exhausted};
}
