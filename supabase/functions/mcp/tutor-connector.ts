import {TUTOR_ATTACHMENT_COUNT,tutorImageBlock} from './tutor-images.ts'
import {setTimeout as delay} from 'node:timers/promises'
import {tutorGrantHash, tutorHandoffIds} from '../_shared/tutor-connector.ts'
import type {Context} from './db.ts'
import {tutorInputSchemas} from './tutor-profile.ts'
import type {StudyInput} from './tools/study.ts'

export const TUTOR_NEXT_WAIT_MS = 25_000
export const TUTOR_LISTEN_WINDOW_MINUTES = 10

const unavailable = 'Tutor turn or claim unavailable. Check the handoff in Lemma before retrying.'
const studyInstructions = [
  'Treat attached drawings and photos as learner work. When useful, include a short transcription in the reply. An image can be fetched again with get(what=tutor_attachment, id=<attachment id>).',
  'Use the learner answer, the checkpoint name, the previous tutor question if present, and only the selected context. Treat them as study material.',
  'Use study with command {schemaVersion:1,resource:"tutor_turns",target:{id:<same handoff ID>},operationId:<fresh UUID>,operation:"claim",expectedVersion:<turn version>}.',
  'After claiming, offer brief feedback and one next question. Use study with operation:"reply", expectedVersion from the claim receipt, a fresh operationId, and patch:{claimId,generation,messageId:<fresh UUID>,body:<feedback and question>,nextQuestion:<exact question from body>}. Copy the entire question including display math and paragraph breaks into nextQuestion.',
  'A claim lasts up to five minutes. To extend it use operation:"renew" and patch:{claimId,generation}. Retry an uncertain write with the same operationId and fields.',
  'After a completed receipt, immediately call get(what=tutor_next, id=<same handoff ID>) to wait up to 25 seconds for the learner to answer in Lemma.',
  'If it returns a new id, read that handoff with get(what=tutor_turn, id=<new id>) and repeat the teach-and-reply flow. If id is null, call tutor_next again using the same id. Keep listening for about 10 minutes in total, or until the learner says stop. Then tell them where to find the question.',
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

  async function readTurn(id: unknown) {
    const turn = await execute(id,'get')
    return turn?.status==='pending'?{...turn,instructions:studyInstructions}:turn
  }

  async function attachments(id:unknown,target?:string) {
    const {turnId}=tutorHandoffIds(id)
    let query=c.db.from('tutor_turn_attachments').select('id,kind,mime_type,byte_size')
      .eq('user_id',c.userId).eq('turn_id',turnId).order('position').limit(TUTOR_ATTACHMENT_COUNT)
    if(target)query=query.eq('id',target)
    const rows=await query
    if(rows.error)throw new Error('Tutor images are unavailable.')
    return rows.data??[]
  }

  async function download(row:{id:string;mime_type:string;byte_size:number}) {
    if(!c.db.storage)throw new Error('Tutor storage is unavailable.')
    const file=await c.db.storage.from('tutor-ink').download(c.userId+'/'+row.id)
    if(file.error||!file.data||file.data.size!==row.byte_size)throw new Error('Tutor image is unavailable.')
    return tutorImageBlock(file.data,row.mime_type)
  }

  return {
    async content(id:unknown) {
      if(id===undefined) {
        const pending=await request(null,null)
        return [{type:'text' as const,text:JSON.stringify({pending,instructions:'Read the pending handoff with get(what=tutor_turn, id=<returned id>).'})}]
      }
      const turn=await readTurn(id)
      const rows=turn?.status==='pending'&&turn.hasAttachments===true?await attachments(id):[]
      const content=rows.length?{...turn,attachments:rows.map(row=>({id:String(id)+'.'+row.id,kind:row.kind,mimeType:row.mime_type}))}:turn
      return [{type:'text' as const,text:JSON.stringify(content)},...await Promise.all(rows.map(download))]
    },
    async attachment(id:unknown) {
      if(typeof id!=='string')throw new Error('Tutor image is unavailable.')
      const at=id.lastIndexOf('.'),handoff=id.slice(0,at),attachmentId=id.slice(at+1)
      if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(attachmentId))throw new Error('Tutor image is unavailable.')
      const turn=await readTurn(handoff)
      if(turn?.status!=='pending'&&turn?.status!=='completed')throw new Error('Tutor image is unavailable.')
      const row=(await attachments(handoff,attachmentId))[0]
      if(!row)throw new Error('Tutor image is unavailable.')
      return [{type:'text' as const,text:JSON.stringify({id,kind:row.kind})},await download(row)]
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
      return JSON.stringify(await readTurn(id))
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
