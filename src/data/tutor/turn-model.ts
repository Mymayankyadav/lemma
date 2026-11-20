/**
 * Pure P6 turn transitions. A caller must supply a current, owner-authorized head
 * and apply the returned changes together with its operation receipt. This module
 * is not a store, an authentication check, or a substitute for a transaction.
 */
export type TutorContextSelection = Readonly<{
  kind: 'path' | 'checkpoint' | 'session' | 'source' | 'card' | 'task'
  refId: string
  version: string
  excerpt: string
}>

export type TutorThreadHead = Readonly<{
  threadId: string
  lastSequence: number
  pendingTurnId: string | null
}>

export type TutorComposerDraft = Readonly<{
  question: string
  selectedContext: readonly TutorContextSelection[]
}>

type TutorQuestionSnapshot = Readonly<{
  question: string
  selectedContext: readonly TutorContextSelection[]
}>

type TurnIdentity = Readonly<{
  id: string
  threadId: string
  sequence: number
  version: number
  snapshot: TutorQuestionSnapshot
}>

export type TutorPendingTurn = TurnIdentity & Readonly<{ status: 'awaiting-tutor' }>
export type TutorCompletedTurn = TurnIdentity & Readonly<{
  status: 'completed'
  finalReply: TutorFinalReply
}>
export type TutorTurn = TutorPendingTurn | TutorCompletedTurn

export type TutorReplyProvenance =
  | Readonly<{ kind: 'manual-import'; label: 'Imported by you' }>
  | Readonly<{ kind: 'connector'; reportedHost: string | null; hostVerified: false }>

type TutorCitation = Readonly<Pick<TutorContextSelection, 'kind' | 'refId' | 'version'>>
type SuggestedActionIntent = Readonly<{
  intentId: string
  kind: 'card' | 'plan' | 'change'
  summary: string
}>
type SuggestedActionDraft = SuggestedActionIntent & Readonly<{
  sourceMessageId: string
  status: 'proposal-draft'
}>

export type TutorReplyDraft = Readonly<{
  turnId: string
  messageId: string
  body: string
  provenance: TutorReplyProvenance
  citations: readonly TutorCitation[]
  suggestions: readonly SuggestedActionIntent[]
}>

export type TutorFinalReply = Readonly<Omit<TutorReplyDraft, 'suggestions'> & {
  suggestions: readonly SuggestedActionDraft[]
}>

type SubmitResult =
  | { kind: 'submitted'; head: TutorThreadHead; turn: TutorPendingTurn }
  | { kind: 'turn-pending'; turnId: string }
  | { kind: 'empty-question' }

export function submitTutorTurn(
  head: TutorThreadHead, turnId: string, draft: TutorComposerDraft,
): SubmitResult {
  if (head.pendingTurnId !== null) return { kind: 'turn-pending', turnId: head.pendingTurnId }
  if (!draft.question.trim()) return { kind: 'empty-question' }

  const sequence = head.lastSequence + 1
  // Copy selected scalar fields only. Never retain a pointer into the editor's draft.
  const snapshot: TutorQuestionSnapshot = Object.freeze({
    question: draft.question,
    selectedContext: Object.freeze(draft.selectedContext.map(({ kind, refId, version, excerpt }) =>
      Object.freeze({ kind, refId, version, excerpt }))),
  })
  return {
    kind: 'submitted',
    head: Object.freeze({ ...head, lastSequence: sequence, pendingTurnId: turnId }),
    turn: Object.freeze({
      id: turnId, threadId: head.threadId, sequence, version: 1, status: 'awaiting-tutor', snapshot,
    }),
  }
}

/** Previews the exact pasted text. No instructions, citations or suggestions are inferred from it. */
export function previewManualTutorImport(turnId: string, messageId: string, body: string): TutorReplyDraft {
  return copyReplyDraft({
    turnId, messageId, body,
    provenance: { kind: 'manual-import', label: 'Imported by you' },
    citations: [], suggestions: [],
  })
}

function copyReplyDraft(draft: TutorReplyDraft): TutorReplyDraft {
  const { turnId, messageId, body, provenance, citations, suggestions } = draft
  return Object.freeze({
    turnId, messageId, body,
    provenance: provenance.kind === 'manual-import'
      ? Object.freeze({ kind: 'manual-import' as const, label: 'Imported by you' as const })
      : Object.freeze({ kind: 'connector' as const, reportedHost: provenance.reportedHost, hostVerified: false as const }),
    citations: Object.freeze(citations.map(({ kind, refId, version }) => Object.freeze({ kind, refId, version }))),
    suggestions: Object.freeze(suggestions.map(({ intentId, kind, summary }) =>
      Object.freeze({ intentId, kind, summary }))),
  })
}

type ReplyConflict =
  | 'turn-mismatch'
  | 'already-completed'
  | 'stale-turn'
  | 'empty-reply'
  | 'unselected-citation'

type ReplyResult =
  | { kind: 'completed'; head: TutorThreadHead; turn: TutorCompletedTurn }
  | { kind: ReplyConflict; recoverableDraft: TutorReplyDraft }

/**
 * The authenticated owner/claim check and operation-receipt lookup must happen
 * before this transition. Only confirmed final candidates belong here.
 */
export function finalizeTutorTurn(
  head: TutorThreadHead, turn: TutorTurn, expectedVersion: number, candidate: TutorReplyDraft,
): ReplyResult {
  const draft = copyReplyDraft(candidate)
  const retain = (kind: ReplyConflict): ReplyResult => ({ kind, recoverableDraft: draft })

  if (head.threadId !== turn.threadId || draft.turnId !== turn.id) return retain('turn-mismatch')
  if (turn.status === 'completed') return retain('already-completed')
  if (head.pendingTurnId !== turn.id || turn.version !== expectedVersion) return retain('stale-turn')
  if (!draft.body.trim()) return retain('empty-reply')
  if (draft.citations.some(citation => !turn.snapshot.selectedContext.some(selected =>
    selected.kind === citation.kind && selected.refId === citation.refId && selected.version === citation.version,
  ))) return retain('unselected-citation')

  const finalReply: TutorFinalReply = Object.freeze({
    ...draft,
    suggestions: Object.freeze(draft.suggestions.map(intent => Object.freeze({
      ...intent, sourceMessageId: draft.messageId, status: 'proposal-draft' as const,
    }))),
  })
  return {
    kind: 'completed',
    head: Object.freeze({ ...head, pendingTurnId: null }),
    turn: Object.freeze({ ...turn, version: turn.version + 1, status: 'completed', finalReply }),
  }
}
