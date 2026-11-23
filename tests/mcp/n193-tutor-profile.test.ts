import assert from 'node:assert/strict'
import {serveTutor} from '../../supabase/functions/mcp/tutor-profile.ts'
import type {Db} from '../../supabase/functions/mcp/db.ts'
import {imageReference} from '../../supabase/functions/_shared/tutor-answer.ts'

const request=(db:Db,token:string,method:string,params:object={})=>serveTutor(new Request('https://local.test/mcp/tutor',{
 method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json, text/event-stream','Content-Type':'application/json'},
 body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
}),db)

async function message(response:Response){
 assert.equal(response.status,200)
 const body=await response.text()
 return JSON.parse(body.startsWith('{')?body:body.split('\n').find(x=>x.startsWith('data:'))!.slice(5))
}

// Drive the actual SDK's HTTP tools/list and tools/call routing. Separate Postgres
// tests exercise the RPCs and multi-connection lease/reply transactions.
Deno.test('narrow tutor HTTP profile checks every bearer and exposes four bounded tools',async()=>{
 const secret='9'.repeat(64)
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))),v=>v.toString(16).padStart(2,'0')).join('')
 let granted=true,checks=0,imageQueries=0,unread=false
 const calls:Record<string,unknown>[]=[]
 const db:Db={
  from(table){
   assert.equal(table,'tutor_turn_attachments');imageQueries++
   const empty={select:()=>empty,eq:()=>empty,order:()=>empty,limit:()=>Promise.resolve({data:[],error:null})}
   return empty
  },
  async rpc(fn,args={}){
   assert.equal(args.p_token_hash,digest)
   if(fn==='tutor_grant_active'){checks++;return {data:granted,error:null}}
   if(fn==='tutor_grant_followups'){
    assert.equal(args.p_turn,turnId)
    return {data:{followups:[{body:'And one more thing.',createdAt:'2026-11-23T10:00:00Z'}]},error:null}
   }
   assert.equal(fn,'tutor_grant_command')
   const command=args.p_command as Record<string,unknown>;calls.push(command)
   if(command.operation==='reply'&&unread)return {data:null,error:{code:'P2281',message:'Unread follow-ups'}}
   return {data:{turnId:command.turnId,status:'pending'},error:null}
  },
 }
 assert.equal((await request(db,'a'.repeat(48),'tools/list')).status,401);assert.equal(checks,0)
 const list=await message(await request(db,secret,'tools/list'))
 assert.deepEqual(list.result.tools.map((t:{name:string})=>t.name).sort(),['claim_tutor_turn','get_tutor_turn','renew_tutor_claim','submit_tutor_reply'])
 const turnId='b66ed590-bfef-46aa-9a04-e547cec3643c'
 const get=await message(await request(db,secret,'tools/call',{name:'get_tutor_turn',arguments:{turnId}}))
 assert.deepEqual(JSON.parse(get.result.content[0].text),{turnId,status:'pending',
  learnerFollowUps:[{text:'And one more thing.',postedAt:'2026-11-23T10:00:00Z'}]})
 assert.equal(get.result.content.length,1)
 assert.deepEqual(calls,[{turnId,operation:'get'}])
 const forbidden=await message(await request(db,secret,'tools/call',{name:'approve_proposal',arguments:{turnId}}))
 assert.ok(forbidden.error || forbidden.result?.isError);assert.equal(calls.length,1)
 const malformed=await message(await request(db,secret,'tools/call',{name:'get_tutor_turn',arguments:{turnId,projectId:turnId}}))
 assert.ok(malformed.error || malformed.result?.isError);assert.equal(calls.length,1)
 const nextQuestion='Evaluate this integral.\n\n'+String.raw`\[\int_0^1 x^2\,dx\]`+'\n\nGive its exact value.'
 const reply={turnId,operationId:crypto.randomUUID(),claimId:crypto.randomUUID(),messageId:crypto.randomUUID(),
  generation:1,expectedVersion:2,body:'Correct.\n\n'+nextQuestion,nextQuestion}
 unread=true
 const refused=await message(await request(db,secret,'tools/call',{name:'submit_tutor_reply',arguments:reply}))
 assert.equal(refused.result.isError,true)
 assert.match(refused.result.content[0].text,/Use get_tutor_turn to read them/)
 unread=false
 const submission=await message(await request(db,secret,'tools/call',{name:'submit_tutor_reply',arguments:reply}))
 assert.equal(submission.result.isError,undefined)
 assert.deepEqual(calls[1],{...reply,operation:'reply'})
 assert.deepEqual(calls[2],calls[1])
 granted=false;assert.equal((await request(db,secret,'tools/list')).status,401);assert.equal(checks,7)
 assert.equal(imageQueries,1,'only a successful get can query the turn attachments')
})

