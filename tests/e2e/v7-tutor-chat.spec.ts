import {expect,test,type Page} from '@playwright/test'
import type {SavedTutorTurn,TutorThreadView} from '../../src/data/tutor/manual-api'
import {liveTutorFixtureResponse,prepareLiveTutor} from './helpers/live-tutor'

const tutor = (page:Page) => page.getByRole('main',{name:'Checkpoint tutor'})
const transcript = (page:Page) => tutor(page).getByRole('log',{name:'Conversation'})
const answer = (page:Page) => tutor(page).getByRole('textbox',{name:'Your answer',exact:true})
const send = (page:Page) => tutor(page).getByRole('button',{name:'Send',exact:true})
const mainNavigation = (page:Page) => page.getByRole('navigation',{name:'Main navigation'})
const path = (slug:string,demo:boolean,suffix='') => '/lemma/?demo=' + (demo?'1':'0') + '&flags=v7Shell,v6Shell,-tutorScratch#/p/' + slug + suffix
const firstAnswer = 'A set is compact if every open cover has a finite subcover.'
const nextQuestion = 'How would you use this definition for a closed interval?'

async function continueFromPath(page:Page,slug:string,demo=true) {
 await page.goto(path(slug,demo),{waitUntil:'domcontentloaded'})
 const launch=page.getByRole('button',{name:'Continue with tutor',exact:true})
 await expect(launch).toBeVisible()
 await expect(page.getByRole('link',{name:/lemma pad/i})).toHaveCount(0)
 await launch.click()
 await expect(tutor(page)).toBeVisible()
}

async function openComposer(page:Page) {
 await tutor(page).getByRole('button',{name:'Write a question',exact:true}).click()
 await expect(answer(page)).toBeEditable()
}

async function undoTyping(page:Page) {
 await tutor(page).getByRole('button',{name:'Session actions',exact:true}).click()
 await tutor(page).getByRole('dialog',{name:'Study session',exact:true}).getByRole('button',{name:'Undo typing',exact:true}).click()
}

async function sessionActions(page:Page) {
 await tutor(page).getByRole('button',{name:'Session actions',exact:true}).click()
 const actions=page.getByRole('dialog',{name:'Study session',exact:true})
 await expect(actions).toBeVisible()
 return actions
}

async function openConnection(page:Page) {
 const actions=await sessionActions(page)
 await actions.getByRole('button',{name:'Connection',exact:true}).click()
 return page.getByRole('dialog',{name:'Connection',exact:true})
}

test('numbered Markdown answers show compact markers beside inline maths',async({page})=>{
 await page.goto(path('real-analysis',true,'/cp/CP4/tutor'))
 await openComposer(page)
 await answer(page).fill('1. $q^{-1}(U)$ is open.\n\n2. Check whether the converse holds for all continuous surjections.')
 await send(page).click()
 const list=transcript(page).getByLabel('Your saved answer').getByRole('list')
 const items=list.getByRole('listitem')
 await expect(items).toHaveCount(2)
 await expect(items.first().locator('.katex')).toBeVisible()
 const metrics=await list.evaluate(node=>{
  const first=node.children[0],second=node.children[1]
  const css=getComputedStyle(node),paragraph=first.querySelector('p')!
  return {markers:css.listStyleType,gutter:parseFloat(css.paddingInlineStart),font:parseFloat(css.fontSize),
    gap:second.getBoundingClientRect().top-first.getBoundingClientRect().bottom,
    trailing:node.getBoundingClientRect().bottom-second.getBoundingClientRect().bottom,
    paragraphMargin:getComputedStyle(paragraph).marginBlockEnd}
 })
 expect(metrics.markers).toBe('decimal')
 expect(metrics.gutter).toBeGreaterThan(metrics.font)
 expect(metrics.gutter).toBeLessThan(metrics.font*1.5)
 expect(metrics.gap).toBeLessThan(6)
 expect(metrics.trailing).toBeLessThan(2)
 expect(metrics.paragraphMargin).toBe('0px')
})

