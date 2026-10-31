/**
 * Optional owner-session smoke check, not a service-role script.
 * Usage: LEMMA_TOKEN=<browser-session-access-token> npx tsx scripts/live-read-check.ts
 * Never print the token. This script only reads a user's own RLS-protected projects.
 */
const token=process.env.LEMMA_TOKEN
const url=process.env.VITE_SUPABASE_URL || 'https://yemqnhnztlbyxmjxidis.supabase.co'
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if(!token || !key){
  console.log('SKIP live-read-check: LEMMA_TOKEN and publishable key are required')
  process.exit(0)
}
const response=await fetch(url+'/rest/v1/projects?select=id,slug,title&order=created_at.desc&limit=20',{
  headers:{Authorization:'Bearer '+token,apikey:key,Accept:'application/json'},
})
if(!response.ok) throw Error('Live read failed with HTTP '+response.status)
const projects=await response.json() as Array<{id:string;slug:string;title:string}>
console.log('Live owner-scoped read succeeded: '+projects.length+' projects')
for (const p of projects) console.log(' - '+p.slug)
