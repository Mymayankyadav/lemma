import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {isFlagOn} from '../../../flags';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, canSuggestWritingAid, sameWritingAidRequest, writingAidProposalKey,
  type WritingAidProposal, type WritingAidRefreshSurface, type WritingAidRequest, type WritingAidSuggestions,
} from './policy';
import {recordWritingAidVocabulary, updateWritingAidModel, writingAidFeatures, type WritingAidFeedback} from './learning';
import {saveWritingAidModel, useWritingAidPersonalization} from './personalization';
import type {WritingAidPool} from './engine';
import type {WritingDecoderClient} from './decoder/client';

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
  snapshot: WritingAidRequest;
  sequence: number;
  learningScope: LearningScope;
  suggestions: WritingAidSuggestions;
  pool: WritingAidPool;
}
interface Exposure {proposal: WritingAidProposal; key: string; seenAt: number}
interface PendingAcceptance {proposal: WritingAidProposal; expected: string; learningScope: LearningScope; timer: number; kept: boolean}

export interface WritingAidView extends WritingAidSuggestions {
  /** Indicate actual visibility; undisplayed candidates are never treated as rejections. */
  readonly shown: (surface: WritingAidRefreshSurface, displayed: readonly WritingAidProposal[]) => void;
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
      old.mode !== snapshot.mode) return next;
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
  const {cursor, anchor, target, mode, composing, readOnly} = request;
  const {scopeKey, mountId, editorRevision, selectionRevision, modeRevision} = target;
  const {words, replace, correction, ghost} = request.surfaces ?? ALL_WRITING_AID_SURFACES;
  const snapshot = useMemo<WritingAidRequest>(() => ({
    cursor, anchor, mode, composing, readOnly,
    target: {scopeKey, mountId, editorRevision, selectionRevision, modeRevision},
    surfaces: {words, replace, correction, ghost},
  }), [cursor, anchor, mode, composing, readOnly, scopeKey, mountId, editorRevision, selectionRevision, modeRevision,
    words, replace, correction, ghost]);
  const personalization = useWritingAidPersonalization();
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
  const displayed = useRef<Lists>(freshLists());
  const exposures = useRef<Exposure[]>([]);
  const pending = useRef<PendingAcceptance | null>(null);
  const previous = useRef<WritingAidRequest | null>(null);
  const decoder = useRef<WritingDecoderClient | null>(null);
  const decoderEnabled = isFlagOn('writingDecoder');

  useEffect(() => () => {decoder.current?.dispose(); decoder.current = null;},
    [decoderEnabled, mode, words, scopeKey, mountId, learningScope]);

  const retireFeedback = useCallback(() => {
    exposures.current = [];
    displayed.current = freshLists();
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

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
    if (!prediction || !sameWritingAidRequest(snapshot, proposal.snapshot)) return false;
    const surface = surfaceOf(proposal);
    return !cycle.current.excluded[surface].has(writingAidProposalKey(proposal)) &&
      proposalsFor(prediction.suggestions, surface).some(item => sameProposal(item, proposal));
  }, []);

  const isCurrent = useCallback((proposal: WritingAidProposal): boolean => eligible(proposal) &&
    displayed.current[surfaceOf(proposal)].some(item => sameProposal(item, proposal)), [eligible]);

  const shown = useCallback((surface: WritingAidRefreshSurface, proposals: readonly WritingAidProposal[]) => {
    if (document.visibilityState === 'hidden' || live.current.snapshot.readOnly || live.current.snapshot.composing) {
      exposures.current = [];
      displayed.current = freshLists();
      return;
    }
    const visible = proposals.filter(proposal => surfaceOf(proposal) === surface && eligible(proposal)).slice(0, surface === 'words' ? 3 : 1);
    const {current: prediction, personalization} = live.current;
    // Empty while a prediction is pending is not a hide. An empty report for
    // an available current proposal means that surface really is hidden.
    if (!visible.length && prediction && proposalsFor(prediction.suggestions, surface).length) {
      exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surface);
    }
    displayed.current[surface] = visible;
    if (surface === 'edit' || !personalization.enabled) return;
    for (const proposal of visible) {
      // The same word displayed through successive typed prefixes is one exposure.
      const key = JSON.stringify([proposal.kind, proposal.start, proposal.insert.toLocaleLowerCase()]);
      const sameContinuation = proposal.kind === 'ghost' && exposures.current.some(item => item.proposal.kind === 'ghost' &&
        item.proposal.snapshot.cursor.text + item.proposal.insert === proposal.snapshot.cursor.text + proposal.insert);
      if (!sameContinuation && !exposures.current.some(item => item.key === key)) {
        exposures.current.push({proposal, key, seenAt: Date.now()});
      }
    }
    if (exposures.current.length > 24) exposures.current.splice(0, exposures.current.length - 24);
  }, [eligible]);

  const refresh = useCallback((surface: WritingAidRefreshSurface, proposals: readonly WritingAidProposal[]) => {
    const visible = proposals.filter(proposal => surfaceOf(proposal) === surface && isCurrent(proposal)).slice(0, surface === 'words' ? 3 : 1);
    if (!visible.length) return;
    const model = live.current.personalization;
    for (const proposal of visible) {
      cycle.current.excluded[surface].add(writingAidProposalKey(proposal));
      if (model.enabled) updateWritingAidModel(model.model, 'refresh', writingAidFeatures(proposal));
    }
    cycle.current.attempted[surface] = true;
    displayed.current[surface] = [];
    // Explicitly rejected proposals do not get additional passive feedback.
    exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surface);
    if (model.enabled) save();
    setSequence(value => value + 1);
  }, [isCurrent, save]);

  const feedback = useCallback((signal: WritingAidFeedback, proposal: WritingAidProposal) => {
    const {snapshot, personalization: state, learningScope} = live.current;
    if (snapshot.mode === 'off') return;
    const accepted = pending.current;
    if (signal === 'undo' || signal === 'kept') {
      if (!accepted || accepted.learningScope !== learningScope || !sameProposal(accepted.proposal, proposal)) return;
      if (signal === 'kept' && accepted.kept) return;
      window.clearTimeout(accepted.timer);
      if (signal === 'undo') pending.current = null;
      else accepted.kept = true;
    } else if (!isCurrent(proposal)) return;
    if (state.enabled) {
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
      const timer = window.setTimeout(() => {
        const held = pending.current, latest = live.current;
        if (!held || held.timer !== timer || held.learningScope !== latest.learningScope) return;
        const inserted = held.proposal.insert.trimEnd();
        if (inserted && latest.snapshot.mode !== 'off' && document.visibilityState !== 'hidden' && !latest.snapshot.readOnly && !latest.snapshot.composing &&
            latest.snapshot.cursor.text.slice(held.proposal.start, held.proposal.start + inserted.length) === inserted &&
            latest.personalization.enabled) {
          updateWritingAidModel(latest.personalization.model, 'kept', writingAidFeatures(held.proposal));
          held.kept = true;
          save();
        }
      }, 3000);
      pending.current = {proposal, expected, learningScope, timer, kept: false};
    } else if (signal === 'dismiss') {
      exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surfaceOf(proposal));
    }
  }, [isCurrent, retireFeedback, save]);

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
    if (!sameEditor || old.mode !== snapshot.mode || snapshot.mode === 'off') {
      retireFeedback();
      return;
    }
    if (snapshot.readOnly || snapshot.composing || document.visibilityState === 'hidden') {
      exposures.current = [];
      displayed.current = freshLists();
      return;
    }
    const model = live.current.personalization;
    const held = pending.current;
    if (held && snapshot.cursor.text !== old.cursor.text && snapshot.cursor.text !== held.expected) {
      const inserted = held.proposal.insert.trimEnd();
      if (inserted && snapshot.cursor.text.slice(held.proposal.start, held.proposal.start + inserted.length) !== inserted) {
        window.clearTimeout(held.timer);
        if (model.enabled) {
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
      if (proposal.start < authored.start || proposal.start > old.cursor.text.length) continue;
      const tail = snapshot.cursor.text.slice(proposal.start);
      if (proposal.kind === 'ghost') {
        const actual = tail.toLocaleLowerCase(), expected = proposal.insert.toLocaleLowerCase();
        const matches = actual.startsWith(expected);
        const diverges = actual.length >= Math.min(5, expected.length) && !expected.startsWith(actual) && !matches;
        if (!matches && !diverges) {remaining.push(item); continue;}
        if (Date.now() - item.seenAt >= 300) {
          updateWritingAidModel(model.model, matches ? 'continued-match' : 'divergent', writingAidFeatures(proposal));
          changed = true;
        }
        continue;
      }
      const completed = tail.match(/^([\p{L}\p{M}]+)(?=[^\p{L}\p{M}])/u);
      if (!completed) {remaining.push(item); continue;}
      if (Date.now() - item.seenAt >= 300) {
        updateWritingAidModel(model.model,
          completed[1].toLocaleLowerCase() === proposal.label.toLocaleLowerCase() ? 'continued-match' : 'divergent',
          writingAidFeatures(proposal));
        changed = true;
      }
    }
    exposures.current = remaining;
    if (changed) save();
  }, [snapshot, learningScope, retireFeedback, save]);

  useEffect(() => {
    if (mode === 'off' || !words && !replace && !correction && !ghost) return;
    let cancelled = false;
    const abort = new AbortController();
    let frame: number | undefined;
    void import('./engine').then(({predictWritingAidPool, selectWritingAidPool, writingDecoderPrefix}) => {
      if (cancelled || !canSuggestWritingAid(snapshot)) return;
      frame = window.requestAnimationFrame(() => {
        if (cancelled || learningScope !== live.current.learningScope) return;
        try {
          const {enabled, model: learned} = live.current.personalization;
          const model = enabled ? learned : undefined;
          const pool = predictWritingAidPool(snapshot, model);
          const suggestions = selectWritingAidPool(pool, model, cycle.current.excluded);
          setResult({snapshot, sequence, learningScope, pool, suggestions});
          const prefix = decoderEnabled ? writingDecoderPrefix(snapshot) : null;
          if (prefix) void import('./decoder/client').then(async ({createWritingDecoderClient}) => {
            if (cancelled) return;
            decoder.current ??= createWritingDecoderClient();
            const candidates = await decoder.current.query(prefix, abort.signal);
            if (cancelled || !candidates || learningScope !== live.current.learningScope ||
                !sameWritingAidRequest(snapshot, live.current.snapshot)) return;
            const latest = live.current.personalization;
            const model = latest.enabled ? latest.model : undefined;
            const pool = predictWritingAidPool(snapshot, model, candidates);
            const suggestions = selectWritingAidPool(pool, model, cycle.current.excluded);
            setResult({snapshot, sequence, learningScope, pool, suggestions});
          }).catch(() => {/* Keep the already displayed baseline when the optional decoder fails. */});
        } catch {
          setResult({snapshot, sequence, learningScope, suggestions: NO_WRITING_AID, pool: {words: [], edit: [], ghost: []}});
        }
      });
    }).catch(() => {/* A failed asset load leaves ordinary editing and math keys usable. */});
    return () => {cancelled = true; abort.abort(); if (frame !== undefined) window.cancelAnimationFrame(frame);};
  }, [snapshot, sequence, learningScope, personalization.enabled, mode, words, replace, correction, ghost, decoderEnabled]);

  const suggestions = current?.suggestions ?? NO_WRITING_AID;
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
  return {...suggestions, shown, refresh, feedback, isCurrent, canRefresh, exhausted};
}
