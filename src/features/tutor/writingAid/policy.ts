import {applyMenuEdit, learnerAuthored, type OriginRange, type MenuEdit} from './menuEdit';
import {type PadEdit} from '../../pad/padEdit';
import {sameEditTarget} from '../input/recognitionPolicy';
import {wordAtCaret} from '../input/completionPolicy';
import type {TypeaheadArm} from './replayArm';
import {tutorHint} from './answerAids';
import {tutorMathContext} from '../input/symbolEdit';
import {hasOpenLiteral, insertionEligible} from './eligibility';
import type {AidRole, TutorAnswerAid} from '../../../../supabase/functions/_shared/tutor-answer-aids';
import type {EditTarget} from '../input/types';

export type WritingAidMode = 'balanced' | 'fast' | 'strict' | 'off';
export type WritingAidSurface = 'words' | 'replace' | 'correction' | 'ghost';
export type WritingAidSurfaces = Readonly<Record<WritingAidSurface, boolean>>;

export const ALL_WRITING_AID_SURFACES: WritingAidSurfaces = Object.freeze({
  words: true, replace: true, correction: true, ghost: true,
});
export const WRITING_AID_LIMIT = 2000;

export interface WritingAidAnchor {
  /** The learner-authored span in this snapshot begins at start and ends at the active caret. */
  readonly text: string;
  readonly start: number;
  readonly caret?: number;
  /** The one intermediate word tap allowed before the lexical budget is exhausted. */
  readonly continuation?: string;
}

export interface WritingAidRequest {
  readonly cursor: PadEdit;
  readonly anchor: WritingAidAnchor | null;
  readonly target: EditTarget;
  readonly mode: WritingAidMode;
  readonly surfaces?: WritingAidSurfaces;
  readonly contextKey?: string;
  readonly arm?: TypeaheadArm;
  readonly replayDiagnostics?: boolean;
  readonly tracePool?: boolean;
  /** Differential test oracle for the eligible pool. */
  readonly exhaustivePool?: boolean;
  readonly middleEdits?: boolean;
  readonly acceptedSpans?: readonly OriginRange[];
  readonly aid?: TutorAnswerAid;
  readonly mastery?: number;
  readonly subject?: string;
  readonly step?: string;
  readonly question?: readonly (string | undefined)[];
  readonly composing: boolean;
  readonly readOnly: boolean;
}

export interface WritingAidProposal {
  readonly kind: 'word' | 'ghost' | 'replace' | 'correction';
  readonly start: number;
  readonly end: number;
  readonly before: string;
  readonly insert: string;
  readonly label: string;
  readonly snapshot: WritingAidRequest;
  /** N221: offered by the n-gram and touch decoder rather than the existing engine. */
  readonly source?: 'decoder' | 'bank' | 'personal' | 'symbol' | 'neural' | 'notation' | 'equation';
  readonly caret?: number;
  readonly menuPosition?: number;
  readonly score?: number;
  readonly tutorAdjustment?: number;
  readonly role?: AidRole;
  readonly logic?: boolean;
}

export interface WritingAidSuggestions {
  readonly words: readonly WritingAidProposal[];
  readonly ghost: WritingAidProposal | null;
  readonly edit: WritingAidProposal | null;
}

export type WritingAidRefreshSurface = 'words' | 'edit' | 'ghost';

/** The identity is scoped to a single request by the caller. */
export function proposalEdit(proposal: WritingAidProposal): MenuEdit {
  const {start, end, insert} = proposal;
  return {start, end, insert, caret: proposal.caret ?? proposal.snapshot.cursor.end + insert.length - (end - start)};
}

export function writingAidProposalKey(proposal: WritingAidProposal): string {
  return JSON.stringify([proposal.kind, proposal.start, proposal.end, proposal.before, proposal.insert]);
}

const emptyWords: readonly WritingAidProposal[] = Object.freeze([]);
export const NO_WRITING_AID: WritingAidSuggestions = Object.freeze({words: emptyWords, ghost: null, edit: null});

