import type {Page} from '@playwright/test'

export async function prepareLiveTutor(page:Page,released=true){
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
  'rpc/home_summary':{projects:[],resume:null,due:0,pendingProposals:0},'rpc/bootstrap':settings,'rpc/lemma_plan_released':released,'rpc/project_summaries':[]}
 await page.route('**/auth/v1/**',route=>route.fulfill({json:user}))
 return {owner,cpId,threadId,projectId,proposalId,payload}
}

export function liveTutorFixtureResponse(payload:Record<string,unknown>,path:string,accept?:string) {
 let result=payload[path]??[]
 if(accept?.includes('vnd.pgrst.object')&&Array.isArray(result))result=result[0]??null
 return result
}

export async function blockTutorDraftWrites(page:Page,suffix:string) {
 const restore=await page.evaluateHandle(ending=>{
  const setItem=Storage.prototype.setItem
  Storage.prototype.setItem=function(key,value){
   if(this===localStorage&&key.startsWith('lemma.tutor.draft:')&&key.endsWith(ending)){
    throw new DOMException('Storage full','QuotaExceededError')
   }
   setItem.call(this,key,value)
  }
  return ()=>{Storage.prototype.setItem=setItem}
 },suffix)
 return async()=>{
  await restore.evaluate(restoreStorage=>restoreStorage())
  await restore.dispose()
 }
}
