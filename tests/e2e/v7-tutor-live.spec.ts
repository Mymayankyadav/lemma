import {expect,test,type Page} from '@playwright/test'
import type {TutorThreadView} from '../../src/data/tutor/manual-api'
import {liveTutorFixtureResponse,prepareLiveTutor} from './helpers/live-tutor'

for(const queued of [false,true]){
 test(queued?'Reconnect keeps a queued answer with missing images editable':'Scratch off still blocks a restored image reference',async({page})=>{
  const {owner,cpId,payload}=await prepareLiveTutor(page)
  const thread:TutorThreadView={head:{threadId:null,lastSequence:0,pendingTurnId:null},turns:[],recoveredDrafts:[],canSubmit:true,canConnect:false}
  const starts:{endpoint:string;question:string}[]=[]
  await page.route('**/rest/v1/**',route=>{
   const request=route.request(),endpoint=new URL(request.url()).pathname.split('/rest/v1/')[1]
   if(endpoint==='rpc/tutor_thread_state')return route.fulfill({json:thread})
   if(endpoint==='rpc/tutor_owner_command'||endpoint==='rpc/tutor_owner_ink_command'){
    const {p_command:command}=request.postDataJSON()
    starts.push({endpoint,question:command.question})
    return route.fulfill({json:{operationId:command.operationId,status:'submitted'}})
   }
   return route.fulfill({json:liveTutorFixtureResponse(payload,endpoint,request.headers().accept)})
  })
  const flags='/lemma/?demo=0&flags=v7Shell,tutorThreads,'+(queued?'tutorScratch':'-tutorScratch')+'#'
  await page.goto(flags+'/settings?section=data')
  await expect(page.getByRole('heading',{name:'Data and account',exact:true})).toBeVisible()
  const key='lemma.tutor.draft:'+JSON.stringify([owner,'logic',cpId])
  const text='Keep this explanation.'
  await page.evaluate(async ({key,text,queued})=>{
   const question=text+'[[lemma-image:12345678-0123-4123-8123-123456789abc]]'
   localStorage.setItem(key+':question',question)
   if(queued)await new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('lemma-tutor-ink',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts')
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{
     const db=request.result,tx=db.transaction('drafts','readwrite')
     tx.objectStore('drafts').put({strokes:[],photos:[],width:3,accent:false,queuedText:question},key+':ink')
     tx.oncomplete=()=>{db.close();resolve()}
     tx.onabort=()=>{db.close();reject(tx.error)}
    }
   })
  },{key,text,queued})
  await page.evaluate(()=>{location.hash='/p/logic/cp/CP1/tutor'})
  await expect(page).toHaveURL(/#\/p\/logic\/cp\/CP1\/tutor$/)
  const send=page.getByRole('button',{name:'Send',exact:true}),answer=page.getByRole('textbox',{name:'Your answer',exact:true})
  if(queued){
   await expect(page.getByText('Queued answer needs its images.',{exact:false})).toBeVisible()
   await expect(answer).toHaveAttribute('aria-readonly','true')
   await page.getByRole('button',{name:'Keep as draft',exact:true}).click()
  }
  await expect(send).toBeDisabled()
  await answer.press('Control+Enter')
  expect(starts).toEqual([])
  await page.getByRole('button',{name:queued?'Remove image unavailable':'Remove image references',exact:true}).click()
  if(queued)await expect(answer).toHaveText(text)
  else await expect(answer).toHaveValue(text)
  await send.click()
  await expect.poll(()=>starts).toEqual([{endpoint:'rpc/tutor_owner_command',question:text}])
 })
}