const atEnd = (edit: PadEdit) => edit.start === edit.end && edit.end === edit.text.length;
const anchorText = (anchor: WritingAidAnchor) => anchor.continuation ?? anchor.text;

/** Call only on direct native/custom-key typing. Revisions for other edit sources clear the anchor. */
export function advanceWritingAidAnchor(
  before: PadEdit, after: PadEdit, previous: WritingAidAnchor | null, middleEdits = false,
  acceptedSpans?: readonly OriginRange[],
): WritingAidAnchor | null {
  if (middleEdits && before.start === before.end && after.start === after.end && !atEnd(after) &&
      after.end > before.end && after.text.length <= WRITING_AID_LIMIT &&
      before.text.slice(0, before.end) === after.text.slice(0, before.end) &&
      before.text.slice(before.end) === after.text.slice(after.end)) {
    if (previous?.caret === before.end && previous.text === before.text && !previous.continuation) {
      return {text: after.text, start: previous.start, caret: after.end};
    }
    // A learner can return to their own partial word after moving the caret.
    const word = wordAtCaret(after);
    const start = after.end - (word?.length ?? 0);
    const ownStem = start < before.end && acceptedSpans !== undefined && learnerAuthored(acceptedSpans, start, before.end);
    return {text: after.text, start: ownStem ? start : before.end, caret: after.end};
  }
  if (!atEnd(before) || !atEnd(after) || after.text.length <= before.text.length ||
      after.text.length > WRITING_AID_LIMIT || !after.text.startsWith(before.text)) return null;
  if (previous?.continuation && !/[\p{L}\p{N}]/u.test(after.text.slice(before.text.length))) return null;
  const continuing = previous && !previous.continuation && previous.text === before.text;
  return {text: after.text, start: continuing ? previous.start : before.text.length};
}

export function canSuggestWritingAid(request: WritingAidRequest): boolean {
  const {cursor, anchor, mode, composing, readOnly} = request;
  return Boolean(mode !== 'off' && !composing &&  !readOnly && (atEnd(cursor) || request.middleEdits && cursor.start === cursor.end && anchor?.caret === cursor.end) &&
    cursor.text.length <= WRITING_AID_LIMIT && anchor && Number.isInteger(anchor.start) &&
    anchor.start >= 0 && anchor.start < anchor.text.length && anchorText(anchor) === cursor.text &&
    cursor.text.startsWith(anchor.text));
}

export function eligibleNeuralContext(request: WritingAidRequest): boolean {
  return canSuggestWritingAid(request) && !request.anchor?.continuation &&
    tutorMathContext(request.cursor) === 'prose' && !hasOpenLiteral(request.cursor.text);
}

export function eligibleGhostContext(request: WritingAidRequest): boolean {
  return eligibleNeuralContext(request) && request.mode !== 'strict' &&
    (request.surfaces ?? ALL_WRITING_AID_SURFACES).ghost && request.cursor.end === request.cursor.text.length;
}

export function sameWritingAidRequest(left: WritingAidRequest, right: WritingAidRequest): boolean {
  const a = left.cursor, b = right.cursor;
  const x = left.anchor, y = right.anchor;
  const l = left.surfaces ?? ALL_WRITING_AID_SURFACES, r = right.surfaces ?? ALL_WRITING_AID_SURFACES;
  return a.text === b.text && a.start === b.start && a.end === b.end && a.direction === b.direction &&
    x?.caret === y?.caret && left.middleEdits === right.middleEdits && x?.text === y?.text && x?.start === y?.start && x?.continuation === y?.continuation &&
    left.arm === right.arm && left.contextKey === right.contextKey && left.mode === right.mode && left.readOnly === right.readOnly && left.composing === right.composing &&
    l.words === r.words && l.replace === r.replace && l.correction === r.correction && l.ghost === r.ghost &&
    sameEditTarget(left.target, right.target);
}

