// N160 (area 13): record, correct, split, void and restore saved time through the
// connector's own bridge, with undo. PGlite only: never production.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const role=async(name)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await q("select set_config('request.jwt.claims','',false)");
 if(name)await db.exec('set role '+name);
};
let n=0;
const env=(operation,extra={})=>({operationId:'cccccccc-cccc-4ccc-8ccc-'+String(++n).padStart(12,'0'),
 schemaVersion:1,resource:'study_entries',operation,...extra});
const mcp=async(user,payload)=>{
 await role('service_role');
 try{return (await q('select public.mcp_study_command($1::uuid,$2::text,$3::jsonb) r',[user,'claude',JSON.stringify(payload)]))[0].r}
 finally{await role(null)}
};
const seconds=async(ids)=>(await q('select coalesce(sum(extract(epoch from ended_at-started_at)),0)::int s from public.study_intervals where entry_id=any($1::uuid[])',[ids]))[0].s;
const undo=async(no)=>{await role('service_role');try{return (await q('select public.undo_action($1::uuid,$2::bigint,false) r',[owner,no]))[0].r}finally{await role(null)}};
const ok=r=>{assert.equal(r.status,'ok');assert.ok(r.actionNo>0);return r};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(
    nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid)
  $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 const spans=[{kind:'focus',started_at:'2026-11-05T09:00:00Z',ended_at:'2026-11-05T10:00:00Z'},
  {kind:'break',started_at:'2026-11-05T10:00:00Z',ended_at:'2026-11-05T10:10:00Z'},
  {kind:'focus',started_at:'2026-11-05T10:10:00Z',ended_at:'2026-11-05T11:00:00Z'}];
 // Manually record time (with retry replay and a changed-payload conflict).
 const manual=env('create_manual',{patch:{intent:'Work through the proof',intervals:spans}});
 const created=ok(await mcp(owner,manual));
 const id=created.changed[0].id;
 assert.deepEqual(await mcp(owner,manual),created);
 assert.equal((await mcp(owner,{...manual,patch:{intent:'Other',intervals:spans}})).status,'conflict');
 assert.equal(await seconds([id]),7200);
 assert.equal((await q('select source,status from public.study_entries where id=$1',[id]))[0].source,'manual');
 assert.equal((await q('select source from public.actions where no=$1',[created.actionNo]))[0].source,'claude');
 // Correct the interval set; a stale version conflicts; undo restores it.
 const corrected=ok(await mcp(owner,env('correct',{target:{id},expectedVersion:1,
  patch:{intervals:[{kind:'focus',started_at:'2026-11-05T09:00:00Z',ended_at:'2026-11-05T09:30:00Z'}]}})));
 assert.equal(await seconds([id]),1800);
 await undo(corrected.actionNo);
 assert.equal(await seconds([id]),7200);
 assert.equal((await mcp(owner,env('correct',{target:{id},expectedVersion:99,patch:{intent:'stale'}}))).status,'conflict');
 // Split inside the break, void the second half, restore it.
 const split=ok(await mcp(owner,env('split',{target:{id},expectedVersion:1,patch:{at:'2026-11-05T10:05:00Z'}})));
 const second=split.changed[1].id;
 assert.equal(await seconds([id,second]),7200);
 const voided=ok(await mcp(owner,env('void',{target:{id:second},expectedVersion:1})));
 assert.equal((await q("select count(*)::int n from public.study_entries where id=$1 and status='saved'",[second]))[0].n,0);
 ok(await mcp(owner,env('restore',{target:{id:second},expectedVersion:2})));
 assert.equal((await q("select count(*)::int n from public.study_entries where id=$1 and status='saved'",[second]))[0].n,1);
 void voided;
 // Another owner cannot touch them.
 await assert.rejects(mcp(other,env('void',{target:{id},expectedVersion:2})),/not found|Not found|not yours/i);
 console.log('N160 time logs through the connector: record, correct, split, void, restore and undo passed');
}finally{await db.close()}