test('Continue with tutor opens the current checkpoint and keeps demo turns after reloading',async({page})=>{
 await continueFromPath(page,'real-analysis')
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4\/tutor$/)
 await expect(tutor(page).getByRole('heading',{name:'Compactness',exact:true})).toBeVisible()
 await expect(tutor(page).getByRole('navigation',{name:'Session parts'})).toBeVisible()
 await expect(page.getByRole('link',{name:/lemma pad/i})).toHaveCount(0)
 await openComposer(page)
 await answer(page).fill(firstAnswer)
 await send(page).click()
 await expect(transcript(page)).toContainText(firstAnswer)
 await expect(send(page)).toBeDisabled()
 const dialog=await openConnection(page)
 await dialog.getByLabel('Paste reply').fill(nextQuestion)
 await dialog.getByRole('button',{name:'Preview import'}).click()
 await dialog.getByRole('button',{name:'Confirm import'}).click()
 await dialog.getByRole('button',{name:'Close',exact:true}).click()
 await expect(transcript(page).getByRole('article',{name:'Imported reply'})).toContainText(nextQuestion)
 await page.reload({waitUntil:'domcontentloaded'})
 await expect(transcript(page)).toContainText(firstAnswer)
 await expect(transcript(page)).toContainText(nextQuestion)
 await answer(page).fill('Take an arbitrary open cover of the interval.')
 await send(page).click()
 await expect(transcript(page)).toContainText('Take an arbitrary open cover of the interval.')
 await expect(transcript(page).getByRole('article',{name:'Imported reply'})).toHaveCount(1)
})

test('long-press selects tutor and learner messages for copy and durable deletion without a gap',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{
  sessionStorage.setItem('last-tutor-copy',value)
 }}}))
 await page.goto(path('real-analysis',true,'/cp/CP4/tutor'))
 await openComposer(page)
 await answer(page).fill(firstAnswer)
 await send(page).click()
 const dialog=await openConnection(page)
 await dialog.getByLabel('Paste reply').fill(nextQuestion)
 await dialog.getByRole('button',{name:'Preview import'}).click()
 await dialog.getByRole('button',{name:'Confirm import'}).click()
 await dialog.getByRole('button',{name:'Close',exact:true}).click()
 const secondAnswer='I choose a finite subcover.'
 await answer(page).fill(secondAnswer)
 await send(page).click()
 const log=transcript(page)
 const first=log.locator('[data-tutor-message^="question:"]').first()
 const second=log.locator('[data-tutor-message^="question:"]').last()
 const reply=log.locator('[data-tutor-message^="reply:"]')
 const bar=tutor(page).getByRole('group',{name:'Selected messages'})
 await expect(second).toHaveText(secondAnswer)
 await reply.hover()
 await page.mouse.down()
 await expect(bar).toContainText('1 selected')
 await page.mouse.up()
 await expect(reply).toHaveAttribute('aria-checked','true')
 await second.click()
 await expect(bar).toContainText('2 selected')
 await expect(log.locator('.tutor-details')).toBeHidden()
 await expect.poll(async()=>{
  const [top,middle,bottom]=await Promise.all([first.boundingBox(),reply.boundingBox(),second.boundingBox()])
  return top&&middle&&bottom?[Math.round(middle.y-top.y-top.height),Math.round(bottom.y-middle.y-middle.height)]:[]
 }).toEqual([16,16])
 await bar.getByRole('button',{name:'Copy',exact:true}).click()
 expect(await page.evaluate(()=>sessionStorage.getItem('last-tutor-copy'))).toBe(nextQuestion+'\n\n'+secondAnswer)
 await expect(bar).toBeHidden()
 await reply.press('Space')
 await second.press('Space')
 await bar.getByRole('button',{name:'Delete',exact:true}).click()
 const confirm=page.getByRole('dialog',{name:'Delete selected messages?'})
 await confirm.getByRole('button',{name:'Cancel'}).click()
 await expect(reply).toBeVisible()
 await bar.getByRole('button',{name:'Delete',exact:true}).click()
 await confirm.getByRole('button',{name:'Delete',exact:true}).click()
 await expect(log).toContainText(firstAnswer)
 await expect(log).not.toContainText(nextQuestion)
 await expect(log).not.toContainText(secondAnswer)
 await page.reload({waitUntil:'domcontentloaded'})
 await expect(log).toContainText(firstAnswer)
 await expect(log).not.toContainText(nextQuestion)
 await expect(log).not.toContainText(secondAnswer)
})

