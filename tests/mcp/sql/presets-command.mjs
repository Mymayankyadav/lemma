// N41.2.1: new owner-scoped preset command foundation in full-migration PGlite.
// N41.2.2 extends this file with reorder/archive/restore/delete, undo, MCP parity.
// This test never connects to production.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const as=async id=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
};
let count=0;
const envelope=(operation,extra={})=>({
  operationId:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(++count).padStart(12,'0'),
  schemaVersion:1,resource:'presets',operation,...extra
});
const command=async p=>(await q('select public.presets_command($1::jsonb) result',
  [JSON.stringify(p)]))[0].result;
const fetch=async id=>(await q('select * from public.presets where id=$1',[id]))[0];
const ok=receipt=>{
  assert.equal(receipt.status,'ok');
  assert.equal(receipt.changed.length,1);
  assert.ok(Number.isSafeInteger(receipt.actionNo)&&receipt.actionNo>0);
};
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $auth$
      select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
        nullif(current_setting('test.uid',true),'')::uuid) $auth$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as
      $bytes$select decode(repeat('00',n),'hex')$bytes$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
  assert.ok(files.includes('20261107050000_presets_command_foundation.sql'));
  for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
  await q('insert into auth.users(id) values($1),($2)',[owner,other]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [owner,'1'.repeat(48)]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [other,'2'.repeat(48)]);
  await as(owner);
  const first=envelope('create',{patch:{label:'Proof blocks',
    mode:'flowtime',focus_minutes:60,break_minutes:10,cycles:3,position:5}});
  const a=await command(first);ok(a);
  const id=a.changed[0].id;
  assert.equal(a.changed[0].version,1);
  assert.equal((await fetch(id)).user_id,owner);
  assert.equal((await fetch(id)).label,'Proof blocks');
  assert.equal((await fetch(id)).mode,'flowtime');
  assert.deepEqual(await command(first),a,'exact retry replays the same receipt');
  const countBefore=(await q('select count(*)::int n from public.presets'))[0].n;
  const mismatch=await command({...first,patch:{label:'Different'}});
  assert.equal(mismatch.status,'conflict','changed-payload retry cannot rewrite a preset');
  assert.equal((await q('select count(*)::int n from public.presets'))[0].n,countBefore);
  const stale=await command(envelope('update',{
    target:{id},expectedVersion:10,patch:{label:'Stale title'}}));
  assert.equal(stale.status,'conflict');
  assert.equal(stale.actionNo,null);
  assert.equal(stale.conflict.currentVersion,1);
  const edited=await command(envelope('update',{
    target:{id},expectedVersion:1,patch:{label:'Algebra proofs',cycles:4}}));
  ok(edited);
  assert.equal(edited.changed[0].version,2);
  assert.equal((await fetch(id)).label,'Algebra proofs');
  assert.equal((await fetch(id)).cycles,4);
  await assert.rejects(command(envelope('create',{patch:{label:' ',
    mode:'pomodoro'}})),/violates check constraint|presets_label_valid/i);
  await assert.rejects(command(envelope('create',{patch:{label:'Invalid',
    focus_minutes:481}})),/violates check constraint|presets_focus_valid/i);
  await assert.rejects(command(envelope('create',{patch:{label:'Invalid',
    cycles:'4'}})),/Invalid preset integer/i);
  await assert.rejects(command(envelope('create',{patch:{label:'Invalid',
    source:'worker'}})),/Unknown preset patch field/i);
  await assert.rejects(command(envelope('update',{
    target:{id},expectedVersion:2,patch:{position:0}})),/Unknown preset patch field/i);
  await assert.rejects(command(envelope('archive',{
    target:{id},expectedVersion:2,patch:{}})),/Unsupported preset operation/i);
  const action=(await q('select user_id from public.actions where no=$1',
    [edited.actionNo]))[0];
  assert.equal(action.user_id,owner);
  await as(other);
  assert.equal((await q('select count(*)::int n from public.presets'))[0].n,0);
  await assert.rejects(command(envelope('update',{
    target:{id},expectedVersion:2,patch:{label:'Steal'}})),/Preset not found/i);
  const own=await command(envelope('create',{patch:{label:'Other owner'}}));
  ok(own);
  await as(owner);
  assert.equal((await q('select count(*)::int n from public.presets where id=$1',
    [own.changed[0].id]))[0].n,0);
  await assert.rejects(command(envelope('create',{
    patch:{label:'Owner spoof',user_id:other}})),/Unknown preset patch field/i);
  const receipt=(await q('select result from public.command_receipts where user_id=$1 and operation_id=$2',
    [owner,first.operationId]))[0].result;
  assert.equal(receipt._request.operationId,first.operationId,
    'private receipt stores request so changed retries are detectable');
  assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='presets'"))[0].n,0,
    'the command is deliberately not registered before N41.2.2');
  console.log('PASS N41.2.1 create/update, retries, validation, version and owner boundaries');
}finally {await db.close();}
