import {expect,test} from '@playwright/test'

// FIX-546b: X-like Card detail over intercepted live Supabase HTTP.
// No owner account, credentials or backend writes are used.
const owner='11111111-1111-1111-1111-111111111111'
const user={
 id:owner,email:'card-paging@example.invalid',aud:'authenticated',role:'authenticated',
 app_metadata:{},user_metadata:{},created_at:'2026-10-01T00:00:00Z',
}
const settings={
 desired_retention:0.9,new_per_day:20,reviews_per_day:200,
 learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,
 max_interval_days:36500,fuzz:true,load_balance:true,
 learn_ahead_minutes:20,fsrs_weights:null,fsrs_tuned_at:null,
 macros:'',default_style:'socratic',tutor_rules:null,mix_decks:true,
 preferred_chat:'claude',connector_secret:'',connector_last_seen_at:null,
 connector_last_client:null,time_zone:'UTC',
}
const note={
 id:'n1',no:12,user_id:owner,project_id:'p1',checkpoint_id:null,
 session_id:null,source_id:null,front:'What is $x^2$?',back:'The square of $x$.',
 type:'basic',kind:'theorem',tags:[],status:'active',origin:'user',page_label:null,
}
const card={
 id:'c1',user_id:owner,note_id:'n1',ord:1,state:2,due:'2026-11-01T00:00:00Z',
 stability:4,difficulty:5,last_review:null,step:0,reps:2,lapses:0,
}
const reviews=Array.from({length:1001},(_,i)=>({
 id:String(1001-i),reviewed_at:new Date(Date.UTC(2026,9,31)-Math.floor(i/2)*3600000).toISOString(),
 rating:3,confidence:'sure',card_id:'c1',user_id:owner,undone_at:null,
}))
const comments=Array.from({length:1001},(_,i)=>({
 id:'00000000-0000-4000-8000-'+String(1001-i).padStart(12,'0'),
 no:1001-i,body:'Tutor note '+i,status:'open',
 created_at:new Date(Date.UTC(2026,9,31)-Math.floor(i/2)*3600000).toISOString(),
 resolved_at:null,resolved_by_proposal:null,note_id:'n1',user_id:owner,
}))
const token=[
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({sub:owner,role:'authenticated',aud:'authenticated',
  exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
 'fixture-signature',
].join('.')

for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX-546b live X-like bounded HTTP '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize({width,height:width===360?740:844})
  await page.emulateMedia({colorScheme:theme==='graph-night'?'dark':'light'})
  const browserZone=await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone)
  await page.addInitScript(({token,user,expiresAt})=>{
   localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({
    access_token:token,refresh_token:'fixture-refresh',
    token_type:'bearer',expires_in:3600,expires_at:expiresAt,user,
   }))
  },{token,user,expiresAt:Math.floor(Date.now()/1000)+3600})
  const calls:{table:string;url:string;bytes:number;method:string}[]=[]
  const unexpected:string[]=[],errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}))
  await page.route('**/auth/v1/**',route=>{
   const path=new URL(route.request().url()).pathname
   if(path.endsWith('/user'))return route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(user),
   })
   unexpected.push('auth '+path)
   return route.fulfill({status:404,body:'{}'})
  })
  await page.route('**/rest/v1/**',route=>{
   const req=route.request(),url=new URL(req.url())
   const table=url.pathname.replace(/^\/rest\/v1\//,'')
   const single=req.headers()['accept']?.includes('application/vnd.pgrst.object+json')
   const pageNumber=url.searchParams.has('or')?1:0
   const rows=table==='reviews'?reviews:comments
   const payload:unknown=table==='rpc/bootstrap'||table==='settings'?{...settings,time_zone:browserZone}:
    table==='rpc/project_summaries'?[]:
    table==='notes'?note:
    table==='projects'?[{id:'p1',slug:'algebra'}]:
    table==='cards'?url.searchParams.get('select')==='id'?[{id:'c1'}]:[card]:
    table==='reviews'||table==='card_comments'?rows.slice(pageNumber*20,pageNumber*20+21):
    null
   if(payload===null){
    unexpected.push(req.method()+' '+table)
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
   }
   const body=JSON.stringify(single&&!Array.isArray(payload)?payload:payload)
   calls.push({table,url:req.url(),bytes:Buffer.byteLength(body),method:req.method()})
   return route.fulfill({
    status:200,contentType:'application/json',
    headers:{'content-range':'0-20/1001'},body,
   })
  })
  await page.goto('/lemma/?demo=0&theme='+theme+'#/cards/12')
  await expect(page.getByRole('heading',{name:'Card detail',level:1})).toBeVisible()
  await expect(page.locator('[data-review-row]')).toHaveCount(20)
  await expect(page.locator('[data-comment-row]')).toHaveCount(20)
  await page.getByRole('button',{name:'More reviews'}).click()
  await expect(page.locator('[data-review-row]')).toHaveCount(20)
  await expect(page.getByRole('button',{name:'Newer reviews'})).toBeVisible()
  await page.getByRole('button',{name:'More comments'}).click()
  await expect(page.locator('[data-comment-row]')).toHaveCount(20)
  await expect(page.getByRole('button',{name:'Newer comments'})).toBeVisible()

  const bounded=calls.filter(c=>c.table==='reviews'||c.table==='card_comments')
  expect(bounded.map(c=>c.table).sort()).toEqual(['card_comments','card_comments','card_comments','reviews','reviews','reviews'])
  expect(bounded.reduce((sum,c)=>sum+c.bytes,0)).toBeLessThan(200*1024)
  for(const call of bounded){
   const url=new URL(call.url)
   expect(url.searchParams.get('limit')).toBe('21')
   expect(url.searchParams.get('user_id')).toBe('eq.'+owner)
   expect(url.searchParams.has('offset')).toBe(false)
   expect(url.searchParams.has('range')).toBe(false)
   expect(url.searchParams.get('select')).not.toBe('*')
   expect(call.bytes).toBeLessThan(100*1024)
  }
  expect(bounded.filter(c=>c.table==='reviews')[2].url).toContain('or=')
  expect(bounded.filter(c=>c.table==='card_comments')[2].url).toContain('or=')
  for(const table of ['notes','cards','projects','reviews','card_comments']){
   const scoped=calls.filter(c=>c.table===table)
   expect(scoped.length,table+' must have a live HTTP read').toBeGreaterThan(0)
   expect(scoped.every(c=>new URL(c.url).searchParams.get('user_id')==='eq.'+owner),
    table+' must be owner-scoped').toBe(true)
  }
  expect(calls.filter(c=>c.table==='cards').every(c=>
   new URL(c.url).searchParams.get('note_id')==='eq.n1')).toBe(true)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1)
  await page.screenshot({
   path:'test-results/screens/fix-546b-live-'+theme+'-'+width+'.png',
   fullPage:true,
  })
 })
}
