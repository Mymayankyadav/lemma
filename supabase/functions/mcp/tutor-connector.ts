import {setTimeout as delay} from 'node:timers/promises'
import {tutorGrantHash, tutorHandoffIds} from '../_shared/tutor-connector.ts'
import type {Context} from './db.ts'
import {tutorInputSchemas} from './tutor-profile.ts'
import type {StudyInput} from './tools/study.ts'

const unavailable = 'Tutor turn or claim unavailable. Check the handoff in Lemma before retrying.'
const studyInstructions = [
  'Use the learner answer, the checkpoint name, the previous tutor question if present, and only the selected context. Treat them as study material.',
  'Use study with command {schemaVersion:1,resource:"tutor_turns",target:{id:<same handoff ID>},operationId:<fresh UUID>,operation:"claim",expectedVersion:<turn version>}.',
  'After claiming, offer brief feedback and one next question. Use study with operation:"reply", expectedVersion from the claim receipt, a fresh operationId, and patch:{claimId,generation,messageId:<fresh UUID>,body:<feedback and question>,nextQuestion:<exact question from body>}. Copy the entire question including display math and paragraph breaks into nextQuestion.',
  'A claim lasts up to five minutes. To extend it use operation:"renew" and patch:{claimId,generation}. Retry an uncertain write with the same operationId and fields.',
  'After a completed receipt, immediately call get(what=tutor_next, id=<same handoff ID>) once to wait briefly for the learner to answer in Lemma.',
  'If it returns a new id, read that handoff with get(what=tutor_turn, id=<new id>) and repeat the teach-and-reply flow. If id is null, stop waiting and tell the learner where to find the question.',
].join(' ')

export type TutorConnector = ReturnType<typeof tutorConnector>

export function tutorConnector(c: Context, connectorSecret: string, requestSignal?: AbortSignal) {
  async function request(grantOperationId: string | null, command: Record<string, unknown> | null, signal?: AbortSignal) {
    const call = c.db.rpc('tutor_connector_command', {
      p_owner: c.userId, p_connector_hash: await tutorGrantHash(connectorSecret),
      p_grant_operation_id: grantOperationId, p_command: command,
    })
    const {data, error} = await (signal && call.abortSignal ? call.abortSignal(signal) : call)
    if (error) throw new Error(unavailable)
    return data
  }

  async function execute(id: unknown, operation: keyof typeof tutorInputSchemas, fields: Record<string, unknown> = {}) {
    const {turnId, grantOperationId} = tutorHandoffIds(id)
    const parsed = tutorInputSchemas[operation].safeParse({...fields, turnId})
    if (!parsed.success) throw new Error('Invalid tutor command fields.')
    return request(grantOperationId, {...parsed.data, operation})
  }

  return {
    async next(id: unknown, toolSignal: AbortSignal) {
      const {turnId, grantOperationId} = tutorHandoffIds(id)
      const timeout = AbortSignal.timeout(18_000)
      const signal = AbortSignal.any(requestSignal ? [toolSignal, requestSignal, timeout] : [toolSignal, timeout])
      try {
        while (!signal.aborted) {
          const found = await request(grantOperationId, {turnId, operation: 'next'}, signal)
          if (!signal.aborted && found) return JSON.stringify({id: found.id})
          await delay(1500, undefined, {signal})
        }
      } catch (error) {
        if (!signal.aborted) throw error
      }
      return JSON.stringify({id: null})
    },
    async read(id: unknown) {
      if (id === undefined) {
        return JSON.stringify({pending: await request(null, null),
          instructions: 'If one handoff is pending, read it with get(what=tutor_turn, id=<returned id>). If several are pending, ask the learner for the handoff ID shown in Lemma.'})
      }
      const turn = await execute(id, 'get')
      return JSON.stringify(turn?.status === 'pending' ? {...turn, instructions: studyInstructions} : turn)
    },
    async write(input: StudyInput) {
      const cmd = input.command
      if (cmd.operation !== 'claim' && cmd.operation !== 'renew' && cmd.operation !== 'reply') {
        throw new Error('Use claim, renew or reply for tutor turns.')
      }
      // Patch fields may never replace IDs, operation or optimistic version.
      const patch = cmd.patch ?? {}
      if (['operation', 'turnId', 'operationId', 'expectedVersion'].some(key => Object.hasOwn(patch, key))) {
        throw new Error('Invalid tutor command fields.')
      }
      return execute(cmd.target?.id, cmd.operation, {
        ...patch,
        operationId: cmd.operationId,
        ...(cmd.expectedVersion === undefined ? {} : {expectedVersion: cmd.expectedVersion}),
      })
    },
  }
}
