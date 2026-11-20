import {expect,test} from '@playwright/test'
import type {TutorThreadView} from '../../src/data/tutor/manual-api'
import {liveTutorFixtureResponse,prepareLiveTutor} from './helpers/live-tutor'

for(const entry of ['chat','Pad'] as const){
 test('signed-in '+entry+' warns when attaching a source page to a saved draft exceeds storage quota',async({page})=>{
  const {owner,cpId,projectId,payload}=await prepareLiveTutor(page)
  const refId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',short='Logic notes'
  const excerpt='A statement and its converse are different implications.'
  const source={kind:'source',refId,page:1,version:'1',excerpt}
  const checkpoint=(payload.checkpoints as Record<string,unknown>[])[0]
  checkpoint.source_id=refId
  payload.sources=[{id:refId,user_id:owner,project_id:projectId,short,title:short,kind:'notes'}]
  payload['rpc/tutor_thread_state']={head:{threadId:null,pendingTurnId:null,lastSequence:0},turns:[],recoveredDrafts:[],canSubmit:true,canConnect:false}
  payload['rpc/tutor_source_preview']=source
  await page.route('**/rest/v1/**',route=>{
   const request=route.request(),resource=new URL(request.url()).pathname.split('/rest/v1/')[1]
   return route.fulfill({json:liveTutorFixtureResponse(payload,resource,request.headers().accept)})
  })
  const draftKey='lemma.tutor.draft:'+JSON.stringify([owner,'logic',cpId])
  await page.addInitScript(key=>{
   const setItem=Storage.prototype.setItem
   Storage.prototype.setItem=function(name,value){
    if(this===localStorage&&name===key)throw new DOMException('Storage full','QuotaExceededError')
    setItem.call(this,name,value)
   }
  },draftKey+':source')

  const chat=entry==='chat'
  await page.goto('/lemma/?demo=0&flags=v7Shell,padLocal,tutorThreads#'+(chat?'/p/logic/cp/CP1/tutor':'/pad?path=logic&checkpoint=CP1'))
  const tutor=page.getByRole(chat?'main':'dialog',{name:'Checkpoint tutor'})
  if(chat)await tutor.getByRole('button',{name:'Write a question',exact:true}).click()
  else await page.getByRole('button',{name:'Open checkpoint tutor',exact:true}).click()
  const question=tutor.getByRole('textbox',{name:chat?'Your answer':'Question',exact:true})
  const text='Can I reverse this implication?'
  await question.fill(text)
  const warning=/draft.*may be lost on reload/i
  await expect(tutor.getByRole('alert').filter({hasText:warning})).toHaveCount(0)

  if(chat)await tutor.getByRole('button',{name:'Context',exact:true}).click()
  const context=chat?page.getByRole('dialog',{name:'Context for your tutor'}):tutor
  await context.getByText('Add a page from '+short,{exact:true}).click()
  await context.getByRole('button',{name:'Preview linked source page'}).click()
  await context.getByRole('button',{name:'Add source excerpt'}).click()
  await expect(context.getByRole('region',{name:'Attached source excerpt'})).toContainText(excerpt)
  expect(await page.evaluate(key=>[localStorage.getItem(key+':question'),localStorage.getItem(key+':source')],draftKey)).toEqual([text,null])
  const alert=context.getByRole('alert').filter({hasText:warning})
  await expect(alert).toBeVisible()
  await context.getByRole('button',{name:'Remove source excerpt'}).click()
  await expect(alert).toHaveCount(0)
  if(chat)await context.getByRole('button',{name:'Close',exact:true}).click()
  await expect(question).toHaveValue(text)
 })
}

