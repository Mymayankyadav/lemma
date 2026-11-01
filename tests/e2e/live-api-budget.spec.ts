import {expect,test} from '@playwright/test'

// FIX-484b: exercise the LIVE adapter over intercepted HTTP, never the demo
// adapter or the owner's Supabase. No real tokens or backend writes are used.
const owner='11111111-1111-1111-1111-111111111111'
const user={
 id:owner,email:'budget-fixture@example.invalid',aud:'authenticated',
 role:'authenticated',app_metadata:{},user_metadata:{},
 created_at:'2026-10-01T00:00:00Z',
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
const subject={id:'subject-0',name:'Mathematics',glyph:'∫',hue:'amber',position:0}
const projects=Array.from({length:60},(_,i)=>({
 id:'project-'+i,slug:'math-'+i,title:'Mathematics project '+(i+1),
 subject,status:'active',pinned:false,system:false,
 targetDate:null,targetLabel:null,done:i,total:100,
 current:{code:'CP'+(i+1),title:'Foundations',step:1,stepsTotal:4},
 lastActivityAt:'2026-10-31T06:00:00Z',cardsCount:500,
 sessionsCount:1000,sourcesCount:100,sourceTitles:['Notes'],
 stageProgress:Array.from({length:13},(_,stage)=>{
  const first=stage*8+1,count=Math.min(8,100-stage*8),last=first+count-1
  return {label:'CP'+first+'–CP'+last,firstCode:'CP'+first,lastCode:'CP'+last,
   done:Math.max(0,Math.min(count,i-stage*8)),total:count,overdue:0,
   schedule:'unscheduled'}
 }),
 scheduleHeadline:null,
}))
const home={
 resume:null,due:4000,pendingProposals:600,projects,
}
const date=(daysAgo:number)=>new Date(Date.UTC(2026,9,31)-daysAgo*86400000)
 .toISOString().slice(0,10)
const insights={
 days:30,reviews:300000,right:270000,sessions:60000,minutes:120000,
 typicalSession:30,
 reviewDays:Array.from({length:30},(_,i)=>({
  date:date(29-i),count:10000,again:1000,hard:1000,good:6000,easy:2000,right:9000,
 })),
 calibration:[
  {confidence:'sure',total:200000,right:190000},
  {confidence:'unsure',total:70000,right:60000},
  {confidence:'guess',total:30000,right:20000},
 ],
 subjectMinutes:Array.from({length:40},(_,i)=>({
  subject:{...subject,id:'subject-'+i,name:'Subject '+(i+1)},
  minutes:3000,
 })),
 checkpointDays:Array.from({length:28},(_,i)=>({
  date:date(27-i),demonstrated:10,rechecked:20,
 })),
 mostRevisited:{label:'Continuity',times:300,conceptName:'Uniform continuity'},
}
const payloads:Record<string,unknown>={
 '/rpc/bootstrap':settings,
 '/rpc/home_summary':home,
 '/rpc/home_review_outlook':{
  decks:[{key:'project:math-0',label:'Mathematics project 1',glyph:'∫',
   level:0,due:4000,children:[]}],
  forecast:Array.from({length:7},(_,i)=>({day:date(-i),due:i===0?4000:200})),
 },
 '/rpc/insights':insights,
 '/settings':settings,
}
// E1 specifies 200 kB (decimal), not 200 KiB (204,800 bytes).
const maxTransfer=200_000
const withinBudget=(calls:{bytes:number}[],maxCalls:number)=>calls.length<=maxCalls &&
 calls.reduce((sum,call)=>sum+call.bytes,0)<=maxTransfer

test('FIX-484b cold budget rejects four requests and aggregate over 200kB',()=>{
 expect(withinBudget(Array.from({length:4},()=>({bytes:1000})),3)).toBe(false)
 expect(withinBudget([{bytes:150*1024},{bytes:100*1024}],3)).toBe(false)
 expect(withinBudget([{bytes:50*1024},{bytes:50*1024},{bytes:50*1024}],3)).toBe(true)
 expect(withinBudget([{bytes:200_000}],3)).toBe(true)
 expect(withinBudget([{bytes:200_001}],3)).toBe(false)
})
const token=([
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({
  sub:owner,role:'authenticated',aud:'authenticated',
  exp:Math.floor(Date.now()/1000)+3600,
 })).toString('base64url'),
 'fixture-signature',
]).join('.')

