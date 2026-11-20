// Native PostgreSQL only: independent clients must actually wait on the same operation or first-library lock.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {firstStudyMigrationStack} from './fixtures/n195-foundation/load.mjs';
const {default:pg}=await import(process.env.PG_MODULE||'pg');
const {Client}=pg;
const host=process.env.N195_PG_SOCKET;
let connection;
if(host){
 if(!host.startsWith('/')||host.includes('..'))throw Error('An absolute isolated local PostgreSQL socket directory is required');
 connection={host,port:Number(process.env.N195_PG_PORT||5432),user:'postgres'};
}else{
 // Use the already-provisioned CI PostgreSQL service, never a Supabase URL.
 // Each run still creates and destroys its own randomly named database.
 const url=new URL(process.env.NOTIF_TEST_DATABASE_URL||'postgres://invalid');
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  ||url.username!=='postgres'||url.password!=='test-only'||url.pathname!=='/lemma_test'||url.search)
  throw Error('Use N195_PG_SOCKET or the isolated localhost lemma_test PostgreSQL service');
 connection={host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),user:'postgres',password:'test-only'};
}
const name='lemma_n195_'+randomUUID().replaceAll('-','');
const client=async database=>{const db=new Client({...connection,database});await db.connect();return db;};
const admin=await client('postgres');
let schema,a,b;
try{
 await admin.query('create database '+name);
 schema=await client(name);
 for(const role of ['anon','authenticated','service_role']){
  if(!(await schema.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)await schema.query('create role '+role);
 }
 await schema.query(`
  create schema auth; create schema extensions; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(repeat('00',n),'hex') $$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 `);
 const dir=process.env.N195_TEST_MIGRATIONS||fileURLToPath(new URL('../../../supabase/migrations/',import.meta.url));
 for(const {sql} of await firstStudyMigrationStack(dir))await schema.query(sql);
 await schema.query("create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select true'");
 a=await client(name);b=await client(name);
 const owner=randomUUID(),second=randomUUID();
 for(const uid of [owner,second]){
  await schema.query('insert into auth.users(id) values($1)',[uid]);
  await schema.query('insert into public.settings(user_id,connector_secret) values($1,$2)',[uid,uid.replaceAll('-','').repeat(2).slice(0,48)]);
 }
 async function as(uid){
  for(const c of [a,b]){
   await c.query('reset role');await c.query("select set_config('test.uid',$1,false)",[uid]);await c.query('set role authenticated');
  }
 }
 const create=(c,id,uid)=>c.query('select public.create_first_study_card($1,$2,$3,$4,$5) as result',
  [id,uid,JSON.stringify({kind:'new',title:'Topology'}),'Question','Answer']).then(r=>r.rows[0].result);
 async function compete(first,second,commit=true){
  await a.query('begin');
  const r1=await first(a);
  const pending=second(b);
  const deadline=Date.now()+5000;
  let blocked=false;
  while(Date.now()<deadline){
   blocked=(await schema.query("select wait_event_type='Lock' as blocked from pg_stat_activity where pid=$1",[b.processID])).rows[0]?.blocked;
   if(blocked)break;
   await wait(15);
  }
  await a.query(commit?'commit':'rollback');
  const r2=await pending;
  assert.equal(blocked,true,'The competing backend must have waited on the open transaction');
  return [r1,r2];
 }
 await as(owner);
 const firstOp=randomUUID();
 const [first,replay]=await compete(c=>create(c,firstOp,owner),c=>create(c,firstOp,owner));
 assert.deepEqual(first,replay);assert.equal(first.status,'applied');
 const admission=(await a.query('select public.start_study_target($1,$2,$3) as result',[randomUUID(),'card',first.cardId])).rows[0].result;
 const item=(await a.query('select id,expected_card_version from public.review_run_items where run_id=$1',[admission.runId])).rows[0];
 const n=new Date().toISOString();
 const args=[randomUUID(),admission.runId,item.id,first.cardId,admission.runVersion,item.expected_card_version,3,null,780,
  JSON.stringify({state:2,due:n,stability:1,difficulty:5,last_review:n,step:0,reps:1,lapses:0})];
 const grade=c=>c.query('select public.grade_study_run_item($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',args).then(r=>r.rows[0].result);
 const [,afterRollback]=await compete(grade,grade,false);
 assert.equal(afterRollback.status,'applied');assert.deepEqual(await grade(a),afterRollback);
 assert.equal((await a.query('select count(*)::int n from public.reviews')).rows[0].n,1);
 assert.equal((await a.query('select reps from public.cards where id=$1',[first.cardId])).rows[0].reps,1);
 assert.equal((await a.query('select position from public.review_runs where id=$1',[admission.runId])).rows[0].position,1);
 await as(second);
 const [win,lose]=await compete(c=>create(c,randomUUID(),second),c=>create(c,randomUUID(),second));
 assert.equal(win.status,'applied');assert.equal(lose.reason,'library_changed');
 assert.equal((await a.query('select count(*)::int n from public.notes')).rows[0].n,1);
 console.log('PASS native PostgreSQL contention: duplicate first-save replay, two-tab first-use race and grade takeover after rollback');
}finally{
 for(const c of [a,b,schema])if(c)await c.end();
 await admin.query('drop database if exists '+name+' with (force)');await admin.end();
}