Deno.test('bearer grants deliver authorized images in answer order through get_tutor_turn',async()=>{
 const secret='8'.repeat(64),turnId=crypto.randomUUID(),owner=crypto.randomUUID()
 const drawing=crypto.randomUUID(),photo=crypto.randomUUID()
 const mimeTypes={[drawing]:'image/png',[photo]:'image/jpeg'}
 const images={
  [drawing]:new Blob([Uint8Array.of(137,80,78,71,13,10,26,10)],{type:mimeTypes[drawing]}),
  [photo]:new Blob([Uint8Array.of(255,216,255)],{type:mimeTypes[photo]}),
 }
 const rows=[drawing,photo].map(id=>({id,user_id:owner,kind:id===drawing?'drawing':'photo',mime_type:mimeTypes[id],byte_size:images[id].size}))
 let status='pending',question='One '+imageReference(photo)+' two '+imageReference(drawing)+' three',queries=0,followupReads=0,storageFailure=false
 const paths:string[]=[]
 const db:Db={
  async rpc(fn,args={}){
   if(fn==='tutor_grant_active')return {data:true,error:null}
   if(fn==='tutor_grant_followups'){followupReads++;return {data:{followups:[]},error:null}}
   assert.equal(fn,'tutor_grant_command')
   const command=args.p_command as Record<string,unknown>
   assert.equal(command.operation,'get')
   return command.turnId===turnId
    ?{data:{turnId,status,snapshot:{question,selectedContext:[]}},error:null}
    :{data:null,error:{message:'Wrong turn'}}
  },
  from(table){
   assert.equal(table,'tutor_turn_attachments');queries++
   const list={select:()=>list,
    eq(column:string,value:string){assert.equal(column,'turn_id');assert.equal(value,turnId);return list},
    order(column:string){assert.equal(column,'position');return list},
    limit(count:number){assert.equal(count,3);return Promise.resolve({data:rows,error:null})},
   }
   return list
  },
  storage:{from(bucket){
   assert.equal(bucket,'tutor-ink')
   return {async download(path:string){
    paths.push(path)
    const [user,id]=path.split('/')
    assert.equal(user,owner);assert.ok(images[id]);
    return storageFailure?{data:null,error:'Unavailable'}:{data:images[id],error:null}
   }}
  }},
 }
 const get=async(id=turnId)=>(await message(await request(db,secret,'tools/call',{
  name:'get_tutor_turn',arguments:{turnId:id},
 }))).result

 assert.equal((await get(crypto.randomUUID())).isError,true)
 assert.deepEqual([queries,paths.length],[0,0])
 const inline=(await get()).content
 const metadata=JSON.parse(inline[0].text)
 assert.deepEqual(metadata.attachments,[{id:drawing,kind:'drawing',mimeType:'image/png'},{id:photo,kind:'photo',mimeType:'image/jpeg'}])
 assert.deepEqual(metadata.answerParts.filter((part:{type:string})=>part.type==='image').map((part:{id:string})=>part.id),[photo,drawing])
 assert.deepEqual(inline.slice(1).map((block:{type:string;text?:string;data?:string})=>block.type==='text'?block.text:block.data),[
  'Learner answer in composition order:','One ','[Photo 1]','/9j/',' two ','[Drawing 1]','iVBORw0KGgo=',' three',
 ])
 assert.deepEqual(paths,[owner+'/'+photo,owner+'/'+drawing])
 assert.ok(!JSON.stringify(inline).includes(owner),'the server does not expose owner paths')

 question='Image attached.'
 const legacy=(await get()).content
 assert.deepEqual(legacy.slice(1).map((block:{mimeType:string})=>block.mimeType),['image/png','image/jpeg'])
 storageFailure=true
 const unavailable=await get()
 assert.equal(unavailable.isError,true)
 assert.match(unavailable.content[0].text,/images are unavailable/i)
 status='completed'
 const completed=await get()
 assert.equal(completed.content.length,1)
 assert.equal(queries,3,'only pending authorized turns query files')
 assert.equal(followupReads,2,'only successful pending reads acknowledge follow-ups')
})
