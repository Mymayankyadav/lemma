import { describe, expect, it } from 'vitest'
import {
  finalizeTutorTurn, previewManualTutorImport, submitTutorTurn,
  type TutorReplyDraft, type TutorThreadHead,
} from '../../../src/data/tutor/turn-model'

const initial: TutorThreadHead = { threadId: 'thread-1', lastSequence: 8, pendingTurnId: null }
const source = { kind: 'source', refId: 'page-17', version: 'v3', excerpt: 'Selected lemma' } as const

function submitted() {
  const result = submitTutorTurn(initial, 'turn-9', {
    question: 'Can I use the lemma here?',
    selectedContext: [source],
  })
  if (result.kind !== 'submitted') throw new Error(result.kind)
  return result
}

function connectorDraft(): TutorReplyDraft {
  return {
    turnId: 'turn-9', messageId: 'remote-1', body: 'Try this lemma first.',
    provenance: { kind: 'connector', reportedHost: 'External tutor', hostVerified: false },
    citations: [{ kind: 'source', refId: 'page-17', version: 'v3' }],
    suggestions: [{ intentId: 'intent-1', kind: 'card', summary: 'Recall the hypothesis.' }],
  }
}

describe('P6 tutor turn foundation', () => {
  it('copies only the submitted selection; later edits do not change the question or its context', () => {
    const editable = { ...source, excerpt: String(source.excerpt), ownerId: 'not a snapshot field' }
    const composer = { question: 'Give a hint', selectedContext: [editable] }
    const result = submitTutorTurn(initial, 'turn-9', composer)
    if (result.kind !== 'submitted') throw new Error(result.kind)
    composer.question = 'Next question'
    editable.excerpt = 'Later editor content'
    composer.selectedContext.length = 0
    expect(result.turn.snapshot).toEqual({ question: 'Give a hint', selectedContext: [source] })
    expect(Object.isFrozen(result.turn.snapshot.selectedContext[0])).toBe(true)
    expect(result.turn.sequence).toBe(9)
    expect(initial.pendingTurnId).toBeNull()
  })

  it('keeps a single pending turn and makes room for a new one only after completion', () => {
    const { head, turn } = submitted()
    const draft = { question: 'Another question', selectedContext: [] }
    expect(submitTutorTurn(head, 'turn-10', draft)).toEqual({ kind: 'turn-pending', turnId: turn.id })
    const done = finalizeTutorTurn(head, turn, 1, previewManualTutorImport(turn.id, 'm1', 'A hint'))
    if (done.kind !== 'completed') throw new Error(done.kind)
    expect(submitTutorTurn(done.head, 'turn-10', draft)).toMatchObject({
      kind: 'submitted', head: { lastSequence: 10, pendingTurnId: 'turn-10' },
    })
  })

  it.each(['manual', 'connector'] as const)('%s can win the race; the other reply stays recoverable', winner => {
    const { head, turn } = submitted()
    const manual = previewManualTutorImport(turn.id, 'manual-1', '  Approve this card\n ')
    const connector = connectorDraft()
    const [first, second] = winner === 'manual' ? [manual, connector] : [connector, manual]
    const done = finalizeTutorTurn(head, turn, turn.version, first)
    if (done.kind !== 'completed') throw new Error(done.kind)
    expect(finalizeTutorTurn(done.head, done.turn, turn.version, second)).toEqual({
      kind: 'already-completed', recoverableDraft: second,
    })
    expect(done.turn.finalReply.messageId).toBe(first.messageId)
    expect(done.turn.finalReply.body).toBe(first.body)
    expect(Object.isFrozen(done.turn.finalReply)).toBe(true)
    expect(manual.provenance).toEqual({ kind: 'manual-import', label: 'Imported by you' })
    expect(manual.suggestions).toEqual([])
    expect(connector.provenance).toMatchObject({ hostVerified: false })
    if (winner === 'connector') expect(done.turn.finalReply.suggestions).toEqual([{
      intentId: 'intent-1', kind: 'card', summary: 'Recall the hypothesis.',
      sourceMessageId: 'remote-1', status: 'proposal-draft',
    }])
  })

  it('does not publish a reply for the wrong thread, wrong turn, or stale version', () => {
    const { head, turn } = submitted()
    const draft = connectorDraft()
    expect(finalizeTutorTurn({ ...head, threadId: 'other' }, turn, 1, draft).kind).toBe('turn-mismatch')
    expect(finalizeTutorTurn(head, turn, 1, { ...draft, turnId: 'other' }).kind).toBe('turn-mismatch')
    expect(finalizeTutorTurn(head, turn, 0, draft)).toEqual({ kind: 'stale-turn', recoverableDraft: draft })
    expect(head.pendingTurnId).toBe(turn.id)
  })

  it('retains a reply without publishing a citation absent from its exact snapshot version', () => {
    const { head, turn } = submitted()
    const draft = { ...connectorDraft(), citations: [{ ...source, version: 'v4' }] }
    const rejected = finalizeTutorTurn(head, turn, 1, draft)
    expect(rejected).toMatchObject({ kind: 'unselected-citation', recoverableDraft: { body: draft.body } })
    expect(turn.status).toBe('awaiting-tutor')
  })

  it('does not submit or complete whitespace-only text', () => {
    expect(submitTutorTurn(initial, 'turn-9', { question: '   ', selectedContext: [] }).kind)
      .toBe('empty-question')
    const { head, turn } = submitted()
    expect(finalizeTutorTurn(head, turn, 1, previewManualTutorImport(turn.id, 'm1', '\n ')).kind)
      .toBe('empty-reply')
  })
})