export function writingAidProposal(
  snapshot: WritingAidRequest, kind: WritingAidProposal['kind'],
  start: number, end: number, insert: string, label = insert,
): WritingAidProposal {
  return {kind, start, end, before: snapshot.cursor.text.slice(start, end), insert, label, snapshot};
}

/** Only the displayed revision can be committed. The trailing caret follows the changed draft. */
export function applyWritingAidProposal(request: WritingAidRequest, proposal: WritingAidProposal): PadEdit | null {
  const {cursor, anchor, surfaces = ALL_WRITING_AID_SURFACES} = request;
  const {kind, start, end, before, insert} = proposal;
  if (!canSuggestWritingAid(request) || !anchor || !surfaces[kind === 'word' ? 'words' : kind] ||
      !sameWritingAidRequest(request, proposal.snapshot) ||
      !Number.isInteger(start) || !Number.isInteger(end) ||
      start < anchor.start || start > end || end > cursor.end ||
      cursor.text.slice(start, end) !== before || !insert || insert === before ||
      cursor.text.length - before.length + insert.length > WRITING_AID_LIMIT) return null;
  if (!proposalEligible(request, proposal)) return null;
  return applyMenuEdit(cursor.text, proposalEdit(proposal));
}

/** Direct learner evidence comes from the anchor, never earlier accepted output. */
export function proposalEligible(request: WritingAidRequest, proposal: WritingAidProposal): boolean {
  const {anchor, cursor} = request;
  const {start, end, insert} = proposal;
  const from = Math.max(anchor?.start ?? start, start), to = Math.min(end, anchor?.caret ?? anchor?.text.length ?? 0, cursor.end);
  const authored = anchor && learnerAuthored(request.acceptedSpans, from, to) ? anchor.text.slice(from, to) : '';
  const ghostStem = proposal.kind === 'ghost' && anchor && !anchor.continuation
    ? /[\p{L}\p{M}]+$/u.exec(anchor.text.slice(anchor.start, start))?.[0] : undefined;
  const prefix = authored || (ghostStem && learnerAuthored(request.acceptedSpans, start - ghostStem.length, start) ? ghostStem : '');
  const prior = cursor.text.slice(0, start);
  const context = {aid: request.aid, mastery: request.mastery, subject: request.subject,
    step: request.step, mode: 'prose' as const, before: prior, prefix};
  const candidateText = ghostStem && /^[\p{L}\p{M}]/u.test(insert) ? ghostStem + insert : insert;
  const hints = request.aid?.ranking ? [tutorHint(context, candidateText.trim()).role] : [];
  if (request.aid?.ranking && /\S+\s+\S/u.test(candidateText)) {
    for (const match of candidateText.matchAll(/[\p{L}\p{M}]+(?:['’\p{Pd}][\p{L}\p{M}]+)*/gu)) {
      hints.push(tutorHint({...context, before: prior + candidateText.slice(0, match.index),
        prefix: match.index === 0 ? prefix : ''}, match[0]).role);
    }
  }
  const role = hints.includes('goal') ? 'goal' : hints.includes('alternative') ? 'alternative' : proposal.role;
  return insertionEligible({text: cursor.text, start, end, insert, mode: 'prose', aid: request.aid,
    authoredPrefix: prefix, role, tagged: proposal.logic, notation: proposal.source === 'symbol'});
}

/** A tap can spend the second word slot, but it cannot add learner-written evidence. */
export function continueWritingAidAnchor(
  anchor: WritingAidAnchor | null, proposal: WritingAidProposal, result: PadEdit,
): WritingAidAnchor | null {
  if (!anchor || anchor.continuation || proposal.kind !== 'word' || proposal.source === 'bank' && /\S\s+\S/u.test(proposal.insert) ||
      proposal.snapshot.anchor?.text !== anchor.text || proposal.snapshot.anchor.start !== anchor.start ||
      !atEnd(result) || !result.text.startsWith(anchor.text) || result.text === anchor.text) return null;
  const expected = applyWritingAidProposal(proposal.snapshot, proposal);
  return expected?.text === result.text ? {...anchor, continuation: result.text} : null;
}
