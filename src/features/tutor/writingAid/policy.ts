import {padEdit, type PadEdit} from '../../pad/padEdit';
import {sameEditTarget} from '../input/recognitionPolicy';
import type {EditTarget} from '../input/types';

export type WritingAidMode = 'balanced' | 'fast' | 'strict' | 'off';
export type WritingAidSurface = 'words' | 'replace' | 'correction' | 'ghost';
export type WritingAidSurfaces = Readonly<Record<WritingAidSurface, boolean>>;

export const ALL_WRITING_AID_SURFACES: WritingAidSurfaces = Object.freeze({
  words: true, replace: true, correction: true, ghost: true,
});
export const WRITING_AID_LIMIT = 2000;

export interface WritingAidAnchor {
  /** An exact snapshot with newly typed, uninterrupted learner input from start onward. */
  readonly text: string;
  readonly start: number;
  /** The one intermediate word tap allowed before the lexical budget is exhausted. */
  readonly continuation?: string;
}

export interface WritingAidRequest {
  readonly cursor: PadEdit;
  readonly anchor: WritingAidAnchor | null;
  readonly target: EditTarget;
  readonly mode: WritingAidMode;
  readonly surfaces?: WritingAidSurfaces;
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
  readonly source?: 'decoder';
}

export interface WritingAidSuggestions {
  readonly words: readonly WritingAidProposal[];
  readonly ghost: WritingAidProposal | null;
  readonly edit: WritingAidProposal | null;
}

export type WritingAidRefreshSurface = 'words' | 'edit' | 'ghost';

/** The identity is scoped to a single request by the caller. */
export function writingAidProposalKey(proposal: WritingAidProposal): string {
  return JSON.stringify([proposal.kind, proposal.start, proposal.end, proposal.before, proposal.insert]);
}

const emptyWords: readonly WritingAidProposal[] = Object.freeze([]);
export const NO_WRITING_AID: WritingAidSuggestions = Object.freeze({words: emptyWords, ghost: null, edit: null});

const atEnd = (edit: PadEdit) => edit.start === edit.end && edit.end === edit.text.length;
const anchorText = (anchor: WritingAidAnchor) => anchor.continuation ?? anchor.text;

/** Call only on direct native/custom-key typing. Revisions for other edit sources clear the anchor. */
export function advanceWritingAidAnchor(
  before: PadEdit, after: PadEdit, previous: WritingAidAnchor | null,
): WritingAidAnchor | null {
  if (!atEnd(before) || !atEnd(after) || after.text.length <= before.text.length ||
      after.text.length > WRITING_AID_LIMIT || !after.text.startsWith(before.text)) return null;
  if (previous?.continuation && !/[\p{L}\p{N}]/u.test(after.text.slice(before.text.length))) return null;
  const continuing = previous && !previous.continuation && previous.text === before.text;
  return {text: after.text, start: continuing ? previous.start : before.text.length};
}

export function canSuggestWritingAid(request: WritingAidRequest): boolean {
  const {cursor, anchor, mode, composing, readOnly} = request;
  return Boolean(mode !== 'off' && !composing && !readOnly && atEnd(cursor) &&
    cursor.text.length <= WRITING_AID_LIMIT && anchor && Number.isInteger(anchor.start) &&
    anchor.start >= 0 && anchor.start < anchor.text.length && anchorText(anchor) === cursor.text &&
    cursor.text.startsWith(anchor.text));
}

export function sameWritingAidRequest(left: WritingAidRequest, right: WritingAidRequest): boolean {
  const a = left.cursor, b = right.cursor;
  const x = left.anchor, y = right.anchor;
  const l = left.surfaces ?? ALL_WRITING_AID_SURFACES, r = right.surfaces ?? ALL_WRITING_AID_SURFACES;
  return a.text === b.text && a.start === b.start && a.end === b.end && a.direction === b.direction &&
    x?.text === y?.text && x?.start === y?.start && x?.continuation === y?.continuation &&
    left.mode === right.mode && left.readOnly === right.readOnly && left.composing === right.composing &&
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
  return padEdit(cursor.text.slice(0, start) + insert + cursor.text.slice(end));
}

/** A tap can spend the second word slot, but it cannot add learner-written evidence. */
export function continueWritingAidAnchor(
  anchor: WritingAidAnchor | null, proposal: WritingAidProposal, result: PadEdit,
): WritingAidAnchor | null {
  if (!anchor || anchor.continuation || proposal.kind !== 'word' ||
      proposal.snapshot.anchor?.text !== anchor.text || proposal.snapshot.anchor.start !== anchor.start ||
      !atEnd(result) || !result.text.startsWith(anchor.text) || result.text === anchor.text) return null;
  const expected = applyWritingAidProposal(proposal.snapshot, proposal);
  return expected?.text === result.text ? {...anchor, continuation: result.text} : null;
}
