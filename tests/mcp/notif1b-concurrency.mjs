// NOTIF-1b: real two-connection idempotent notification claim.
// Isolated CI PostgreSQL only. Never point this at a Supabase project.
import assert from 'node:assert/strict'
import pg from 'pg'
import {readFile} from 'node:fs/promises'
const {Client}=pg
const url=process.env.NOTIF_TEST_DATABASE_URL
if(!url)throw Error('Isolated local PostgreSQL URL required')
const endpoint=new URL(url)
if(!['localhost','127.0.0.1'].includes(endpoint.hostname))
  throw Error('Refusing non-local PostgreSQL URL')
const owner='11111111-1111-1111-1111-111111111111'
const other='99999999-9999-9999-9999-999999999999'
const client=async()=>{const c=new Client({connectionString:url});await c.connect();return c}
const admin=await client()
const migration1a=await readFile(new URL('../../supabase/migrations/20261101104000_notifications_base.sql',import.meta.url),'utf8')
const migration1b=await readFile(new URL('../../supabase/migrations/20261101123000_notify_actions.sql',import.meta.url),'utf8')
async function tap(id,action='open',user=owner){
 const c=await client()
 try{
   await c.query('set role service_role')
   await c.query('begin')
   const r=await c.query('select public.notify_act($1,$2,$3,$4::jsonb) result',
     [user,id,action,JSON.stringify({})])
   // Keep the claimed row locked while the competing request arrives.
   await c.query('select pg_sleep(0.15)')
   await c.query('commit')
   return r.rows[0].result
 }catch(e){await c.query('rollback');throw e}finally{await c.end()}
}
try{
 await admin.query(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table public.settings(user_id uuid primary key,time_zone text not null default 'UTC',
   rollover_hour int not null default 4);
 create table public.projects(id uuid primary key,user_id uuid not null,unique(user_id,id));
 grant usage on schema public to service_role;`)
 await admin.query(migration1a)
 await admin.query(migration1b)
 await admin.query('insert into auth.users(id) values($1),($2)',[owner,other])
 await admin.query('insert into public.settings(user_id) values($1),($2)',[owner,other])
 const id=(await admin.query(`insert into public.notifications(user_id,kind,key,title,body,url,due_at)
 values($1,'due','due:race','Cards','Review','#/review',now()) returning id`,[owner])).rows[0].id
 const outcomes=await Promise.allSettled([tap(id),tap(id)])
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2)
 const statuses=outcomes.map(x=>x.value.status).sort()
 assert.deepEqual(statuses,['already_done','done'])
 const row=(await admin.query('select action,action_at from public.notifications where id=$1',[id])).rows[0]
 assert.equal(row.action,'open')
 assert.ok(row.action_at)
 console.log('PASS NOTIF-1b two-connection notification claim: one done, one already_done')

 const foreignId=(await admin.query(`insert into public.notifications(user_id,kind,key,title,body,url,due_at)
 values($1,'due','due:other','Cards','Review','#/review',now()) returning id`,[other])).rows[0].id
 const foreign=await tap(foreignId,'open',owner)
 assert.equal(foreign.status,'already_done')
 assert.equal((await admin.query('select action from public.notifications where id=$1',[foreignId])).rows[0].action,null)
 console.log('PASS NOTIF-1b service-role RPC cannot claim a different owner')

 const wrongId=(await admin.query(`insert into public.notifications(user_id,kind,key,title,body,url,due_at)
 values($1,'due','due:wrong','Cards','Review','#/review',now()) returning id`,[owner])).rows[0].id
 await assert.rejects(tap(wrongId,'approve_cards'),/bad_action/)
 assert.equal((await admin.query('select action from public.notifications where id=$1',[wrongId])).rows[0].action,null)
 console.log('PASS NOTIF-1b invalid action rolls back claim in real PostgreSQL')
}finally{await admin.end()}