for(const theme of ['graph','graph-night'] as const)
for(const viewport of [{width:390,height:844},{width:360,height:740}] as const){
 test('FIX-484b live X network budgets '+theme+' '+viewport.width,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize(viewport)
  await page.emulateMedia({colorScheme:theme==='graph-night'?'dark':'light'})
  await page.addInitScript(({token,user,expiresAt})=>{
   localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({
    access_token:token,refresh_token:'fixture-refresh',
    token_type:'bearer',expires_in:3600,expires_at:expiresAt,user,
   }))
  },{token,user,expiresAt:Math.floor(Date.now()/1000)+3600})

  const unexpected:string[]=[],pageErrors:string[]=[]
  const requests:{path:string;bytes:number;method:string}[]=[]
  page.on('pageerror',error=>pageErrors.push(error.message))
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
  await page.route('**/auth/v1/**',route=>{
   const path=new URL(route.request().url()).pathname
   if(path.endsWith('/user'))return route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(user),
   })
   unexpected.push('auth '+path)
   return route.fulfill({status:404,body:'{}'})
  })
  await page.route('**/rest/v1/**',route=>{
   const req=route.request(),path=new URL(req.url()).pathname.replace(/^\/rest\/v1/,'')
   const response=payloads[path]
   if(response===undefined){
    unexpected.push('rest '+req.method()+' '+path)
    return route.fulfill({status:404,body:'{}'})
   }
   const body=JSON.stringify(response)
   requests.push({path,method:req.method(),bytes:Buffer.byteLength(body)})
   return route.fulfill({
    status:200,contentType:'application/json',
    headers:{'content-range':'0-0/1'},body,
   })
  })

  await page.goto('./?demo=0&theme='+theme+'#/')
  await expect(page.getByRole('heading',{name:'Home'})).toBeVisible()
  await expect(page.getByRole('link',{name:/Start review of 4000 cards/})).toBeVisible()
  await expect(page.locator('[aria-label="Seven-day review forecast"]')).toBeVisible()
  const today=[...requests]
  expect(today.length,'Cold Today must make actual intercepted REST calls').toBeGreaterThan(0)
  expect(today.filter(r=>r.path==='/rpc/bootstrap')).toHaveLength(1)
  expect(today.filter(r=>r.path==='/rpc/home_summary')).toHaveLength(1)
  expect(withinBudget(today,3),'Cold Today total request and transfer budget').toBe(true)
  await page.screenshot({path:'test-results/screens/fix-484b-'+theme+'-'+viewport.width+'-today.png'})

  const offset=requests.length
  await page.getByRole('link',{name:'Insights'}).click()
  await expect(page.getByRole('heading',{name:'Insights'})).toBeVisible()
  await expect(page.locator('[aria-label="Study totals"]')).toBeVisible()
  const insightCalls=requests.slice(offset)
  expect(insightCalls,'Insights must make one actual aggregate HTTP request').toHaveLength(1)
  expect(insightCalls[0].path).toBe('/rpc/insights')
  expect(insightCalls[0].bytes).toBeGreaterThan(0)
  expect(insightCalls[0].bytes,'Insights response budget').toBeLessThanOrEqual(maxTransfer)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1)
  await page.screenshot({path:'test-results/screens/fix-484b-'+theme+'-'+viewport.width+'-insights.png'})
  expect(unexpected,'No whole-table reads or unexpected endpoints').toEqual([])
  expect(pageErrors).toEqual([])
 })
}
