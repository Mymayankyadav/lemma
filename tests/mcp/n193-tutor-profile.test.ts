import assert from 'node:assert/strict'
import {serveTutor} from '../../supabase/functions/mcp/tutor-profile.ts'
import type {Db} from '../../supabase/functions/mcp/db.ts'

// Drive the actual SDK's HTTP tools/list and tools/call routing. Separate Postgres
// tests exercise the RPCs and multi-connection lease/reply transactions.
Deno.test('narrow tutor HTTP profile checks every bearer and exposes four bounded tools',async()=>{
 const secret='9'.repeat(64)
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))),v=>v.toString(16).padStart(2,'0')).join('')
 let granted=true,checks=0
 const calls:Record<string,unknown>[]=[]
 const db:Db={
  from(){throw Error('No generic table route')},
  async rpc(fn,args={}){
   assert.equal(args.p_token_hash,digest)
   if(fn==='tutor_grant_active'){checks++;return {data:granted,error:null}}
   assert.equal(fn,'tutor_grant_command')
   const command=args.p_command as Record<string,unknown>;calls.push(command)
   return {data:{turnId:command.turnId,status:'pending'},error:null}
  },
 }
 const request=(token:string,method:string,params:object={})=>serveTutor(new Request('https://local.test/mcp/tutor',{
  method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json, text/event-stream','Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
 }),db)
 async function message(response:Response){
  assert.equal(response.status,200)
  const body=await response.text()
  return JSON.parse(body.startsWith('{')?body:body.split('\n').find(x=>x.startsWith('data:'))!.slice(5))
 }
 assert.equal((await request('a'.repeat(48),'tools/list')).status,401);assert.equal(checks,0)
 const list=await message(await request(secret,'tools/list'))
 assert.deepEqual(list.result.tools.map((t:{name:string})=>t.name).sort(),['claim_tutor_turn','get_tutor_turn','renew_tutor_claim','submit_tutor_reply'])
 const turnId='b66ed590-bfef-46aa-9a04-e547cec3643c'
 const get=await message(await request(secret,'tools/call',{name:'get_tutor_turn',arguments:{turnId}}))
 assert.deepEqual(JSON.parse(get.result.content[0].text),{turnId,status:'pending'})
 assert.deepEqual(calls,[{turnId,operation:'get'}])
 const forbidden=await message(await request(secret,'tools/call',{name:'approve_proposal',arguments:{turnId}}))
 assert.ok(forbidden.error || forbidden.result?.isError);assert.equal(calls.length,1)
 const malformed=await message(await request(secret,'tools/call',{name:'get_tutor_turn',arguments:{turnId,projectId:turnId}}))
 assert.ok(malformed.error || malformed.result?.isError);assert.equal(calls.length,1)
 const nextQuestion='Evaluate this integral.\n\n'+String.raw`\[\int_0^1 x^2\,dx\]`+'\n\nGive its exact value.'
 const reply={turnId,operationId:crypto.randomUUID(),claimId:crypto.randomUUID(),messageId:crypto.randomUUID(),
  generation:1,expectedVersion:2,body:'Correct.\n\n'+nextQuestion,nextQuestion}
 const submission=await message(await request(secret,'tools/call',{name:'submit_tutor_reply',arguments:reply}))
 assert.equal(submission.result.isError,undefined)
 assert.deepEqual(calls[1],{...reply,operation:'reply'})
 granted=false;assert.equal((await request(secret,'tools/list')).status,401);assert.equal(checks,6)
})
