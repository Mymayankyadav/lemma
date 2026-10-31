import {expect,test} from '@playwright/test'

// Browser-level network regression for FIX #475: call the actual live adapter,
// not the demo adapter. Supabase auth and REST are intercepted; no owner data
// or credentials are touched. X is 100 sources / 3,000 pages per source.
const owner='11111111-1111-1111-1111-111111111111'
const token=[
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({
  sub:owner,role:'authenticated',aud:'authenticated',
  exp:Math.floor(Date.now()/1000)+3600,
 })).toString('base64url'),
 'fixture-signature',
].join('.')
const user={id:owner,email:'fixture@example.invalid',aud:'authenticated',
 role:'authenticated',app_metadata:{},user_metadata:{}}

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #475 live transcription stats '+profile+' '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:740})
  await page.addInitScript(({token,user,expiresAt})=>{
   localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token',JSON.stringify({
    access_token:token,refresh_token:'fixture-refresh',
    token_type:'bearer',expires_in:3600,expires_at:expiresAt,user,
   }))
  },{token,user,expiresAt:Math.floor(Date.now()/1000)+3600})
  const sourceCount=profile==='extreme'?100:30
  const pageCount=profile==='extreme'?3000:1200
  const rows=Array.from({length:sourceCount},(_,i)=>({
   source_id:'source-'+i,
   transcribed:i===0?pageCount:0,
   needs_check:i===0?Math.floor(pageCount/10):0,
  }))
  const seen:string[]=[]
  await page.route('**/auth/v1/**',route=>{
   const path=new URL(route.request().url()).pathname
   if(path.endsWith('/user'))return route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(user),
   })
   seen.push('unexpected auth '+path)
   return route.fulfill({status:404,body:'{}'})
  })
  await page.route('**/rest/v1/**',route=>{
   const path=new URL(route.request().url()).pathname
   seen.push(path)
   if(path==='/rest/v1/rpc/source_transcription_stats')
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)})
   return route.fulfill({status:404,body:'{}'})
  })
  await page.goto('./?demo=1&theme='+theme+'#/')
  const stats=await page.evaluate(async()=>{
   // Import the Vite-served LIVE module directly; getApi() would select demo.
   const path='/lemma/src/data/live/adapter.ts'
   const {LiveAdapter}=await import(path)
   return new LiveAdapter().getSourceTranscriptionStats('project-1')
  }) as {sourceId:string;transcribed:number;needsCheck:number}[]
  expect(stats).toHaveLength(sourceCount)
  expect(stats[0]).toEqual({
   sourceId:'source-0',transcribed:pageCount,needsCheck:Math.floor(pageCount/10),
  })
  expect(seen).toEqual(['/rest/v1/rpc/source_transcription_stats'])
  expect(Buffer.byteLength(JSON.stringify(rows))).toBeLessThan(200*1024)
 })
}
