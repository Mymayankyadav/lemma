import {McpServer,createMcpHandler,z} from './deps.ts'
import type {Db} from './db.ts'
import {tutorGrantHash} from '../_shared/tutor-connector.ts'
import {tutorImageRows,tutorTurnContent} from './tutor-images.ts'
import {packTutorWritingReply,TUTOR_WRITING_INSTRUCTIONS} from '../_shared/tutor-writing.ts'

const uuid=z.string().uuid()
const base={turnId:uuid,operationId:uuid}
const leased={...base,claimId:uuid,generation:z.number().int().positive()}
const replyText=z.string().min(1).max(12000)
const suggestion=z.union([
 z.object({kind:z.literal('card'),front:z.string().min(1).max(1500),back:z.string().max(3000),summary:z.string().min(1).max(300)}).strict(),
 z.object({kind:z.literal('plan'),summary:z.string().min(1).max(300),checkpoints:z.array(z.object({title:z.string().min(1).max(80),objective:z.string().min(1).max(400),criterion:z.string().min(1).max(400),steps:z.array(z.string().min(1).max(80)).min(1).max(8)}).strict()).min(1).max(5)}).strict(),
 z.object({kind:z.literal('change'),objective:z.string().min(1).max(400),version:z.number().int().positive(),summary:z.string().min(1).max(300)}).strict(),
])
export const tutorInputSchemas={
 get:z.object({turnId:uuid}).strict(),
 claim:z.object({...base,expectedVersion:z.number().int().positive()}).strict(),
 renew:z.object(leased).strict(),
 reply:z.object({...leased,expectedVersion:z.number().int().positive(),messageId:uuid,
  body:replyText,
  writingAid:z.unknown().optional().describe('Optional structured writing hints. '+TUTOR_WRITING_INSTRUCTIONS),
  nextQuestion:replyText.describe('Full next question copied verbatim from body, including display math and paragraph breaks.').optional(),
  reportedHost:z.string().min(1).max(100).optional(),
  citations:z.array(z.union([z.object({kind:z.literal('checkpoint'),refId:uuid,version:z.string().max(20)}).strict(),
   z.object({kind:z.literal('source'),refId:uuid,page:z.number().int().positive(),version:z.string().max(20)}).strict()])).max(8).optional(),
  suggestions:z.array(suggestion).max(4).optional()}).strict(),
}
const tools=[
 ['get_tutor_turn','get'],
 ['claim_tutor_turn','claim'],
 ['renew_tutor_claim','renew'],
 ['submit_tutor_reply','reply'],
] as const

/** A separate server and hashed per-turn bearer. Every call revalidates its grant inside its transaction. */
export async function serveTutor(req:Request,db:Db):Promise<Response>{
 const auth=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('Authorization')??'')
 if(!auth)return new Response(null,{status:401})
 const digest=await tutorGrantHash(auth[1])
 const active=await db.rpc('tutor_grant_active',{p_token_hash:digest})
 if(active.error)return new Response(null,{status:503})
 if(active.data!==true)return new Response(null,{status:401})
 const handler=createMcpHandler(()=>{
  const server=new McpServer({name:'lemma-checkpoint-tutor',version:'1.0'},
   {instructions:'Answer the specified pending question with its selected context. A claim lasts five minutes. Suggestions wait for the learner to review. '+TUTOR_WRITING_INSTRUCTIONS})
  for(const [name,operation] of tools){
   server.registerTool(name,{description:operation==='get'
    ?'Read the granted turn with any drawings and photos in composition order.'
    :name.replaceAll('_',' '),inputSchema:tutorInputSchemas[operation],annotations:{readOnlyHint:operation==='get'}},async(args:Record<string,unknown>)=>{
    const command=operation==='reply'?packTutorWritingReply({...args,operation}):{...args,operation}
    const {data,error}=await db.rpc('tutor_grant_command',{p_token_hash:digest,p_command:command})
    const pending=operation==='get'&&data?.status==='pending'
    if(error||pending&&(typeof args.turnId!=='string'||data.turnId!==args.turnId.toLowerCase())) {
     return {isError:true,content:[{type:'text' as const,text:'Turn, grant or claim unavailable, changed, or invalid. Read the turn before retrying.'}]}
    }
    if(!pending)return {content:[{type:'text' as const,text:JSON.stringify(data)}]}
    try {
     // The RPC matched the bearer to this exact turn's primary key. Its attachment
     // rows carry the corresponding owner via the (user_id, turn_id) foreign key.
     const rows=await tutorImageRows(db,{turnId:data.turnId})
     return {content:await tutorTurnContent(db,data,rows)}
    } catch {
     return {isError:true,content:[{type:'text' as const,text:'Tutor images are unavailable. Read the turn again before replying.'}]}
    }
   })
  }
  return server
 })
 return handler.fetch(req)
}
