import {expect,test} from '@playwright/test'

// FIX #475: exercise the actual live Sources tab through intercepted HTTP.
// Production preview is used by Playwright, so no test-only module imports.
// The fake JWT is never sent to Supabase; all auth and REST paths are intercepted.
const owner='11111111-1111-1111-1111-111111111111'
const projectId='22222222-2222-2222-2222-222222222222'
const subjectId='33333333-3333-3333-3333-333333333333'
const user={id:owner,email:'fixture@example.invalid',aud:'authenticated',
 role:'authenticated',app_metadata:{},user_metadata:{}}
const token=[
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({
  sub:owner,role:'authenticated',aud:'authenticated',
  exp:Math.floor(Date.now()/1000)+3600,
 })).toString('base64url'),
 'fixture-signature',
].join('.')
const settings={
 desired_retention:0.9,new_per_day:20,reviews_per_day:200,
 learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,
 max_interval_days:36500,fuzz:true,load_balance:true,
 learn_ahead_minutes:20,fsrs_weights:null,fsrs_tuned_at:null,
 macros:'',default_style:'socratic',tutor_rules:null,mix_decks:true,
 preferred_chat:'claude',connector_secret:'',connector_last_seen_at:null,
 connector_last_client:null,time_zone:'UTC',
}
const project={
 id:projectId,user_id:owner,subject_id:subjectId,slug:'real-analysis',
 title:'Real Analysis',goal:'Study analysis',style:'socratic',status:'active',
 pinned:false,system:false,target_date:null,target_label:null,
 created_at:'2026-10-01T00:00:00Z',last_activity_at:'2026-10-31T00:00:00Z',
}
const subject={id:subjectId,user_id:owner,name:'Analysis',glyph:'∫',
 hue:'amber',position:0}
const summary={
 id:projectId,slug:'real-analysis',title:'Real Analysis',
 subject:{id:subjectId,name:'Analysis',glyph:'∫',hue:'amber',position:0},
 status:'active',pinned:false,system:false,targetDate:null,targetLabel:null,
 done:0,total:0,current:null,lastActivityAt:'2026-10-31T00:00:00Z',
 cardsCount:0,sessionsCount:0,sourcesCount:100,sourceTitles:[],
 stageProgress:[],scheduleHeadline:null,
}
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #475 live Sources network '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize({width,height:width===390?844:740})
  await page.emulateMedia({colorScheme:theme==='graph-night'?'dark':'light'})
  await page.addInitScript(({token,user,expiresAt})=>{
   localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({
    access_token:token,refresh_token:'fixture-refresh',
    token_type:'bearer',expires_in:3600,expires_at:expiresAt,user,
   }))
  },{token,user,expiresAt:Math.floor(Date.now()/1000)+3600})
  const sourceCount=profile==='extreme'?100:30
  const pageCount=profile==='extreme'?3000:1200
  const sources=Array.from({length:sourceCount},(_,i)=>({
   id:'source-'+i,user_id:owner,project_id:projectId,
   title:'Scanned book '+i,short:'s'+i,filename:'scan-'+i+'.pdf',
   bytes:1024,page_count:pageCount,status:'ready',has_text:true,
   outline:[],kind:'book',position:i,origin:'user',
   created_at:'2026-10-01T00:00:00Z',
  }))
  const stats=sources.map((s,i)=>({
   source_id:s.id,transcribed:i===0?pageCount:0,
   needs_check:i===0?Math.floor(pageCount/10):0,
  }))
  const payloads:Record<string,unknown>={
   '/rpc/bootstrap':settings,'/rpc/project_summaries':[summary],
   '/rpc/review_items':[],'/rpc/source_transcription_stats':stats,
   '/projects':project,'/subjects':[subject],'/sources':sources,
   '/settings':settings,'/checkpoints':[],'/checkpoint_prereqs':[],
   '/proposals':[],'/sessions':[],'/v_plan_revisions':[],
  }
  const seen:string[]=[],unexpected:string[]=[],errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
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
   const req=route.request()
   const path=new URL(req.url()).pathname.replace(/^\/rest\/v1/,'')
   const value=payloads[path]
   if(value===undefined){
    unexpected.push('rest '+req.method()+' '+path)
    return route.fulfill({status:404,body:'{}'})
   }
   seen.push(path)
   const single=req.headers()['accept']?.includes('vnd.pgrst.object')
   const data=path==='/projects'&&!single?[project]:value
   return route.fulfill({status:200,contentType:'application/json',
    headers:{'content-range':'0-0/1'},body:JSON.stringify(data)})
  })
  await page.goto('./?demo=0&theme='+theme+'#/p/real-analysis?tab=sources')
  const panel=page.getByRole('region',{name:'Sources'})
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Scanned book 0')).toBeVisible()
  await expect.poll(()=>seen.filter(p=>p==='/rpc/source_transcription_stats').length)
   .toBe(1)
  expect(seen.filter(p=>p==='/rpc/source_transcription_stats')).toHaveLength(1)
  expect(seen.some(p=>p==='/source_pages'),'no per-page provenance reads').toBe(false)
  expect(Buffer.byteLength(JSON.stringify(stats))).toBeLessThan(200*1024)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1)
  await page.screenshot({
   path:'test-results/screens/fix-475-'+profile+'-'+theme+'-'+width+'.png',
  })
 })
}
