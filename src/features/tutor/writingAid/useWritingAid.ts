import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, canSuggestWritingAid, sameWritingAidRequest, writingAidProposalKey,
  type WritingAidProposal, type WritingAidRefreshSurface, type WritingAidRequest, type WritingAidSuggestions,
} from './policy';
import {recordWritingAidVocabulary, recordWritingAutoAcceptance, revokeWritingAutoTrust, updateWritingAidModel,
  writingAidFeatures, type WritingAidFeedback, type WritingAutoTrust} from './learning';
import {revokeStoredWritingAutoTrust, saveWritingAidModel, useWritingAidPersonalization} from './personalization';
import type {WritingAidPool} from './engine';
import {normalizeTutorWritingContext, tutorWritingContextFingerprint} from './tutorContext';
import {writingAutoRuleIdForPair, type WritingAutoCorrection} from './autoCorrect';
import type {TutorHintsMode} from './preferences';
import type {TutorWritingOptions} from './tutorContext';

type Flags = Readonly<Record<WritingAidRefreshSurface, boolean>>;
type Lists = Record<WritingAidRefreshSurface, readonly WritingAidProposal[]>;
type Exclusions = Record<WritingAidRefreshSurface, Set<string>>;
interface Cycle {
  snapshot: WritingAidRequest;
  tutorHints: TutorHintsMode;
  excluded: Exclusions;
  attempted: Record<WritingAidRefreshSurface, boolean>;
}
interface LearningScope {scopeKey: string; generation: string; enabled: boolean}
interface Prediction {
  snapshot: WritingAidRequest;
  sequence: number;
  tutorHints: TutorHintsMode;
  learningScope: LearningScope;
  suggestions: WritingAidSuggestions;
  pool: WritingAidPool;
}
interface Exposure {proposal: WritingAidProposal; key: string; seenAt: number}
interface PendingAcceptance {proposal: WritingAidProposal; expected: string; learningScope: LearningScope; timer?: number; kept: boolean}
interface PendingAutomatic {result: WritingAutoCorrection; learningScope: LearningScope; timer: number; kept: boolean}
interface TrackedCorrection {ruleId: string; start: number; text: string; expected?: string}

export interface WritingAidView extends WritingAidSuggestions {
  /** Indicate actual visibility; undisplayed candidates are never treated as rejections. */
  readonly shown: (surface: WritingAidRefreshSurface, displayed: readonly WritingAidProposal[]) => void;
  readonly refresh: (surface: WritingAidRefreshSurface, displayed: readonly WritingAidProposal[]) => void;
  readonly feedback: (signal: WritingAidFeedback, proposal: WritingAidProposal) => void;
  readonly autoFeedback: (signal: 'auto-applied' | 'auto-undo' | 'auto-kept', result: WritingAutoCorrection) => void;
  readonly autoTrust: WritingAutoTrust;
  /** Retire in-memory occurrence tracking when a draft is externally replaced. */
  readonly discardTrackedCorrections: () => void;
  readonly isCurrent: (proposal: WritingAidProposal) => boolean;
  readonly canRefresh: Flags;
  readonly exhausted: Flags;
}

