import {expect,test} from '@playwright/test'
import type {TutorThreadView} from '../../src/data/tutor/manual-api'

test('live checkpoint restores a lost acknowledgement, accepts a reviewed paste and opens its exact card proposal',async({page})=>{
 const owner='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222'
 const cpId='33333333-3333-4333-8333-333333333333',subjectId='44444444-4444-4444-8444-444444444444'
 const proposalId='55555555-5555-4555-8555-555555555555',threadId='66666666-6666-4666-8666-666666666666'
 const user={id:owner,email:'learner@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
 const expires=Math.floor(Date.now()/1000)+3600
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url')
 const token=[encode({alg:'HS256',typ:'JWT'}),encode({sub:owner,role:'authenticated',aud:'authenticated',exp:expires}),'fixture'].join('.')
 await page.addInitScript(({user,token,expires})=>{
  localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({user,access_token:token,token_type:'bearer',expires_at:expires,expires_in:3600,refresh_token:'local-fixture'}))
 },{user,token,expires})
 const project={id:projectId,user_id:owner,subject_id:subjectId,slug:'logic',title:'Logic',goal:'Study implications',style:'socratic',status:'active'}
 const cp={id:cpId,user_id:owner,project_id:projectId,code:'CP1',position:10,title:'Implications',objective:'Prove the converse.',
  criterion:'Give a proof.',steps:['Review the claim.'],status:'not_started',current_step:0}
 const settings={desired_retention:.9,new_per_day:20,reviews_per_day:200,learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,
  max_interval_days:36500,fuzz:true,load_balance:true,learn_ahead_minutes:20,fsrs_weights:null,fsrs_tuned_at:null,macros:'',default_style:'socratic',time_zone:'UTC'}
 const subject={id:subjectId,name:'Logic',glyph:'∫',hue:'amber',position:0}
 const payload:Record<string,unknown>={projects:[project],checkpoints:[cp],subjects:[subject],settings:[settings],
  'rpc/bootstrap':settings,'rpc/lemma_plan_released':true,'rpc/project_summaries':[]}
 let thread:TutorThreadView={head:{threadId:null,pendingTurnId:null,lastSequence:0},turns:[],recoveredDrafts:[],canSubmit:true,canConnect:false}
 let startCount=0
 let startCommand:Record<string,unknown>|undefined
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/auth/v1/**',route=>route.fulfill({json:user}))
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
 await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads#/p/logic/cp/CP1')
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
