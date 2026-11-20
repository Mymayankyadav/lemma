import {expect,test,type Page} from '@playwright/test'
import type {SavedTutorTurn,TutorThreadView} from '../../src/data/tutor/manual-api'
import {liveTutorFixtureResponse,prepareLiveTutor} from './helpers/live-tutor'

const tutor = (page:Page) => page.getByRole('main',{name:'Checkpoint tutor'})
const transcript = (page:Page) => tutor(page).getByRole('log',{name:'Conversation'})
const answer = (page:Page) => tutor(page).getByRole('textbox',{name:'Your answer',exact:true})
const send = (page:Page) => tutor(page).getByRole('button',{name:'Send',exact:true})
const path = (slug:string,demo:boolean) => '/lemma/?demo=' + (demo?'1':'0') + '&flags=v7Shell,v6Shell#/p/' + slug
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

test('Continue with tutor opens the current checkpoint and keeps demo turns after reloading',async({page})=>{
 await continueFromPath(page,'real-analysis')
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4\/tutor$/)
 await expect(tutor(page).getByRole('heading',{level:1})).toHaveText('Compactness')
 await expect(tutor(page).getByRole('navigation',{name:'Session parts'})).toBeVisible()
 await expect(page.getByRole('link',{name:/lemma pad/i})).toHaveCount(0)
 await openComposer(page)
 await answer(page).fill(firstAnswer)
 await send(page).click()
 await expect(transcript(page)).toContainText(firstAnswer)
 await expect(send(page)).toBeDisabled()
 await tutor(page).getByRole('button',{name:'Connect',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Tutor connection'})
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
 await expect(tutor(page).getByRole('heading',{name:'Implications'})).toBeVisible()
})

for(const viewport of [{width:360,height:640},{width:1440,height:900}]) {
 test('Tutor navigation, chat and keyboard stay usable at ' + viewport.width + ' px',async({page})=>{
  await page.setViewportSize(viewport)
  await continueFromPath(page,'real-analysis')
  await expect(tutor(page).getByRole('button',{name:'Study timer'})).toBeInViewport()
  await expect(tutor(page).getByRole('navigation',{name:'Session parts'})).toBeInViewport()
  await openComposer(page)
  const symbols=tutor(page).getByRole('button',{name:'Symbols',exact:true})
  await symbols.click()
  await expect(tutor(page).getByRole('group',{name:'Math categories'})).toBeInViewport()
  await tutor(page).getByRole('group',{name:'∀∃ keys'}).getByRole('button',{name:'∀',exact:true}).click()
  await expect(answer(page)).toHaveValue('∀')
  await tutor(page).getByRole('button',{name:'Undo',exact:true}).click()
  await expect(answer(page)).toHaveValue('')
  const line='Start with an arbitrary open cover and show where a finite subcover arises.'
  const text=Array(22).fill(line).join('\n')
  await answer(page).fill(text)
  await send(page).click()
  await expect(transcript(page)).toContainText(line)
  const log=transcript(page)
  await expect.poll(()=>log.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true)
  await log.evaluate(node=>{node.scrollTop=node.scrollHeight})
  await expect.poll(()=>log.evaluate(node=>node.scrollTop)).toBeGreaterThan(0)
  await expect(send(page)).toBeInViewport()
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
 })
}

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
 await tutor(page).getByRole('button',{name:'Send to tutor',exact:true}).click()
 const launcher=tutor(page).getByRole('link',{name:/^Open (Claude|ChatGPT)$/})
 await expect(launcher).toBeVisible()
 const href=await launcher.getAttribute('href')
 expect(decodeURIComponent(href??'')).toContain(turnIds[0]+'.'+grants[1].operationId)
 expect(href).not.toContain(connectorSecret)
 expect(decodeURIComponent(href??'')).not.toContain(learnerAnswer)
 expect(starts).toHaveLength(1)
 await answer(page).fill(secondAnswer)
 await expect(send(page)).toBeDisabled()
 replyAvailable=true
 await expect(transcript(page).getByRole('article',{name:'Tutor reply'})).toContainText(tutorQuestion,{timeout:10000})
 await expect(tutor(page).getByRole('button',{name:'The question on the table'})).toContainText(tutorQuestion)
 await expect(answer(page)).toHaveValue(secondAnswer)
 await send(page).click()
 await expect(transcript(page)).toContainText(secondAnswer)
 await expect.poll(()=>grants.at(-1)?.turnId).toBe(turnIds[1])
 expect(starts.map(command=>command.question)).toEqual([learnerAnswer,secondAnswer])
 await expect(transcript(page).getByRole('article',{name:'Tutor reply'})).toHaveCount(1)
})
