import {expect,test,type Page} from '@playwright/test'

test.use({timezoneId:'UTC'})
test.describe.configure({timeout:90_000})

const authKey='sb-yemqnhnztlbyxmjxidis-auth-token'
const owner='00000000-0000-4000-8000-000000000091'
const otherOwner='00000000-0000-4000-8000-000000000092'
const pathTitle='A saved topology path'
const today='./?demo=0&flags=v7Shell#/'
const sessionId='00000000-0000-4000-8000-000000000093'
const settings={desired_retention:.9,new_per_day:20,reviews_per_day:200,rollover_hour:4,
 time_zone:'UTC',preferred_chat:'claude',default_style:'socratic',mix_decks:true,flags:{},ui:{welcomed:true},
 connector_secret:'SENTINEL-SECRET'}

function session(id=owner,seconds=3600){
 const expires_at=Math.floor(Date.now()/1000)+seconds
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url')
 const access_token=[encode({alg:'HS256',typ:'JWT'}),encode({sub:id,session_id:sessionId,exp:expires_at}),'fixture'].join('.')
 return {access_token,refresh_token:'fixture-refresh',expires_at,expires_in:3600,token_type:'bearer',
  user:{id,email:id+'@example.invalid',app_metadata:{},user_metadata:{}}}
}

async function fixture(page:Page){
 const context=page.context()
 const state={id:owner,title:pathTitle,refreshes:0,bootstraps:0,offline:false}
 let releaseSetup!:()=>void
 const slowSetup=new Promise<void>(resolve=>{releaseSetup=resolve})
 await context.addInitScript(({key,auth})=>{
  if(localStorage.getItem('startup-fixture-installed'))return
  localStorage.setItem('startup-fixture-installed','1')
  localStorage.setItem(key,JSON.stringify(auth))
 },{key:authKey,auth:session()})
 await context.route('https://**/*',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/auth/v1/token')state.refreshes++
  if(state.offline)return route.abort('internetdisconnected')
  const projects=[{id:'topology-id',slug:'topology',title:state.title,status:'active',system:false,pinned:false,
   subject:{id:'math',name:'Topology',glyph:'∫',hue:'amber'},done:0,total:1,current:null,stageProgress:[],sourceTitles:[]}]
  if(path==='/auth/v1/user')return route.fulfill({json:session(state.id).user})
  if(path==='/auth/v1/token')return route.fulfill({json:session(state.id)})
  if(path==='/auth/v1/logout')return route.fulfill({status:204})
  if(path==='/rest/v1/rpc/bootstrap'){
   state.bootstraps++
   await slowSetup
   return route.fulfill({json:settings})
  }
  if(path==='/rest/v1/settings')return route.fulfill({json:settings})
  if(path==='/rest/v1/rpc/home_summary')return route.fulfill({json:{projects,due:3,pendingProposals:0,resume:null}})
  // N251: exam mode reads the exam-aware summary, which is home_summary plus `exam`.
  if(path==='/rest/v1/rpc/exam_home_summary')return route.fulfill({json:{projects,due:3,pendingProposals:0,resume:null,exam:{sittings:[]}}})
  if(path==='/rest/v1/rpc/project_summaries')return route.fulfill({json:projects})
  if(path==='/rest/v1/rpc/home_review_outlook')return route.fulfill({json:{decks:[],forecast:[]}})
  if(path==='/rest/v1/rpc/lemma_plan_released')return route.fulfill({json:false})
  if(path.startsWith('/rest/v1/'))return route.fulfill({json:[]})
  return route.abort()
 })
 return {state,releaseSetup}
}

async function openNotebook(page:Page){
 const {state,releaseSetup}=await fixture(page)
 await page.goto(today)
 try {
  await expect(page.getByRole('main',{name:'Today'})).toBeVisible()
  await expect(page.getByRole('link',{name:pathTitle})).toBeVisible()
  await expect.poll(()=>state.bootstraps).toBe(1)
 } finally {releaseSetup()}
 await expect.poll(()=>page.evaluate(()=>Boolean(localStorage.getItem('lemma:device-setup')))).toBe(true)
 await page.evaluate(async()=>{await navigator.serviceWorker.ready})
 await page.reload()
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true)
 await expect(page.getByRole('link',{name:pathTitle})).toBeVisible()
 return state
}

test('opens Today and Paths offline with an expired saved login, then refreshes on reconnect',async({page,context})=>{
 const state=await openNotebook(page)
 await page.evaluate(()=>{location.hash='/projects'})
 await expect(page.getByRole('main',{name:'Paths'})).toContainText(pathTitle)
 await expect.poll(()=>page.evaluate(async ownerId=>{
  const name='lemma-offline:'+ownerId
  if(!(await indexedDB.databases()).some(db=>db.name===name))return ''
  return new Promise<string>((resolve,reject)=>{
   const db=indexedDB.open(name)
   db.onerror=()=>reject(db.error)
   db.onsuccess=()=>{
    const request=db.result.transaction('snapshot').objectStore('snapshot').get('latest')
    request.onsuccess=()=>{db.result.close();resolve(JSON.stringify(request.result??null))}
    request.onerror=()=>{db.result.close();reject(request.error)}
   }
  })
 },owner)).toContain('"key":["projects"]')
 state.offline=true
 await context.setOffline(true)
 await page.evaluate(({key,auth})=>localStorage.setItem(key,JSON.stringify(auth)),{key:authKey,auth:session(owner,-60)})
 await page.reload()
 await expect(page.getByRole('main',{name:'Paths'})).toContainText(pathTitle)
 await page.evaluate(()=>{location.hash='/'})
 await expect(page.getByRole('link',{name:pathTitle})).toBeVisible()
 await expect(page.getByText(/as of \d{2}:\d{2}/)).toBeVisible()
 expect(state.refreshes).toBe(0)

 state.title='The refreshed topology path'
 state.offline=false
 await context.setOffline(false)
 await expect(page.getByRole('link',{name:state.title})).toBeVisible({timeout:15_000})
 expect(state.refreshes).toBe(1)
 expect(state.bootstraps).toBe(1)
})

test('an offline account switch and an explicit logout hide the previous notebook',async({page,context})=>{
 const state=await openNotebook(page)
 state.offline=true
 await context.setOffline(true)
 await page.evaluate(({key,auth})=>localStorage.setItem(key,JSON.stringify(auth)),{key:authKey,auth:session(otherOwner)})
 await page.reload()
 await expect(page.getByText('Connect once to save Today on this device.')).toBeVisible()
 await expect(page.getByText(pathTitle,{exact:true})).toHaveCount(0)

 state.id=otherOwner
 state.title='The other owner’s path'
 state.offline=false
 await context.setOffline(false)
 await expect(page.getByRole('link',{name:state.title})).toBeVisible()
 await page.evaluate(()=>{location.hash='/settings?section=data'})
 await page.getByRole('button',{name:'Sign out',exact:true}).click()
 await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible()
 await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),authKey)).toBeNull()
 state.offline=true
 await context.setOffline(true)
 await page.reload()
 await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible()
 await expect(page.getByText(state.title,{exact:true})).toHaveCount(0)
})