test('live checkpoint restores a lost acknowledgement, accepts a reviewed paste and opens its exact card proposal',async({page})=>{
 const {owner,cpId,threadId,projectId,proposalId,payload}=await prepareLiveTutor(page)
 let thread:TutorThreadView={head:{threadId:null,pendingTurnId:null,lastSequence:0},turns:[],recoveredDrafts:[],canSubmit:true,canConnect:false}
 let startCount=0
 let startCommand:Record<string,unknown>|undefined
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/rest/v1/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.split('/rest/v1/')[1]
  if(path.startsWith('rpc/tutor_')){
   const args=request.postDataJSON()
   expect([args.p_owner,args.p_slug,args.p_checkpoint]).toEqual([owner,'logic',cpId])
   if(path==='rpc/tutor_thread_state')return route.fulfill({json:thread})
   const c=args.p_command
   if(c.operation==='start'){
    startCount++
    if(startCount===1){
     startCommand=c
     const turn={id:c.operationId,threadId,sequence:1,status:'awaiting-tutor' as const,version:1,snapshot:{question:c.question,selectedContext:[]}}
     thread={...thread,head:{threadId,pendingTurnId:turn.id,lastSequence:1},turns:[turn]}
     return route.abort('failed') // The request committed; the browser did not receive its receipt.
    }
    expect(c).toEqual(startCommand);return route.fulfill({json:{status:'submitted',operationId:c.operationId}})
   }
   const turn=thread.turns[0]
   if(c.operation==='manual'){
    expect(c.body).toBe('A reviewed paste.')
    thread={...thread,head:{...thread.head,pendingTurnId:null},turns:[{...turn,status:'completed',version:2,
     finalReply:{body:c.body,turnId:turn.id,messageId:c.messageId,provenance:{kind:'manual-import',label:'Imported by you'},citations:[],suggestions:[]}}]}
    return route.fulfill({json:{status:'completed',operationId:c.operationId}})
   }
   if(c.operation==='suggest_card'&&turn.status==='completed'){
    const first={id:'77777777-7777-4777-8777-777777777777',kind:'card',project_id:projectId,user_id:owner,origin:'other',
     status:'pending',created_at:'2026-10-01',payload:{type:'basic',kind:'other',front:'Earlier unrelated card',back:'Earlier answer'}}
    payload.proposals=[first,{...first,id:proposalId,created_at:'2026-10-02',payload:{...first.payload,front:c.front,back:c.back}}]
    thread={...thread,turns:[{...turn,finalReply:{...turn.finalReply,suggestions:[{kind:'card',proposalId,intentId:'suggestion',status:'pending',summary:'From a reviewed tutor reply'}]}}]}
    return route.fulfill({json:{status:'proposed',operationId:c.operationId}})
   }
   return route.fulfill({status:400,json:{code:'22023'}})
  }
  let result=payload[path]??[]
  if(request.headers()['accept']?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]??null
  return route.fulfill({json:result})
 })
 await page.goto('/lemma/?demo=0&flags=v7Shell,padLocal,tutorThreads#/pad?path=logic&checkpoint=CP1')
 const open=page.getByRole('button',{name:'Open checkpoint tutor'})
 await open.click()
 const dialog=page.getByRole('dialog',{name:'Checkpoint tutor'})
 await dialog.getByLabel('Question',{exact:true}).fill('Can I reverse this implication?')
 await dialog.getByRole('button',{name:'Save question',exact:true}).click()
 await expect(dialog.getByRole('region',{name:'Pending tutor submission'})).toContainText('Can I reverse this implication?')
 await page.reload()
 await open.click()
 await expect(dialog.getByLabel('Text for your tutor')).toHaveValue('Can I reverse this implication?')
 await expect(dialog.getByRole('region',{name:'Pending tutor submission'})).toHaveCount(0)
 expect(startCount).toBe(2)
 await dialog.getByLabel('Paste reply').fill('A reviewed paste.')
 await dialog.getByRole('button',{name:'Preview import'}).click()
 await expect(dialog.getByRole('region',{name:'Import preview'})).toContainText('A reviewed paste.')
 await dialog.getByRole('button',{name:'Confirm import'}).click()
 const result=dialog.getByRole('article',{name:'Imported reply'})
 await expect(result.getByRole('heading',{name:'Imported by you'})).toBeVisible()
 await result.getByText('Draft a card from this reply').click()
 await result.getByLabel('Front').fill('Is the converse always true?')
 await result.getByLabel('Back').fill('It needs a separate proof.')
 await result.getByRole('button',{name:'Send to proposal review'}).click()
 await expect(result.getByRole('link',{name:'Review proposal'})).toHaveAttribute('href',new RegExp('/proposals[?]card='+proposalId+'$'))
 await result.getByRole('link',{name:'Review proposal'}).click()
 await expect(page.locator('[data-proposal="'+proposalId+'"]')).toContainText('Is the converse always true?')
 expect(errors).toEqual([])
})

const savedThread=(threadId:string):TutorThreadView=>({
 head:{threadId,pendingTurnId:null,lastSequence:1},canSubmit:false,canConnect:false,recoveredDrafts:[],
 turns:[{id:'saved-turn',threadId,sequence:1,version:2,status:'completed',snapshot:{question:'Previously saved question',selectedContext:[]},
  finalReply:{turnId:'saved-turn',messageId:'saved-reply',body:'Previously confirmed answer',provenance:{kind:'manual-import',label:'Imported by you'},citations:[],suggestions:[]}}],
})