test('Tutor hides main navigation and keeps conversation and draft through Back, Search and Appearance',async({page})=>{
 await page.addInitScript(()=>{
  const pulses:number[]=[]
  Object.assign(window,{tutorVibrationPulses:pulses})
  Object.defineProperty(navigator,'vibrate',{value:(pattern:number)=>{pulses.push(pattern);return true}})
 })
 const vibrationCount=()=>page.evaluate(()=>(window as Window & {tutorVibrationPulses:number[]}).tutorVibrationPulses.length)
 await continueFromPath(page,'real-analysis')
 await openComposer(page)
 await tutor(page).getByRole('button',{name:'Keys',exact:true}).click()
 const q=tutor(page).getByRole('group',{name:'Answer keyboard',exact:true}).getByRole('button',{name:'q',exact:true})
 const beforeFirstKey=await vibrationCount()
 await q.click()
 await expect(answer(page)).toHaveValue('q')
 expect(await vibrationCount()).toBe(beforeFirstKey+1)
 await answer(page).fill(firstAnswer)
 await send(page).click()
 await expect(transcript(page)).toContainText(firstAnswer)
 const draft='My next answer is still a draft.'
 await answer(page).fill(draft)

 await expect(mainNavigation(page)).not.toBeInViewport()
 await tutor(page).getByRole('button',{name:'Back',exact:true}).click()
 await expect(page).toHaveURL(/#\/p\/real-analysis$/)
 await expect(mainNavigation(page)).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Continue with tutor',exact:true})).toBeVisible()
 await page.goForward()
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4\/tutor$/)
 await expect(transcript(page)).toContainText(firstAnswer)
 await expect(answer(page)).toHaveValue(draft)

 await (await sessionActions(page)).getByRole('button',{name:'Search',exact:true}).click()
 const search=page.getByRole('dialog',{name:'Search',exact:true})
 await search.getByRole('combobox',{name:'Search'}).fill('appearance')
 await search.getByRole('option',{name:'Appearance',exact:true}).click()
 await expect(page).toHaveURL(/#\/settings\?section=appearance$/)
 await expect(mainNavigation(page)).toBeInViewport()
 await page.getByRole('radio',{name:/^Day/}).click()
 await expect(page.locator('html')).toHaveAttribute('data-appearance-mode','day')
 const haptics=page.getByRole('switch',{name:'Haptics',exact:true})
 await haptics.click()
 await expect(haptics).not.toBeChecked()
 await page.goBack()
 await expect(search.getByRole('combobox',{name:'Search'})).toHaveValue('appearance')
 await search.getByRole('button',{name:'Close',exact:true}).click()
 await expect(search).not.toBeVisible()
 await expect(tutor(page)).toBeVisible()
 await expect(mainNavigation(page)).not.toBeInViewport()
 await expect(page.locator('html')).toHaveAttribute('data-appearance-mode','day')
 await expect(transcript(page)).toContainText(firstAnswer)
 await expect(answer(page)).toHaveValue(draft)
 await answer(page).press('End')
 const beforeSilentKey=await vibrationCount()
 await q.click()
 await expect(answer(page)).toHaveValue(draft+'q')
 expect(await vibrationCount()).toBe(beforeSilentKey)
})

test('Back from a direct tutor link opens the checkpoint inside Lemma',async({page})=>{
 await page.goto(path('real-analysis',true,'/tutor'),{waitUntil:'domcontentloaded'})
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4\/tutor$/)
 await expect(tutor(page).getByRole('heading',{name:'Compactness',exact:true})).toBeVisible()
 await tutor(page).getByRole('button',{name:'Back',exact:true}).click()
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4$/)
 await expect(page.getByRole('heading',{name:'Compactness',exact:true})).toBeVisible()
 await expect(mainNavigation(page)).toHaveCount(0)
})

