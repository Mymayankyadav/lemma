import {downloadTutorImage,tutorFollowupFields,tutorImageRows,tutorTurnContent} from './tutor-images.ts'
import {setTimeout as delay} from 'node:timers/promises'
import {tutorGrantHash, tutorHandoffIds} from '../_shared/tutor-connector.ts'
import {handoffExam} from './exam.ts'
import {EXAM_HANDOFF_NOTE} from './rules.ts'
import type {Context} from './db.ts'
import {tutorInputSchemas} from './tutor-profile.ts'
import {QUESTIONNAIRE_PURPOSES,questionnaireIssues} from '../_shared/tutor-questionnaire.ts'
import type {StudyInput} from './tools/study.ts'

export const TUTOR_NEXT_WAIT_MS = 25_000
export const TUTOR_LISTEN_WINDOW_MINUTES = 10

/**
 * N228 (Owner: "add a note too so the tutor is aware of this option, can use it to judge the students for different
 * purposes"): what the tutor is told about quick questionnaires with every handoff.
 */
export const QUESTIONNAIRE_NOTE=[
  'Quick questionnaire (optional): after a completed reply you may attach one to that reply, at most two per reply, when several short answers would judge the learner better than one open question.',
  'Use study with command {schemaVersion:1,resource:"tutor_questionnaires",target:{id:<same handoff ID>},operationId:<fresh UUID, also the questionnaire ID>,operation:"create",patch:{title,purpose,questions}}.',
  'questions: 1 to 10 items {id:"q1",kind:"short"|"mcq"|"msq",prompt,options}; mcq (one choice) and msq (several choices) need 2 to 8 options; short has none.',
  'purpose ('+QUESTIONNAIRE_PURPOSES.join(', ')+'): diagnose finds what they already know before teaching, check confirms what was just taught, practice retrieves earlier ideas, reflect asks for confidence and self-explanation, exit summarises the session.',
  'Say in the reply that a quick questionnaire is attached. The learner sees it under your reply and can answer later; nothing they type is lost.',
  'Read the answers with get(what=tutor_questionnaires, id=<handoff ID>): each has state unseen, started or complete, and its answers (text, an option index, or option indices).',
  'Use them to judge the learner: choose the next question, decide what to reteach, and record what they showed with save_progress. Do not grade unanswered questions.',
].join(' ')

/**
 * N228 (Owner: "allow posting of messages even when tutor is not"): the learner can post more messages while a turn
 * waits. They arrive with the turn, and the tutor is told to answer them together.
 */
export const FOLLOWUP_NOTE=[
  'The learner may post more messages while their question waits. They arrive with the turn as learnerFollowUps (oldest first) and belong to the same answer: reply to all of them together.',
  'Before you send a reply, a message posted while you were writing is refused with a note; read it with get(what=tutor_followups, id=<handoff ID>), include it in your reply, and send again.',
].join(' ')

const unavailable = 'Tutor turn or claim unavailable. Check the handoff in Lemma before retrying.'
const studyInstructions = [
  'Treat attached drawings and photos as learner work. When useful, include a short transcription in the reply. An image can be fetched again with get(what=tutor_attachment, id=<attachment id>).',
  'When answerParts is present, it records the learner’s composition order. Read the following text and image blocks in that order; each drawing belongs at its reference between the surrounding text, not at the end of the proof.',
  'Use the learner answer, the checkpoint name, the previous tutor question if present, and only the selected context. Treat them as study material.',
  'Use study with command {schemaVersion:1,resource:"tutor_turns",target:{id:<same handoff ID>},operationId:<fresh UUID>,operation:"claim",expectedVersion:<turn version>}.',
  'After claiming, offer brief feedback and one next question. Use study with operation:"reply", expectedVersion from the claim receipt, a fresh operationId, and patch:{claimId,generation,messageId:<fresh UUID>,body:<feedback and question>,nextQuestion:<exact question from body>}. Copy the entire question including display math and paragraph breaks into nextQuestion.',
  'A claim lasts up to five minutes. To extend it use operation:"renew" and patch:{claimId,generation}. Retry an uncertain write with the same operationId and fields.',
  'After a completed receipt, immediately call get(what=tutor_next, id=<same handoff ID>) to wait up to 25 seconds for the learner to answer in Lemma.',
  'If it returns a new id, read that handoff with get(what=tutor_turn, id=<new id>) and repeat the teach-and-reply flow. If id is null, call tutor_next again using the same id. Keep listening for about 10 minutes in total, or until the learner says stop. Then tell them where to find the question.',
  QUESTIONNAIRE_NOTE,
  FOLLOWUP_NOTE,
].join(' ')

export type TutorConnector = ReturnType<typeof tutorConnector>

