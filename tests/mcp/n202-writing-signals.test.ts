import assert from 'node:assert/strict'
import {serveTutor} from '../../supabase/functions/mcp/tutor-profile.ts'
import {tutorConnector} from '../../supabase/functions/mcp/tutor-connector.ts'
import {unpackTutorWritingReply} from '../../supabase/functions/_shared/tutor-writing.ts'
import type {Db,Context} from '../../supabase/functions/mcp/db.ts'
import type {StudyInput} from '../../supabase/functions/mcp/tools/study.ts'

for(const transport of ['ordinary','bearer']) Deno.test(transport+' tutor carries optional writing signals through the existing reply RPC',async()=>{
  const turnId=crypto.randomUUID(),grantId=crypto.randomUUID(),messageId=crypto.randomUUID()
  const body='Let X be the given set. You can ask: I would like to check my wording.'
  const writingAid={version:1,revision:'one',signals:[{id:'wording',sourceId:messageId,role:'suggested-wording',
    text:'I would like to check my wording.',variables:['X'],symbols:[]}]}
  const patch={claimId:crypto.randomUUID(),generation:1,messageId,body,nextQuestion:'I would like to check my wording.',writingAid}
  const captured:Record<string,unknown>[]=[]
  const db:Db={from(){throw Error('No table access needed')},async rpc(fn,args={}){
    if(fn==='tutor_grant_active')return {data:true,error:null}
    assert.equal(fn,transport==='ordinary'?'tutor_connector_command':'tutor_grant_command')
    captured.push(args.p_command as Record<string,unknown>)
    return {data:{status:'completed'},error:null}
  }}
  if(transport==='ordinary'){
    const c={userId:crypto.randomUUID(),db} as Context
    await tutorConnector(c,'1'.repeat(48)).write({command:{schemaVersion:1,resource:'tutor_turns',
      target:{id:turnId+'.'+grantId},operation:'reply',operationId:crypto.randomUUID(),expectedVersion:2,patch}} as StudyInput)
  }else{
    const response=await serveTutor(new Request('https://local.test/mcp/tutor',{method:'POST',headers:{
      Authorization:'Bearer '+'9'.repeat(64),Accept:'application/json, text/event-stream','Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'submit_tutor_reply',arguments:{
        turnId,operationId:crypto.randomUUID(),expectedVersion:2,...patch}}})}),db)
    assert.equal(response.status,200)
    const text=await response.text()
    const message=JSON.parse(text.startsWith('{')?text:text.split('\n').find(line=>line.startsWith('data:'))!.slice(5))
    assert.equal(message.result.isError,undefined)
  }
  assert.equal(captured.length,1)
  const command=captured[0]
  assert.equal(command.operation,'reply')
  assert.equal(command.turnId,turnId)
  assert.equal(command.nextQuestion,patch.nextQuestion)
  assert.equal(command.writingAid,undefined,'new metadata never changes the database command fields')
  assert.deepEqual(unpackTutorWritingReply(command.body as string),{body,context:writingAid})
})
