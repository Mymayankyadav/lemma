import { getDemoProfile, getMode } from '../mode'
import {tutorMessageKey,withTutorMessageDeletions,type TutorMessageRef} from './manual-api'
import {
  finalizeTutorTurn, previewManualTutorImport, submitTutorTurn,
  type TutorComposerDraft, type TutorReplyDraft, type TutorThreadHead, type TutorTurn,
} from './turn-model'

const databaseName = 'lemma-demo-tutor'
const storeName = 'checkpoint-threads'

type DemoCheckpointScope = Readonly<{ pathId: string; checkpointId: string }>
type DemoThread = Readonly<{
  head: TutorThreadHead
  turns: readonly TutorTurn[]
  recoveredDrafts: readonly TutorReplyDraft[]
  deletedMessages?: readonly string[]
}>

function assertDemo() {
  if (getMode() !== 'demo') throw new Error('Tutor preview is available only in demo mode')
}

/**
 * Browser-only preview using a fixture profile, not a real owner identity. This
 * is deliberately not a live adapter or outbox. Both tabs serialize writes on
 * the same IndexedDB store, and only transaction completion confirms a save.
 */
export async function openDemoManualTutor(scope: DemoCheckpointScope) {
  assertDemo()
  if (!scope.pathId.trim() || !scope.checkpointId.trim()) throw new Error('A demo checkpoint is required')
  const profile = getDemoProfile()
  const key = [profile, scope.pathId, scope.checkpointId]
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  db.onversionchange = () => db.close()

  function assertProfile() {
    assertDemo()
    if (getDemoProfile() !== profile) throw new Error('The demo profile changed; reopen the tutor preview')
  }

  function transact<T>(
    mode: IDBTransactionMode,
    step: (thread: DemoThread) => { result: T; next?: DemoThread },
  ): Promise<T> {
    assertProfile()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const store = tx.objectStore(storeName)
      let result: T
      let failure: unknown
      tx.oncomplete = () => {
        try { assertProfile(); resolve(result) } catch (error) { reject(error) }
      }
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Tutor preview save was aborted'))
      const read = store.get(key)
      read.onsuccess = () => {
        const thread: DemoThread = read.result ?? {
          head: { threadId: JSON.stringify(key), lastSequence: 0, pendingTurnId: null },
          turns: [], recoveredDrafts: [],
        }
        try {
          const mutation = step(thread)
          result = mutation.result
          if (mutation.next) store.put(mutation.next, key)
        } catch (error) {
          failure = error
          tx.abort()
        }
      }
    })
  }

  return {
    close: () => db.close(),
    resume: () => transact('readonly', thread => ({ result: {
      ...thread, turns: withTutorMessageDeletions(thread.turns,new Set(thread.deletedMessages)),
    } })),
    deleteMessages: (messages: readonly TutorMessageRef[]) => transact('readwrite', thread => {
      const valid = messages.every(message => thread.turns.some(turn =>
        message.kind === 'question' ? turn.id === message.id :
          message.kind === 'reply' && turn.status === 'completed' && turn.finalReply.messageId === message.id,
      ))
      if (!valid) throw new Error('One of the selected messages is unavailable.')
      const deletedMessages = [...new Set([...(thread.deletedMessages ?? []), ...messages.map(tutorMessageKey)])]
      return { result: undefined, next: { ...thread, deletedMessages } }
    }),
    submit: (turnId: string, draft: TutorComposerDraft) =>
      transact<ReturnType<typeof submitTutorTurn> | { kind: 'duplicate-turn' }>('readwrite', thread => {
        if (thread.turns.some(turn => turn.id === turnId)) return { result: { kind: 'duplicate-turn' } }
        const result = submitTutorTurn(thread.head, turnId, draft)
        return result.kind === 'submitted'
          ? { result, next: { ...thread, head: result.head, turns: [...thread.turns, result.turn] } }
          : { result }
      }),
    previewImport: previewManualTutorImport,
    confirmImport: (turnId: string, expectedVersion: number, messageId: string, body: string) =>
      transact<ReturnType<typeof finalizeTutorTurn> | { kind: 'unknown-turn' }>('readwrite', thread => {
        const turn = thread.turns.find(row => row.id === turnId)
        if (!turn) return { result: { kind: 'unknown-turn' } }
        const candidate = previewManualTutorImport(turnId, messageId, body)
        if (
          turn.status === 'completed' && turn.finalReply.messageId === messageId && turn.finalReply.body === body
        ) return { result: { kind: 'completed', head: thread.head, turn } }

        const result = finalizeTutorTurn(thread.head, turn, expectedVersion, candidate)
        if (result.kind === 'completed') return {
          result,
          next: { ...thread, head: result.head, turns: thread.turns.map(row => row.id === turnId ? result.turn : row) },
        }
        if (
          candidate.body.trim() && !thread.recoveredDrafts.some(draft =>
            draft.turnId === turnId && draft.messageId === messageId && draft.body === body,
          )
        ) return { result, next: { ...thread, recoveredDrafts: [...thread.recoveredDrafts, result.recoverableDraft] } }
        return { result }
      }),
  }
}