test('global hold keeps owner history and receipt recovery available without submitting new work',async({page})=>{
 const {owner,cpId,threadId,payload}=await prepareLiveTutor(page,false)
 const state=savedThread(threadId),receipts:string[]=[],writes:unknown[]=[]
 const committed={operation:'start',operationId:'77777777-7777-4777-8777-777777777777',expectedVersion:0,question:'Previously saved question'}
 const unconfirmed={operation:'start',operationId:'88888888-8888-4888-8888-888888888888',expectedVersion:1,question:'Never submitted question'}
 await page.addInitScript(({owner,cpId,committed,unconfirmed})=>{
  const key=JSON.stringify([owner,'logic',cpId])
  for(const command of [committed,unconfirmed])localStorage.setItem('lemma.tutor.pending.v1:'+key+':'+command.operationId,JSON.stringify(command))
  localStorage.setItem('lemma.tutor.draft:'+key+':question','A later unsent question')
 },{owner,cpId,committed,unconfirmed})
 await page.route('**/rest/v1/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.split('/rest/v1/')[1]
  if(path==='rpc/tutor_thread_state')return route.fulfill({json:state})
  if(path==='rpc/tutor_owner_receipt'){
   const args=request.postDataJSON(),command=args.p_command
   expect([args.p_owner,args.p_slug,args.p_checkpoint]).toEqual([owner,'logic',cpId])
   receipts.push(command.operationId)
   return route.fulfill({json:{operationId:command.operationId,status:command.operationId===committed.operationId?'submitted':'unconfirmed'}})
  }
  if(path==='rpc/tutor_owner_command'){writes.push(request.postDataJSON());return route.fulfill({status:503,json:{code:'55000'}})}
  let data=payload[path]??[]
  if(request.headers()['accept']?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null
  return route.fulfill({json:data})
 })
 await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads#/p/logic/cp/CP1/tutor')
 const tutor=page.getByRole('main',{name:'Checkpoint tutor'})
 await expect(tutor.getByRole('article',{name:'Imported reply'})).toContainText('Previously confirmed answer')
 const draft=tutor.getByRole('textbox',{name:'Your answer'})
 await expect(draft).toHaveValue('A later unsent question')
 await expect(draft).toHaveJSProperty('readOnly',true)
 await expect(tutor.getByRole('region',{name:'Pending tutor submission'})).toContainText('Never submitted question')
 await expect(tutor.getByRole('button',{name:'Send',exact:true})).toBeDisabled()
 await expect(tutor.getByText('Draft a card from this reply')).toHaveCount(0)
 await tutor.getByRole('button',{name:'Check saved receipt'}).click()
 await expect(tutor.getByRole('alert')).toContainText('No saved receipt was found')
 expect(receipts).toContain(committed.operationId);expect(receipts).toContain(unconfirmed.operationId)
 expect(writes).toEqual([])
 const retained=await page.evaluate(({owner,cpId,operationId})=>localStorage.getItem('lemma.tutor.pending.v1:'+JSON.stringify([owner,'logic',cpId])+':'+operationId),{owner,cpId,operationId:unconfirmed.operationId})
 expect(JSON.parse(retained!)).toEqual(unconfirmed)
})

test('a previously available checkpoint reopens its confirmed conversation offline in recovery-only mode',async({page,context})=>{
 const {threadId,payload}=await prepareLiveTutor(page)
 const saved=savedThread(threadId)
 const state:TutorThreadView={...saved,head:{threadId,pendingTurnId:'pending-turn',lastSequence:2},canSubmit:true,canConnect:true,
  turns:[...saved.turns,{id:'pending-turn',threadId,sequence:2,version:1,status:'awaiting-tutor',snapshot:{question:'A sealed pending question',selectedContext:[]}}]}
 let offline=false
 const writes:unknown[]=[]
 await page.route('**/rest/v1/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.split('/rest/v1/')[1]
  if(offline)return route.abort('internetdisconnected')
  if(path==='rpc/tutor_thread_state')return route.fulfill({json:state})
  if(path==='rpc/tutor_owner_command'){writes.push(request.postDataJSON());return route.fulfill({status:503,json:{code:'55000'}})}
  let data=payload[path]??[]
  if(request.headers()['accept']?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null
  return route.fulfill({json:data})
 })
 await page.goto('/lemma/?demo=0&flags=v7Shell,padLocal,tutorThreads#/pad?path=logic&checkpoint=CP1')
 const open=page.getByRole('button',{name:'Open checkpoint tutor'}),dialog=page.getByRole('dialog',{name:'Checkpoint tutor'})
 await open.click()
 await expect(dialog.getByRole('article',{name:'Imported reply'})).toContainText('Previously confirmed answer')
 await dialog.getByRole('button',{name:'Close',exact:true}).click()
 offline=true;await context.setOffline(true)
 await open.click()
 await expect(dialog.getByRole('status').filter({hasText:'Offline.'})).toBeVisible()
 await expect(dialog.getByRole('article',{name:'Imported reply'})).toContainText('Previously confirmed answer')
 await expect(dialog.getByLabel('Text for your tutor')).toHaveValue('A sealed pending question')
 await expect(dialog.getByRole('button',{name:'Preview import'})).toHaveCount(0)
 await expect(dialog.getByRole('button',{name:'Create a connector grant for this question'})).toHaveCount(0)
 await expect(dialog.getByRole('button',{name:'Cancel question',exact:true})).toHaveCount(0)
 expect(writes).toEqual([])
})
