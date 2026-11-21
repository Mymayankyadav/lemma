import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, canSuggestWritingAid, sameWritingAidRequest, writingAidProposalKey,
  type WritingAidProposal, type WritingAidRefreshSurface, type WritingAidRequest, type WritingAidSuggestions,
} from './policy';
import {recordWritingAidVocabulary, updateWritingAidModel, writingAidFeatures, type WritingAidFeedback} from './learning';
import {loadWritingAidPersonalization, saveWritingAidPersonalization, useWritingAidPersonalization,
  type WritingAidPersonalization} from './personalization';
import type {WritingAidPool} from './engine';

type Flags = Readonly<Record<WritingAidRefreshSurface, boolean>>;
type Lists = Record<WritingAidRefreshSurface, readonly WritingAidProposal[]>;
type Exclusions = Record<WritingAidRefreshSurface, Set<string>>;
interface Cycle {
  snapshot: WritingAidRequest;
  excluded: Exclusions;
  attempted: Record<WritingAidRefreshSurface, boolean>;
}
interface Prediction {
  snapshot: WritingAidRequest;
  sequence: number;
  suggestions: WritingAidSuggestions;
  pool: WritingAidPool;
}
interface Exposure {proposal: WritingAidProposal; key: string; seenAt: number}
interface PendingAcceptance {proposal: WritingAidProposal; expected: string; scopeKey: string; timer: number; kept: boolean}

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
  const memory = useRef<{scopeKey: string; raw: string; state: WritingAidPersonalization}>(null!);
  if (!memory.current || memory.current.scopeKey !== personalization.scopeKey || memory.current.raw !== personalization.raw) {
    memory.current = {scopeKey: personalization.scopeKey, raw: personalization.raw,
      state: loadWritingAidPersonalization(personalization.scopeKey)};
  }
  const cycle = useRef<Cycle>(freshCycle(snapshot));
  if (!sameWritingAidRequest(cycle.current.snapshot, snapshot)) cycle.current = advanceCycle(cycle.current, snapshot);
  const [sequence, setSequence] = useState(0);
  const [result, setResult] = useState<Prediction>();
  const live = useRef({snapshot, sequence, result, scopeKey: personalization.scopeKey});
  live.current = {snapshot, sequence, result, scopeKey: personalization.scopeKey};
  const displayed = useRef<Lists>(freshLists());
  const exposures = useRef<Exposure[]>([]);
  const pending = useRef<PendingAcceptance | null>(null);
  const previous = useRef<WritingAidRequest | null>(null);

  const save = useCallback(() => {
    if (memory.current.state.enabled) saveWritingAidPersonalization(memory.current.scopeKey, memory.current.state);
  }, []);

  const eligible = useCallback((proposal: WritingAidProposal): boolean => {
    const {snapshot: current, result: prediction, sequence: currentSequence} = live.current;
    if (!prediction || prediction.sequence !== currentSequence || !sameWritingAidRequest(current, prediction.snapshot) ||
        !sameWritingAidRequest(current, proposal.snapshot)) return false;
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
    const {snapshot: current, result: prediction, sequence: currentSequence} = live.current;
    // Empty while a prediction is pending is not a hide. An empty report for
    // an available current proposal means that surface really is hidden.
    if (!visible.length && prediction && prediction.sequence === currentSequence &&
        sameWritingAidRequest(current, prediction.snapshot) && proposalsFor(prediction.suggestions, surface).length) {
      exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surface);
    }
    displayed.current[surface] = visible;
    if (surface === 'edit') return;
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
    const model = memory.current.state;
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
    if (live.current.snapshot.mode === 'off') return;
    const state = memory.current.state;
    const current = isCurrent(proposal);
    const accepted = pending.current;
    if (signal === 'undo' || signal === 'kept') {
      if (!accepted || accepted.scopeKey !== live.current.scopeKey || !sameProposal(accepted.proposal, proposal)) return;
      if (signal === 'kept' && accepted.kept) return;
      window.clearTimeout(accepted.timer);
      if (signal === 'undo') pending.current = null;
      else accepted.kept = true;
    } else if (!current) return;
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
      if (pending.current) window.clearTimeout(pending.current.timer);
      const {start, end, insert} = proposal, text = proposal.snapshot.cursor.text;
      const expected = text.slice(0, start) + insert + text.slice(end);
      const pendingScope = live.current.scopeKey;
      const timer = window.setTimeout(() => {
        const held = pending.current, latest = live.current;
        if (!held || held.timer !== timer || held.scopeKey !== latest.scopeKey) return;
        const inserted = held.proposal.insert.trimEnd();
        if (inserted && latest.snapshot.mode !== 'off' && document.visibilityState !== 'hidden' && !latest.snapshot.readOnly && !latest.snapshot.composing &&
            latest.snapshot.cursor.text.slice(held.proposal.start, held.proposal.start + inserted.length) === inserted &&
            memory.current.state.enabled) {
          updateWritingAidModel(memory.current.state.model, 'kept', writingAidFeatures(held.proposal));
          held.kept = true;
          save();
        }
      }, 3000);
      pending.current = {proposal, expected, scopeKey: pendingScope, timer, kept: false};
      exposures.current = [];
      displayed.current = freshLists();
    } else if (signal === 'dismiss') {
      exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surfaceOf(proposal));
    }
  }, [isCurrent, save]);

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
      exposures.current = [];
      displayed.current = freshLists();
      if (pending.current) window.clearTimeout(pending.current.timer);
      pending.current = null;
      return;
    }
    if (snapshot.readOnly || snapshot.composing || document.visibilityState === 'hidden') {
      exposures.current = [];
      displayed.current = freshLists();
      return;
    }
    const held = pending.current;
    if (held && snapshot.cursor.text !== old.cursor.text && snapshot.cursor.text !== held.expected) {
      const inserted = held.proposal.insert.trimEnd();
      if (inserted && snapshot.cursor.text.slice(held.proposal.start, held.proposal.start + inserted.length) !== inserted) {
        window.clearTimeout(held.timer);
        if (memory.current.state.enabled) {
          updateWritingAidModel(memory.current.state.model, 'partial-edit', writingAidFeatures(held.proposal));
          save();
        }
        pending.current = null;
      }
    }
    if (!direct) {
      if (snapshot.cursor.text !== old.cursor.text) exposures.current = [];
      return;
    }
    const model = memory.current.state;
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
  }, [snapshot, save]);

  useEffect(() => () => {if (pending.current) window.clearTimeout(pending.current.timer);}, []);

  useEffect(() => {
    if (mode === 'off' || !words && !replace && !correction && !ghost) return;
    let cancelled = false;
    let frame: number | undefined;
    void import('./engine').then(({predictWritingAidPool, selectWritingAidPool}) => {
      if (cancelled || !canSuggestWritingAid(snapshot)) return;
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          const model = memory.current.state.enabled ? memory.current.state.model : undefined;
          const pool = predictWritingAidPool(snapshot, model);
          const suggestions = selectWritingAidPool(pool, model, cycle.current.excluded);
          setResult({snapshot, sequence, pool, suggestions});
        } catch {
          setResult({snapshot, sequence, suggestions: NO_WRITING_AID, pool: {words: [], edit: [], ghost: []}});
        }
      });
    }).catch(() => {/* A failed asset load leaves ordinary editing and math keys usable. */});
    return () => {cancelled = true; if (frame !== undefined) window.cancelAnimationFrame(frame);};
  }, [snapshot, sequence, mode, words, replace, correction, ghost]);

  const current = result && result.sequence === sequence && sameWritingAidRequest(snapshot, result.snapshot) ? result : undefined;
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