const noFlags: Flags = Object.freeze({words: false, edit: false, ghost: false});
const freshLists = (): Lists => ({words: [], edit: [], ghost: []});
const freshCycle = (snapshot: WritingAidRequest, tutorHints: TutorHintsMode): Cycle => ({snapshot, tutorHints,
  excluded: {words: new Set(), edit: new Set(), ghost: new Set()},
  attempted: {words: false, edit: false, ghost: false},
});
function advanceCycle(previous: Cycle, snapshot: WritingAidRequest, tutorHints: TutorHintsMode): Cycle {
  const next = freshCycle(snapshot, tutorHints), old = previous.snapshot;
  // A declined replacement remains declined for that occurrence while its
  // preceding text and source remain intact. Deletion creates a fresh decision.
  if (old.target.scopeKey !== snapshot.target.scopeKey || old.target.mountId !== snapshot.target.mountId ||
      old.mode !== snapshot.mode || previous.tutorHints !== tutorHints) return next;
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
export function useWritingAid(request: WritingAidRequest, tutorHints: TutorHintsMode = 'wording'): WritingAidView {
  const {cursor, anchor, target, mode, composing, readOnly, tutorContext} = request;
  const {scopeKey, mountId, editorRevision, selectionRevision, modeRevision} = target;
  const {words, replace, correction, ghost} = request.surfaces ?? ALL_WRITING_AID_SURFACES;
  const contextFingerprint = tutorWritingContextFingerprint(tutorContext);
  const normalizedContext = useMemo(() => tutorHints === 'off' ? null : normalizeTutorWritingContext(tutorContext),
    [contextFingerprint, tutorHints]);
  const options = useMemo<TutorWritingOptions>(() => ({terms: tutorHints === 'all', wording: tutorHints !== 'off',
    symbols: tutorHints === 'all', strategy: 'contextual'}), [tutorHints]);
  const snapshot = useMemo<WritingAidRequest>(() => ({
    cursor, anchor, mode, composing, readOnly,
    target: {scopeKey, mountId, editorRevision, selectionRevision, modeRevision},
    surfaces: {words, replace, correction, ghost},
    ...(normalizedContext ? {tutorContext: normalizedContext} : {}),
  }), [cursor, anchor, mode, composing, readOnly, scopeKey, mountId, editorRevision, selectionRevision, modeRevision,
    words, replace, correction, ghost, normalizedContext]);
  const personalization = useWritingAidPersonalization();
  const {scopeKey: personalizationScope, generation, enabled} = personalization;
  const learningScope = useMemo<LearningScope>(() => ({scopeKey: personalizationScope, generation, enabled}),
    [personalizationScope, generation, enabled]);
  const cycle = useRef<Cycle>(freshCycle(snapshot, tutorHints));
  if (!sameWritingAidRequest(cycle.current.snapshot, snapshot) || cycle.current.tutorHints !== tutorHints) {
    cycle.current = advanceCycle(cycle.current, snapshot, tutorHints);
  }
  const [sequence, setSequence] = useState(0);
  const [result, setResult] = useState<Prediction>();
  const current = result && result.sequence === sequence && result.tutorHints === tutorHints &&
    result.learningScope === learningScope && sameWritingAidRequest(snapshot, result.snapshot) ? result : undefined;
  const live = useRef({snapshot, current, personalization, learningScope});
  live.current = {snapshot, current, personalization, learningScope};
  const displayed = useRef<Lists>(freshLists());
  const exposures = useRef<Exposure[]>([]);
  const pending = useRef<PendingAcceptance | null>(null);
  const automatic = useRef<PendingAutomatic | null>(null);
  const tracked = useRef<TrackedCorrection[]>([]);
  const trackedBaseline = useRef(snapshot.cursor.text);
  const previous = useRef<WritingAidRequest | null>(null);

  const discardTrackedCorrections = useCallback(() => {
    tracked.current = [];
    trackedBaseline.current = live.current.snapshot.cursor.text;
    if (pending.current) window.clearTimeout(pending.current.timer);
    if (automatic.current) window.clearTimeout(automatic.current.timer);
    pending.current = null;
    automatic.current = null;
    exposures.current = [];
    displayed.current = freshLists();
  }, []);

  useLayoutEffect(() => {
    previous.current = null;
    return discardTrackedCorrections;
  }, [learningScope, discardTrackedCorrections]);

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
    const {enabled, model, scopeKey, generation} = live.current.personalization;
    for (const proposal of visible) {
      cycle.current.excluded[surface].add(writingAidProposalKey(proposal));
      if (enabled) updateWritingAidModel(model, 'refresh', writingAidFeatures(proposal));
      const rule = proposal.kind === 'correction' && writingAutoRuleIdForPair(proposal.before, proposal.insert);
      if (rule && model.autoTrust[rule]) {
        if (enabled) revokeWritingAutoTrust(model, rule);
        else revokeStoredWritingAutoTrust(scopeKey, generation, rule);
      }
    }
    cycle.current.attempted[surface] = true;
    displayed.current[surface] = [];
    // Explicitly rejected proposals do not get additional passive feedback.
    exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surface);
    if (enabled) save();
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
    const rule = proposal.kind === 'correction' && writingAutoRuleIdForPair(proposal.before, proposal.insert);
    if (rule && (signal === 'undo' || signal === 'dismiss' || signal === 'partial-edit') && state.model.autoTrust[rule]) {
      if (state.enabled) revokeWritingAutoTrust(state.model, rule);
      else revokeStoredWritingAutoTrust(state.scopeKey, state.generation, rule);
    }
    if (state.enabled) {
      updateWritingAidModel(state.model, signal, writingAidFeatures(proposal));
      if (rule && signal === 'accept') recordWritingAutoAcceptance(state.model, rule);
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
      if (state.enabled && rule) {
        tracked.current.push({ruleId: rule, start, text: insert, expected});
        if (tracked.current.length > 512) tracked.current.shift();
      }
      const timer = state.enabled ? window.setTimeout(() => {
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
      }, 3000) : undefined;
      pending.current = {proposal, expected, learningScope, timer, kept: false};
      exposures.current = [];
      displayed.current = freshLists();
    } else if (signal === 'dismiss') {
      exposures.current = exposures.current.filter(item => surfaceOf(item.proposal) !== surfaceOf(proposal));
    }
  }, [isCurrent, save]);

  const autoFeedback = useCallback((signal: 'auto-applied' | 'auto-undo' | 'auto-kept', result: WritingAutoCorrection) => {
    const {snapshot, personalization: state, learningScope} = live.current;
    if (!state.enabled) return;
    if (signal === 'auto-applied') {
      if (snapshot.mode === 'off' || snapshot.mode !== result.mode ||
          snapshot.target.scopeKey !== result.target.scopeKey || snapshot.target.mountId !== result.target.mountId ||
          snapshot.cursor.text !== result.typed.text.slice(0, -1)) return;
      if (automatic.current) window.clearTimeout(automatic.current.timer);
      tracked.current.push({ruleId: result.ruleId, start: result.start, text: result.replacement, expected: result.corrected.text});
      if (tracked.current.length > 512) tracked.current.shift();
      const timer = window.setTimeout(() => {
        const held = automatic.current, current = live.current;
        if (!held || held.timer !== timer || held.learningScope !== current.learningScope || held.kept ||
            document.visibilityState === 'hidden' || current.snapshot.readOnly || current.snapshot.composing ||
            current.snapshot.mode === 'off' || current.snapshot.target.scopeKey !== held.result.target.scopeKey ||
            current.snapshot.target.mountId !== held.result.target.mountId ||
            current.snapshot.cursor.text.slice(held.result.start, held.result.start + held.result.replacement.length) !== held.result.replacement) return;
        held.kept = true;
        updateWritingAidModel(current.personalization.model, 'auto-kept', {kind: 'correction', candidate: held.result.replacement,
          prefix: held.result.source, previous: '', mode: held.result.mode});
        save();
      }, 3000);
      automatic.current = {result, learningScope, timer, kept: false};
      return;
    }
    const held = automatic.current;
    if (!held || held.learningScope !== learningScope || held.result !== result || snapshot.mode === 'off' ||
        snapshot.target.scopeKey !== result.target.scopeKey || snapshot.target.mountId !== result.target.mountId ||
        signal === 'auto-kept' && held.kept) return;
    window.clearTimeout(held.timer);
    if (signal === 'auto-kept') held.kept = true;
    else automatic.current = null;
    if (signal === 'auto-undo') revokeWritingAutoTrust(state.model, result.ruleId);
    updateWritingAidModel(state.model, signal, {kind: 'correction', candidate: result.replacement,
      prefix: result.source, previous: '', mode: result.mode});
    save();
  }, [save]);

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
      discardTrackedCorrections();
      trackedBaseline.current = snapshot.cursor.text;
      return;
    }
    if (snapshot.readOnly || snapshot.composing || document.visibilityState === 'hidden') {
      exposures.current = [];
      displayed.current = freshLists();
      return;
    }
    const {enabled, model} = live.current.personalization;
    const currentText = snapshot.cursor.text, previousText = trackedBaseline.current;
    if (!currentText) tracked.current = [];
    else if (tracked.current.length) {
      let revoked = false;
      const remaining: TrackedCorrection[] = [];
      for (const item of tracked.current) {
        const from = item.expected ?? previousText;
        if (from.slice(item.start, item.start + item.text.length) !== item.text) continue;
        item.expected = undefined;
        if (from === currentText) {remaining.push(item); continue;}
        let start = 0, suffix = 0;
        while (start < from.length && start < currentText.length && from[start] === currentText[start]) start++;
        while (suffix < from.length - start && suffix < currentText.length - start &&
            from[from.length - suffix - 1] === currentText[currentText.length - suffix - 1]) suffix++;
        const oldEnd = from.length - suffix, newEnd = currentText.length - suffix;
        const itemEnd = item.start + item.text.length, inserted = currentText.slice(start, newEnd);
        const overlap = start < itemEnd && oldEnd > item.start || start === oldEnd && (
          start > item.start && start < itemEnd || start === item.start && /[\p{L}\p{M}\p{N}_]$/u.test(inserted) ||
          start === itemEnd && /^[\p{L}\p{M}\p{N}_]/u.test(inserted));
        if (overlap) {
          if (model.autoTrust[item.ruleId]) {
            revokeWritingAutoTrust(model, item.ruleId);
            revoked = true;
          }
          continue;
        }
        if (oldEnd <= item.start) item.start += currentText.length - from.length;
        if (currentText.slice(item.start, item.start + item.text.length) === item.text) remaining.push(item);
      }
      tracked.current = remaining;
      if (revoked) save();
    }
    trackedBaseline.current = currentText;
    const held = pending.current;
    const auto = automatic.current;
    if (auto && snapshot.cursor.text !== old.cursor.text && snapshot.cursor.text !== auto.result.corrected.text &&
        snapshot.cursor.text.slice(auto.result.start, auto.result.start + auto.result.replacement.length) !== auto.result.replacement) {
      window.clearTimeout(auto.timer);
      const editedOccurrence = Boolean(snapshot.cursor.text) &&
        snapshot.cursor.text.startsWith(auto.result.corrected.text.slice(0, auto.result.start));
      if (editedOccurrence && enabled) {
        revokeWritingAutoTrust(model, auto.result.ruleId);
        updateWritingAidModel(model, 'auto-undo', {kind: 'correction', candidate: auto.result.replacement,
          prefix: auto.result.source, previous: '', mode: auto.result.mode});
        save();
      }
      automatic.current = null;
    }
    if (held && snapshot.cursor.text !== old.cursor.text && snapshot.cursor.text !== held.expected) {
      const inserted = held.proposal.insert.trimEnd();
      if (inserted && snapshot.cursor.text.slice(held.proposal.start, held.proposal.start + inserted.length) !== inserted) {
        window.clearTimeout(held.timer);
        const editedOccurrence = Boolean(snapshot.cursor.text) &&
          snapshot.cursor.text.startsWith(held.expected.slice(0, held.proposal.start));
        if (editedOccurrence && enabled) {
          updateWritingAidModel(model, 'partial-edit', writingAidFeatures(held.proposal));
          const rule = held.proposal.kind === 'correction' && writingAutoRuleIdForPair(held.proposal.before, held.proposal.insert);
          if (rule) revokeWritingAutoTrust(model, rule);
          save();
        }
        pending.current = null;
      }
    }
    if (!direct) {
      if (snapshot.cursor.text !== old.cursor.text) exposures.current = [];
      return;
    }
    if (!enabled) return;
    let changed = false;
    const authored = snapshot.anchor!;
    const newlyCompleted = authored.text.slice(authored.start);
    for (const match of newlyCompleted.matchAll(/[\p{L}\p{M}]{4,32}(?=[^\p{L}\p{M}])/gu)) {
      const end = authored.start + match.index + match[0].length;
      if (end >= old.cursor.text.length && end < snapshot.cursor.text.length) {
        recordWritingAidVocabulary(model, match[0]);
        updateWritingAidModel(model, 'personal-use', {
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
          updateWritingAidModel(model, matches ? 'continued-match' : 'divergent', writingAidFeatures(proposal));
          changed = true;
        }
        continue;
      }
      const completed = tail.match(/^([\p{L}\p{M}]+)(?=[^\p{L}\p{M}])/u);
      if (!completed) {remaining.push(item); continue;}
      if (Date.now() - item.seenAt >= 300) {
        updateWritingAidModel(model,
          completed[1].toLocaleLowerCase() === proposal.label.toLocaleLowerCase() ? 'continued-match' : 'divergent',
          writingAidFeatures(proposal));
        changed = true;
      }
    }
    exposures.current = remaining;
    if (changed) save();
  }, [snapshot, learningScope, save, discardTrackedCorrections]);

  useEffect(() => {
    if (mode === 'off' || !words && !replace && !correction && !ghost) return;
    let cancelled = false;
    let frame: number | undefined;
    void import('./engine').then(({predictWritingAidPool, selectWritingAidPool}) => {
      if (cancelled || !canSuggestWritingAid(snapshot)) return;
      frame = window.requestAnimationFrame(() => {
        if (cancelled || learningScope !== live.current.learningScope) return;
        try {
          const state = live.current.personalization;
          const model = state.enabled ? state.model : undefined;
          const pool = predictWritingAidPool(snapshot, model, options);
          const suggestions = selectWritingAidPool(pool, model, cycle.current.excluded, Date.now(), options);
          setResult({snapshot, sequence, tutorHints, learningScope, pool, suggestions});
        } catch {
          setResult({snapshot, sequence, tutorHints, learningScope, suggestions: NO_WRITING_AID, pool: {words: [], edit: [], ghost: []}});
        }
      });
    }).catch(() => {/* A failed asset load leaves ordinary editing and math keys usable. */});
    return () => {cancelled = true; if (frame !== undefined) window.cancelAnimationFrame(frame);};
  }, [snapshot, sequence, learningScope, mode, words, replace, correction, ghost, tutorHints, options]);

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
  return {...suggestions, shown, refresh, feedback, autoFeedback,
    autoTrust: personalization.enabled ? {...personalization.model.autoTrust} : {},
    discardTrackedCorrections, isCurrent, canRefresh, exhausted};
}