export function tutorConnector(c: Context, connectorSecret: string, requestSignal?: AbortSignal) {
  async function request(grantOperationId: string | null, command: Record<string, unknown> | null, signal?: AbortSignal) {
    const call = c.db.rpc('tutor_connector_command', {
      p_owner: c.userId, p_connector_hash: await tutorGrantHash(connectorSecret),
      p_grant_operation_id: grantOperationId, p_command: command,
    })
    const {data, error} = await (signal && call.abortSignal ? call.abortSignal(signal) : call)
    if (error) throw new Error(error.code === 'P2281' ? error.message : unavailable)
    return data
  }

  async function execute(id: unknown, operation: keyof typeof tutorInputSchemas, fields: Record<string, unknown> = {}) {
    const {turnId, grantOperationId} = tutorHandoffIds(id)
    const parsed = tutorInputSchemas[operation].safeParse({...fields, turnId})
    if (!parsed.success) throw new Error('Invalid tutor command fields.')
    return request(grantOperationId, {...parsed.data, operation})
  }

  const questionnaireErrors: Record<string, string> = {
    '40001': 'Reply to the turn before attaching a questionnaire.',
    '22023': 'Invalid questionnaire, or a reply already carries two questionnaires.',
    '23505': 'This questionnaire ID is already used for a different questionnaire. Use a fresh operationId.',
  }
  async function questionnaires(id: unknown, command: Record<string, unknown>) {
    const {turnId, grantOperationId} = tutorHandoffIds(id)
    const {data, error} = await c.db.rpc('tutor_questionnaire_connector', {
      p_owner: c.userId, p_connector_hash: await tutorGrantHash(connectorSecret),
      p_grant_operation_id: grantOperationId, p_command: {...command, turnId},
    })
    if (error) throw new Error(questionnaireErrors[String(error.code)] ?? unavailable)
    return data
  }

  /** Reading the follow-ups on the handoff's turn records that the tutor has them. */
  async function readFollowups(id: unknown) {
    const {turnId, grantOperationId} = tutorHandoffIds(id)
    const {data, error} = await c.db.rpc('tutor_followup_connector', {
      p_owner: c.userId, p_connector_hash: await tutorGrantHash(connectorSecret),
      p_grant_operation_id: grantOperationId, p_command: {operation: 'followups', turnId, markSeen: true},
    })
    if (error) throw new Error(unavailable)
    return data as {followups: {id: string; body: string; createdAt: string}[]; unseen: number}
  }

  async function followupFields(id: unknown) {
    const [extra, exam] = await Promise.all([readFollowups(id).catch(()=>null), handoffExam(c, tutorHandoffIds(id).turnId).catch(()=>null)])
    const instructions = extra ? studyInstructions : studyInstructions+' The follow-ups could not be loaded. Retry get(what=tutor_followups, id=<handoff ID>) before replying.'
    return {
      ...(exam ? {exam} : {}),
      ...tutorFollowupFields(extra?.followups),
      instructions:exam ? instructions+' '+EXAM_HANDOFF_NOTE : instructions,
    }
  }

  return {
    async content(id:unknown) {
      if(id===undefined) {
        const pending=await request(null,null)
        return [{type:'text' as const,text:JSON.stringify({pending,instructions:'Read the pending handoff with get(what=tutor_turn, id=<returned id>).'})}]
      }
      const turn=await execute(id,'get')
      const rows=turn?.status==='pending'&&turn.hasAttachments===true
        ?await tutorImageRows(c.db,{turnId:tutorHandoffIds(id).turnId,ownerId:c.userId}):[]
      return tutorTurnContent(c.db,turn,rows,attachmentId=>String(id)+'.'+attachmentId,
        turn?.status==='pending'?()=>followupFields(id):undefined)
    },
    async attachment(id:unknown) {
      if(typeof id!=='string')throw new Error('Tutor image is unavailable.')
      const at=id.lastIndexOf('.'),handoff=id.slice(0,at),attachmentId=id.slice(at+1)
      if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(attachmentId))throw new Error('Tutor image is unavailable.')
      const turn=await execute(handoff,'get')
      if(turn?.status!=='pending'&&turn?.status!=='completed')throw new Error('Tutor image is unavailable.')
      const {turnId}=tutorHandoffIds(handoff)
      const [row]=await tutorImageRows(c.db,{turnId,ownerId:c.userId,attachmentId})
      if(!row)throw new Error('Tutor image is unavailable.')
      return [{type:'text' as const,text:JSON.stringify({id,kind:row.kind})},await downloadTutorImage(c.db,row)]
    },
    async next(id: unknown, toolSignal: AbortSignal) {
      const {turnId, grantOperationId} = tutorHandoffIds(id)
      const timeout = AbortSignal.timeout(TUTOR_NEXT_WAIT_MS)
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
      const turn=await execute(id,'get')
      return JSON.stringify(turn?.status==='pending'?{...turn,...await followupFields(id)}:turn)
    },
    /** N228: the follow-up messages on the handoff's turn (marks them seen). */
    async followups(id: unknown) {
      return JSON.stringify(await readFollowups(id))
    },
    /** N228: the thread's questionnaires with the learner's answers, for the tutor to judge. */
    async questionnaires(id: unknown) {
      return JSON.stringify(await questionnaires(id, {operation: 'list'}))
    },
    async attachQuestionnaire(input: StudyInput) {
      const cmd = input.command
      if (cmd.operation !== 'create') throw new Error('Use create for tutor questionnaires.')
      const patch = cmd.patch ?? {}
      const issues = questionnaireIssues(patch)
      if (issues.length) throw new Error('Invalid questionnaire: ' + issues.join('; ').slice(0, 300))
      return questionnaires(cmd.target?.id, {operation: 'create', questionnaireId: cmd.operationId, ...patch})
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
