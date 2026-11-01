// NOTIF-1a: real two-connection PostgreSQL concurrency gate.
// Runs only against the isolated CI service. Never use a Supabase URL.
import assert from 'node:assert/strict'
import pg from 'pg'
import {readFile} from 'node:fs/promises'
const {Client}=pg
const url=process.env.NOTIF_TEST_DATABASE_URL
if(!url)throw Error('Isolated local PostgreSQL URL required')
const endpoint=new URL(url)
if(!['localhost','127.0.0.1'].includes(endpoint.hostname))throw Error('Refusing non-local PostgreSQL URL')
const owner='11111111-1111-1111-1111-111111111111'
const client=async()=>{const c=new Client({connectionString:url});await c.connect();return c}
const admin=await client()
const migration=await readFile(new URL('../../supabase/migrations/20261101104000_notifications_base.sql',import.meta.url),'utf8')
const insert=(n,disabled=false)=>admin.query(
 'insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform,disabled_at,disabled_reason) values($1,$2,$3,$4,$5,$6,$7,$8) returning id',
 [owner,'https://push.example.test/concurrent/'+n,'publickey'+n,'authkey'+n,'Device '+n,'desktop',disabled?new Date():null,disabled?'removed':null]
)
const count=async()=>Number((await admin.query('select count(*)::int n from public.push_devices where disabled_at is null')).rows[0].n)
async function compete(sql,params){
 const c=await client()
 try{
  await c.query('begin')
  const result=await c.query(sql,params)
  // Hold the advisory transaction lock while the other connection enters.
  await c.query('select pg_sleep(0.1)')
  await c.query('commit')
  return result.rows
 }catch(e){await c.query('rollback');throw e}finally{await c.end()}
}
try{
 await admin.query(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $body$
 select nullif(current_setting('test.uid',true),'')::uuid
 $body$;
 create table public.settings(user_id uuid primary key);
 create table public.projects(id uuid primary key,user_id uuid not null,unique(user_id,id));`)
 await admin.query(migration)
 await admin.query('insert into auth.users(id) values($1)',[owner])
 for(let n=1;n<=9;n++)await insert(n)
 const addSql='insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,$2,$3,$4,$5,$6) returning id'
 const added=await Promise.allSettled([
  compete(addSql,[owner,'https://push.example.test/concurrent/10','key10','auth10','Device 10','desktop']),
  compete(addSql,[owner,'https://push.example.test/concurrent/11','key11','auth11','Device 11','desktop']),
 ])
 assert.equal(added.filter(x=>x.status==='fulfilled').length,1,'exactly one of two concurrent inserts succeeds')
 assert.equal(added.filter(x=>x.status==='rejected').length,1)
 assert.match(added.find(x=>x.status==='rejected').reason.message,/You have 10 devices with reminders. Remove one first./)
 assert.equal(await count(),10)
 console.log('PASS NOTIF-1a real two-connection insert race: 9 → 10, never 11')

 const a=(await insert(12,true)).rows[0].id
 const b=(await insert(13,true)).rows[0].id
 await admin.query("update public.push_devices set disabled_at=now(),disabled_reason='removed' where endpoint=$1",['https://push.example.test/concurrent/1'])
 assert.equal(await count(),9)
 const restoreSql='update public.push_devices set disabled_at=null,disabled_reason=null where id=$1 returning id'
 const restored=await Promise.allSettled([compete(restoreSql,[a]),compete(restoreSql,[b])])
 assert.equal(restored.filter(x=>x.status==='fulfilled').length,1,'exactly one concurrent restore succeeds')
 assert.equal(restored.filter(x=>x.status==='rejected').length,1)
 assert.match(restored.find(x=>x.status==='rejected').reason.message,/You have 10 devices with reminders. Remove one first./)
 assert.equal(await count(),10)
 console.log('PASS NOTIF-1a real two-connection restore race: 9 → 10, never 11')
}finally{await admin.end()}