test('Account deletion removes only that owner’s tutor ink and fences a delayed write in another tab',async({page,context})=>{
 const deletionPage=await context.newPage()
 const {owner,cpId,payload}=await prepareLiveTutor(page)
 await prepareLiveTutor(deletionPage)
 const mockRest=(target:Page)=>target.route('**/rest/v1/**',route=>{
  const request=route.request(),resource=new URL(request.url()).pathname.split('/rest/v1/')[1]
  if(resource==='rpc/tutor_thread_state')return route.fulfill({json:{head:{threadId:null,lastSequence:0,pendingTurnId:null},
   turns:[],recoveredDrafts:[],canSubmit:true,canConnect:false}})
  return route.fulfill({json:liveTutorFixtureResponse(payload,resource,request.headers().accept)})
 })
 await mockRest(page);await mockRest(deletionPage)
 await deletionPage.route('**/functions/v1/account-delete',route=>route.fulfill({json:{deleted:true}}))
 const flags='/lemma/?demo=0&flags=v7Shell,tutorThreads,tutorScratch#'
 await page.goto(flags+'/settings?section=data')
 await expect(page.getByRole('heading',{name:'Data and account',exact:true})).toBeVisible()
 const liveKey=(id:string,checkpoint:string)=>'lemma.tutor.draft:'+JSON.stringify([id,'logic',checkpoint])+':ink'
 const currentKey=liveKey(owner,cpId),priorKey=liveKey(owner,'earlier-checkpoint')
 const preserved=[liveKey(owner+'-other',cpId),'lemma.demo-tutor:'+JSON.stringify(['default','logic',cpId])+':ink'].sort()
 await page.evaluate(async ({priorKey,preserved})=>{
  await new Promise<void>((resolve,reject)=>{
   const request=indexedDB.open('lemma-tutor-ink',1)
   request.onupgradeneeded=()=>request.result.createObjectStore('drafts')
   request.onerror=()=>reject(request.error)
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts')
    const draft={strokes:[[{x:4,y:5}]],width:3,accent:false,inlineImages:true,queuedText:'Queued private answer',
     photos:[{id:'12345678-0123-4123-8123-123456789abc',kind:'photo',mimeType:'image/jpeg',blob:new Blob(['image'])}]}
    for(const key of [priorKey,...preserved])store.put(draft,key)
    tx.oncomplete=()=>{db.close();resolve()}
    tx.onabort=()=>{db.close();reject(tx.error)}
   }
  })
 },{priorKey,preserved})
 await page.evaluate(()=>{location.hash='/p/logic/cp/CP1/tutor'})
 await expect(page).toHaveURL(/#\/p\/logic\/cp\/CP1\/tutor$/)
 await page.getByRole('button',{name:'Write a question',exact:true}).click()
 await page.getByRole('button',{name:'Scratch',exact:true}).click()
 await expect(page.getByRole('button',{name:'Pen',exact:true})).toBeEnabled()
 await page.evaluate(()=>{
  const open=IDBFactory.prototype.open
  IDBFactory.prototype.open=function(name,version){
   const request=open.call(this,name,version)
   if(name==='lemma-tutor-ink'){
    IDBFactory.prototype.open=open
    request.addEventListener('success',event=>{
     event.stopImmediatePropagation()
     window.addEventListener('release-delayed-tutor-write',()=>request.onsuccess?.call(request,event),{once:true})
     document.documentElement.dataset.tutorInkWriteHeld='true'
    },{once:true})
   }
   return request
  }
 })
 const paper=await page.getByRole('region',{name:'Drawing paper'}).boundingBox()
 await page.mouse.click(paper!.x+25,paper!.y+30)
 await expect(page.locator('html')).toHaveAttribute('data-tutor-ink-write-held','true')
 await deletionPage.goto(flags+'/settings?section=data')
 await deletionPage.getByRole('button',{name:'Delete…',exact:true}).click()
 const dialog=deletionPage.getByRole('dialog',{name:'Delete your account?',exact:true})
 await dialog.getByRole('checkbox').check()
 await dialog.getByRole('textbox').fill('DELETE MY ACCOUNT')
 await dialog.getByRole('button',{name:'Delete account permanently',exact:true}).click()
 await expect(deletionPage).toHaveURL(/#\/sign-in/)
 await page.evaluate(()=>window.dispatchEvent(new Event('release-delayed-tutor-write')))
 const retained=await page.evaluate(()=>new Promise<IDBValidKey[]>((resolve,reject)=>{
  const request=indexedDB.open('lemma-tutor-ink')
  request.onerror=()=>reject(request.error)
  request.onsuccess=()=>{
   const db=request.result,tx=db.transaction('drafts'),keys=tx.objectStore('drafts').getAllKeys()
   tx.oncomplete=()=>{db.close();resolve(keys.result)}
   tx.onabort=()=>{db.close();reject(tx.error)}
  }
 }))
 expect(retained).toEqual(preserved)
 expect(retained).not.toContain(currentKey)
})

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
  await page.goto('/lemma/?demo=0&flags=v7Shell,padLocal,tutorThreads,-tutorScratch#'+(chat?'/p/logic/cp/CP1/tutor':'/pad?path=logic&checkpoint=CP1'))
  const tutor=page.getByRole(chat?'main':'dialog',{name:'Checkpoint tutor'})
  if(chat)await tutor.getByRole('button',{name:'Write a question',exact:true}).click()
  else await page.getByRole('button',{name:'Open checkpoint tutor',exact:true}).click()
  const question=tutor.getByRole('textbox',{name:chat?'Your answer':'Question',exact:true})
  const text='Can I reverse this implication?'
  await question.fill(text)
  const warning=/draft.*may be lost on reload/i
  await expect(tutor.getByRole('alert').filter({hasText:warning})).toHaveCount(0)

  if(chat){
   await tutor.getByRole('button',{name:'Edit answer',exact:true}).click()
   await tutor.getByRole('dialog',{name:'Answer actions',exact:true}).getByRole('button',{name:'Context',exact:true}).click()
  }
  const context=chat?page.getByRole('dialog',{name:'Context for your tutor'}):tutor
  await context.getByText('Add a page from '+short,{exact:true}).click()
  await context.getByRole('button',{name:'Preview page'}).click()
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
 await page.goto('/lemma/?demo=0&flags=v7Shell,padLocal,tutorThreads,-tutorScratch#/pad?path=logic&checkpoint=CP1')
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
 await result.getByRole('button',{name:'Make a card from this reply',exact:true}).click()
 await result.getByLabel('Front').fill('Is the converse always true?')
 await result.getByLabel('Back').fill('It needs a separate proof.')
 await result.getByRole('button',{name:'Propose card'}).click()
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
 await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads,-tutorScratch#/p/logic/cp/CP1/tutor')
 const tutor=page.getByRole('main',{name:'Checkpoint tutor'})
 await expect(tutor.getByRole('article',{name:'Imported reply'})).toContainText('Previously confirmed answer')
 const draft=tutor.getByRole('textbox',{name:'Your answer'})
 await expect(draft).toHaveValue('A later unsent question')
 await expect(draft).toHaveJSProperty('readOnly',true)
 await expect(tutor.getByRole('region',{name:'Pending tutor submission'})).toContainText('Never submitted question')
 await expect(tutor.getByRole('button',{name:'Send',exact:true})).toBeDisabled()
 await expect(tutor.getByRole('button',{name:'Make a card from this reply',exact:true})).toHaveCount(0)
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
 await page.goto('/lemma/?demo=0&flags=v7Shell,padLocal,tutorThreads,-tutorScratch#/pad?path=logic&checkpoint=CP1')
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
