import {McpServer,createMcpHandler,z} from './deps.ts'
import type {Db} from './db.ts'

const uuid=z.string().uuid()
const base={turnId:uuid,operationId:uuid}
const leased={...base,claimId:uuid,generation:z.number().int().positive()}
const suggestion=z.union([
 z.object({kind:z.literal('card'),front:z.string().min(1).max(1500),back:z.string().max(3000),summary:z.string().min(1).max(300)}).strict(),
 z.object({kind:z.literal('plan'),summary:z.string().min(1).max(300),checkpoints:z.array(z.object({title:z.string().min(1).max(80),objective:z.string().min(1).max(400),criterion:z.string().min(1).max(400),steps:z.array(z.string().min(1).max(80)).min(1).max(8)}).strict()).min(1).max(5)}).strict(),
 z.object({kind:z.literal('change'),objective:z.string().min(1).max(400),version:z.number().int().positive(),summary:z.string().min(1).max(300)}).strict(),
 z.object({kind:z.literal('existing'),proposalId:uuid,version:z.number().int().positive(),summary:z.string().min(1).max(300)}).strict(),
])
const tools=[
 ['get_tutor_turn','get',z.object({turnId:uuid}).strict()],
 ['claim_tutor_turn','claim',z.object({...base,expectedVersion:z.number().int().positive()}).strict()],
 ['renew_tutor_claim','renew',z.object(leased).strict()],
 ['submit_tutor_reply','reply',z.object({...leased,expectedVersion:z.number().int().positive(),messageId:uuid,
  body:z.string().min(1).max(12000),reportedHost:z.string().min(1).max(100).optional(),
  citations:z.array(z.union([z.object({kind:z.literal('checkpoint'),refId:uuid,version:z.string().max(20)}).strict(),
   z.object({kind:z.literal('source'),refId:uuid,page:z.number().int().positive(),version:z.string().max(20)}).strict()])).max(8).optional(),
  suggestions:z.array(suggestion).max(4).optional()}).strict()],
] as const

/** A separate server and hashed per-turn bearer. Every call revalidates its grant inside its transaction. */
export async function serveTutor(req:Request,db:Db):Promise<Response>{
 const auth=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('Authorization')??'')
 if(!auth)return new Response(null,{status:401})
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth[1]))
 const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
 const active=await db.rpc('tutor_grant_active',{p_token_hash:digest})
 if(active.error)return new Response(null,{status:503})
 if(active.data!==true)return new Response(null,{status:401})
 const handler=createMcpHandler(()=>{
  const server=new McpServer({name:'lemma-checkpoint-tutor',version:'1.0'},
   {instructions:'Answer the specified pending question with its selected context. A claim lasts five minutes. Suggestions wait for the learner to review.'})
  for(const [name,operation,schema] of tools){
   server.registerTool(name,{description:name.replaceAll('_',' '),inputSchema:schema,annotations:{readOnlyHint:operation==='get'}},async(args:Record<string,unknown>)=>{
    const {data,error}=await db.rpc('tutor_grant_command',{p_token_hash:digest,p_command:{...args,operation}})
    return error
     ? {isError:true,content:[{type:'text' as const,text:'Turn, grant or claim unavailable, changed, or invalid. Read the turn before retrying.'}]}
     : {content:[{type:'text' as const,text:JSON.stringify(data)}]}
   })
  }
  return server
 })
 return handler.fetch(req)
}