test('demo chat warns when context or an excerpt cannot be saved with an already saved draft',async({page})=>{
 await page.goto(path('real-analysis',true,'/cp/CP4/tutor'),{waitUntil:'domcontentloaded'})
 await openComposer(page)
 const text='How do I show this cover is finite?'
 const excerpt='Start with the interval [0, 1].'
 const draftKey='lemma.demo-tutor:'+JSON.stringify(['default','real-analysis','project-analysis-cp-4'])
 await answer(page).fill(text)
 await page.evaluate(draftKeys=>{
  const setItem=Storage.prototype.setItem
  Storage.prototype.setItem=function(name,value){
   if(this===sessionStorage&&draftKeys.includes(name))throw new DOMException('Storage full','QuotaExceededError')
   setItem.call(this,name,value)
  }
 },[draftKey+':context',draftKey+':attached-local'])
 const warning=/draft.*may be lost on reload/i
 await expect(tutor(page).getByRole('alert').filter({hasText:warning})).toHaveCount(0)
 await tutor(page).getByRole('button',{name:'Attach context',exact:true}).click()
 const context=page.getByRole('dialog',{name:'Context for your tutor'})
 const alert=context.getByRole('alert').filter({hasText:warning})
 const objective=context.getByRole('checkbox',{name:'Include this checkpoint’s objective'})
 await objective.check()
 await expect(objective).toBeChecked()
 await expect(alert).toBeInViewport()
 await objective.uncheck()
 await expect(alert).toHaveCount(0)
 await context.getByText('Add an excerpt',{exact:true}).click()
 await context.getByLabel('Excerpt',{exact:true}).fill(excerpt)
 await context.getByRole('button',{name:'Preview excerpt'}).click()
 await context.getByRole('button',{name:'Add local excerpt'}).click()
 await expect(context.getByRole('region',{name:'Attached local excerpt'})).toContainText(excerpt)
 expect(await page.evaluate(key=>[sessionStorage.getItem(key+':question'),sessionStorage.getItem(key+':attached-local')],draftKey)).toEqual([text,null])
 await expect(alert).toBeInViewport()
 await context.getByRole('button',{name:'Close',exact:true}).click()
 await expect(tutor(page).getByRole('alert').filter({hasText:warning})).toBeVisible()
 await expect(answer(page)).toHaveValue(text)
 await send(page).click()
 await expect(transcript(page)).toContainText(text)
 await expect(tutor(page).getByRole('alert').filter({hasText:warning})).toHaveCount(0)
 const connection=await openConnection(page)
 await expect(connection.getByLabel('Text for your tutor')).toHaveValue(
  text+'\n\nLocal excerpt (learner-provided; not a citation):\n'+excerpt,
 )
})

for(const action of ['objective','local excerpt'] as const){
 test('demo chat saves the pending question before a quota-rejected '+action,async({page})=>{
  await page.goto(path('real-analysis',true,'/cp/CP4/tutor'),{waitUntil:'domcontentloaded'})
  await openComposer(page)
  const now=Date.now()
  await page.clock.install({time:now})
  await page.clock.pauseAt(now+1000)

  const text='How do I show this cover is finite?'
  const excerpt='Start with the interval [0, 1].'
  const draftKey='lemma.demo-tutor:'+JSON.stringify(['default','real-analysis','project-analysis-cp-4'])
  const stored=()=>page.evaluate(key=>['question','context','attached-local'].map(part=>sessionStorage.getItem(key+':'+part)),draftKey)
  await answer(page).fill(text)
  expect(await stored()).toEqual([null,null,null])
  await page.evaluate(draftKeys=>{
   const setItem=Storage.prototype.setItem
   Storage.prototype.setItem=function(key,value){
    if(this===sessionStorage&&draftKeys.includes(key))throw new DOMException('Storage full','QuotaExceededError')
    setItem.call(this,key,value)
   }
  },[draftKey+':context',draftKey+':attached-local'])

  await tutor(page).getByRole('button',{name:'Attach context',exact:true}).click()
  const context=page.getByRole('dialog',{name:'Context for your tutor'})
  if(action==='objective'){
   const objective=context.getByRole('checkbox',{name:'Include this checkpoint’s objective'})
   await objective.check()
   await expect(objective).toBeChecked()
  }else{
   await context.getByText('Add an excerpt',{exact:true}).click()
   await context.getByLabel('Excerpt',{exact:true}).fill(excerpt)
   await context.getByRole('button',{name:'Preview excerpt'}).click()
   await context.getByRole('button',{name:'Add local excerpt'}).click()
   await expect(context.getByRole('region',{name:'Attached local excerpt'})).toContainText(excerpt)
  }
  await expect(context.getByRole('alert').filter({hasText:/draft.*may be lost on reload/i})).toBeVisible()
  expect(await stored()).toEqual([text,null,null])
 })
}

test('Continue with tutor lets the learner choose a checkpoint when the path has no current checkpoint',async({page})=>{
 const {payload}=await prepareLiveTutor(page)
 const checkpoint=(payload.checkpoints as Record<string,unknown>[])[0]
 checkpoint.status='demonstrated'
 await page.route('**/rest/v1/**',route=>{
  const request=route.request(),resource=new URL(request.url()).pathname.split('/rest/v1/')[1]
  const json=resource==='rpc/tutor_thread_state'
   ? {head:{threadId:null,lastSequence:0,pendingTurnId:null},turns:[],recoveredDrafts:[],canSubmit:true,canConnect:false}
   : liveTutorFixtureResponse(payload,resource,request.headers().accept)
  return route.fulfill({json})
 })
 await continueFromPath(page,'logic',false)
 await expect(page).toHaveURL(/#\/p\/logic\/tutor$/)
 await expect(tutor(page).getByText('Choose a checkpoint to continue with your tutor.')).toBeVisible()
 await tutor(page).getByRole('link',{name:'Implications'}).click()
 await expect(page).toHaveURL(/#\/p\/logic\/cp\/CP1\/tutor$/)
 await expect(tutor(page).getByRole('heading',{name:'Implications',exact:true})).toBeVisible()
})

for(const {width,height,minTranscriptHeight} of [
 {width:320,height:640,minTranscriptHeight:160},
 {width:390,height:844,minTranscriptHeight:350},
 {width:1440,height:900,minTranscriptHeight:350},
]) {
 test('Tutor leaves room for the question, transcript and full keyboard at ' + width + ' px',async({page})=>{
  await page.setViewportSize({width,height})
  await continueFromPath(page,'real-analysis')
  await expect(tutor(page).getByRole('button',{name:'Begin session',exact:true})).toBeVisible()
  await expect(mainNavigation(page)).not.toBeInViewport()
  await expect(page.locator('iframe')).toHaveCount(0)
  await openComposer(page)
  await expect(mainNavigation(page)).not.toBeInViewport()
  if(width===390){
   const actions=await sessionActions(page)
   await actions.getByRole('button',{name:'Study timer',exact:true}).click()
   const timer=page.getByRole('dialog',{name:'Study timer',exact:true})
   await timer.getByRole('button',{name:'Start timer',exact:true}).click()
   await timer.getByRole('button',{name:'Pause timer',exact:true}).click()
   await expect(timer.getByRole('button',{name:'Resume timer',exact:true})).toBeVisible()
   await timer.getByRole('button',{name:'Close',exact:true}).click()
  }
  await answer(page).click()
  const keyboard=tutor(page).getByRole('group',{name:'Answer keyboard',exact:true})
  await keyboard.getByRole('button',{name:'Maths symbols',exact:true}).click()
  await expect(tutor(page).getByRole('group',{name:'Math categories'})).toBeInViewport()
  await tutor(page).getByRole('group',{name:'∀∃ keys'}).getByRole('button',{name:'∀',exact:true}).click()
  await expect(answer(page)).toHaveValue('∀')
  await undoTyping(page)
  await expect(answer(page)).toHaveValue('')
  await keyboard.getByRole('button',{name:'ABC',exact:true}).click()
  for(const key of ['q','a','z','Space']){
   await keyboard.getByRole('button',{name:key,exact:true}).click({trial:true})
  }

  const line='Start with an arbitrary open cover and show where a finite subcover arises.'
  const text=Array(22).fill(line).join('\n')
  await answer(page).fill(text)
  await send(page).click()
  const log=transcript(page)
  await expect(log).toContainText(line)
  await expect.poll(()=>log.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true)
  await log.evaluate(node=>{node.scrollTop=node.scrollHeight})
  await expect.poll(()=>log.evaluate(node=>node.scrollTop)).toBeGreaterThan(0)

  const connection=await openConnection(page)
  await connection.getByLabel('Paste reply').fill(nextQuestion)
  await connection.getByRole('button',{name:'Preview import'}).click()
  await connection.getByRole('button',{name:'Confirm import'}).click()
  await connection.getByRole('button',{name:'Close',exact:true}).click()
  const latestQuestion=log.getByRole('article',{name:'Imported reply'}).getByText(nextQuestion,{exact:true})
  await expect(latestQuestion).toBeVisible()
  await log.evaluate(node=>{node.scrollTop=0})
  const actions=await sessionActions(page)
  await actions.getByRole('button',{name:'Latest question',exact:true}).click()
  await expect(latestQuestion).toBeInViewport()

  await keyboard.scrollIntoViewIfNeeded()
  await expect(keyboard).toBeInViewport({ratio:.99})
  await expect(send(page)).toBeInViewport({ratio:.99})
  await expect(latestQuestion).toBeInViewport()
  const logBox=(await log.boundingBox())!
  const sendBox=(await send(page).boundingBox())!
  const availableQuestionSpace=Math.min(logBox.y+logBox.height,sendBox.y)-Math.max(0,logBox.y)
  expect(availableQuestionSpace,'visible transcript above the answer controls').toBeGreaterThanOrEqual(minTranscriptHeight)
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
 })
}

test('Keyboard autocomplete applies to newly typed text at the trailing caret',async({page})=>{
 await page.goto(path('real-analysis',true,'/cp/CP4/tutor'),{waitUntil:'domcontentloaded'})
 await openComposer(page)
 const editor=answer(page)
 await editor.fill('prei suffix')
 await editor.press('Home')
 for(let step=0;step<4;step++)await editor.press('ArrowRight')
 const suggestions=tutor(page).getByRole('group',{name:'Word suggestions',exact:true})
 await expect(suggestions.locator('button:enabled')).toHaveCount(0)
 await expect(editor).toHaveValue('prei suffix')
 await editor.fill('Read the ')
 await page.keyboard.type('nota')
 await suggestions.getByRole('button',{name:'Insert notation',exact:true}).click()
 await expect(editor).toHaveValue('Read the notation ')
 await undoTyping(page)
 await expect(editor).toHaveValue('Read the nota')
})

test('a signed-in learner can retry connector delivery, receive the next question, and answer it',async({page})=>{
 const {owner,cpId,threadId,payload}=await prepareLiveTutor(page)
 const checkpoint=(payload.checkpoints as Record<string,unknown>[])[0]
 checkpoint.status='in_progress'
 const settings=(payload.settings as Record<string,unknown>[])[0]
 const learnerAnswer='The converse reverses the hypothesis and conclusion.'
 const tutorQuestion='Can you give an implication whose converse is false?'
 const secondAnswer='Every square is a rectangle, but some rectangles are not squares.'
 const connectorSecret='abc123'.repeat(8)
 settings.connector_secret=connectorSecret
 let thread:TutorThreadView={
  head:{threadId:null,pendingTurnId:null,lastSequence:0},turns:[],recoveredDrafts:[],canSubmit:true,canConnect:true,
 }
 const turnIds=['88888888-8888-4888-8888-888888888881','88888888-8888-4888-8888-888888888882']
 const grantId='99999999-9999-4999-8999-999999999999'
 const starts:Record<string,unknown>[]=[]
 const grants:Record<string,unknown>[]=[]
 const receipts=new Map<unknown,unknown>()
 let replyAvailable=false
 await page.route('**/rest/v1/**',route=>{
  const request=route.request(),resource=new URL(request.url()).pathname.split('/rest/v1/')[1]
  if(!resource.startsWith('rpc/tutor_'))
   return route.fulfill({json:liveTutorFixtureResponse(payload,resource,request.headers().accept)})
  const args=request.postDataJSON()
  // N228: the tutor's questionnaires on this thread (none in this fixture).
  if(resource==='rpc/tutor_questionnaire_state')return route.fulfill({json:[]})
  if(resource==='rpc/tutor_followup_state')return route.fulfill({json:[]})
  if(resource==='rpc/tutor_owner_grant_active'){
   expect(args).toMatchObject({p_turn_id:thread.head.pendingTurnId,p_grant_id:grantId})
   return route.fulfill({json:true})
  }
  expect([args.p_owner,args.p_slug,args.p_checkpoint]).toEqual([owner,'logic',cpId])
  if(resource==='rpc/tutor_thread_state'){
   if(replyAvailable&&thread.head.pendingTurnId===turnIds[0]){
    const prior=thread.turns[0]
    const completed:SavedTutorTurn={...prior,status:'completed',version:2,finalReply:{
     turnId:prior.id,messageId:'fixture-reply',body:tutorQuestion,
     provenance:{kind:'connector',reportedHost:'claude',hostVerified:false},citations:[],suggestions:[],
    }}
    thread={...thread,head:{...thread.head,pendingTurnId:null},turns:[completed]}
   }
   return route.fulfill({json:thread})
  }
  const command=args.p_command
  if(resource==='rpc/tutor_owner_receipt')
   return route.fulfill({json:receipts.get(command.operationId)??{status:'unconfirmed',operationId:command.operationId}})
  expect(resource).toBe('rpc/tutor_owner_command')
  if(command.operation==='start'){
   starts.push(command)
   const sequence=thread.head.lastSequence+1,id=turnIds[sequence-1]
   expect(command.expectedVersion).toBe(sequence-1)
   expect(id).not.toBe(command.operationId)
   const turn:SavedTutorTurn={
    id,threadId,sequence,version:1,status:'awaiting-tutor',snapshot:{question:command.question,selectedContext:[]},
   }
   thread={...thread,head:{threadId,lastSequence:sequence,pendingTurnId:id},turns:[...thread.turns,turn]}
   return route.fulfill({json:{status:'submitted',operationId:command.operationId,turnId:id,version:1}})
  }
  expect(command.operation).toBe('grant')
  expect(command).toMatchObject({turnId:thread.head.pendingTurnId,expectedVersion:1})
  expect(command.tokenHash).toMatch(/^[a-f0-9]{64}$/)
  grants.push(command)
  if(grants.length===1)return route.fulfill({status:409,json:{code:'23505'}})
  const receipt={status:'granted',operationId:command.operationId,turnId:command.turnId,grantId,expiresAt:new Date(Date.now()+3600000).toISOString()}
  receipts.set(command.operationId,receipt)
  return route.fulfill({json:receipt})
 })
 await continueFromPath(page,'logic',false)
 await expect(page).toHaveURL(/#\/p\/logic\/cp\/CP1\/tutor$/)
 await openComposer(page)
 await answer(page).fill(learnerAnswer)
 await send(page).click()
 await expect(transcript(page)).toContainText(learnerAnswer)
 await expect.poll(()=>grants.length).toBe(1)
 const connection=await openConnection(page)
 await connection.getByRole('button',{name:'Send to tutor',exact:true}).click()
 const launcher=connection.getByRole('link',{name:/^Open (Claude|ChatGPT)$/})
 await expect(launcher).toBeVisible()
 const href=await launcher.getAttribute('href')
 expect(decodeURIComponent(href??'')).toContain(turnIds[0]+'.'+grants[1].operationId)
 expect(href).not.toContain(connectorSecret)
 expect(decodeURIComponent(href??'')).not.toContain(learnerAnswer)
 expect(starts).toHaveLength(1)
 await connection.getByRole('button',{name:'Close',exact:true}).click()
 await answer(page).fill(secondAnswer)
 // N228 (Owner: "allow posting of messages even when tutor is not"): Send stays on while the question waits; a message
 // then joins the waiting question (tests/e2e/v7-tutor-followups.spec.ts). Here it is left in the box and sent after the reply.
 await expect(send(page)).toBeEnabled()
 replyAvailable=true
 await expect(transcript(page).getByRole('article',{name:'Tutor reply'})).toContainText(tutorQuestion,{timeout:10000})
 await expect(transcript(page).getByText(tutorQuestion,{exact:true})).toBeInViewport()
 await expect(answer(page)).toHaveValue(secondAnswer)
 await send(page).click()
 await expect(transcript(page)).toContainText(secondAnswer)
 await expect.poll(()=>grants.at(-1)?.turnId).toBe(turnIds[1])
 expect(starts.map(command=>command.question)).toEqual([learnerAnswer,secondAnswer])
 await expect(transcript(page).getByRole('article',{name:'Tutor reply'})).toHaveCount(1)
})
