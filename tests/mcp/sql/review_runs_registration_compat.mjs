// Regression for bug #1086: N48.1's read-only stage must remain provable
// even after N48.2 adds journalled command registration in a later migration.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
try{
  await db.exec([
    'create role anon; create role authenticated; create role service_role;',
    'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
    "create function auth.uid() returns uuid language sql as $a$ select nullif(current_setting('test.uid',true),'')::uuid $a$;",
    "create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$ select decode(repeat('00',n),'hex') $b$;",
    'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
  ].join('\n'));
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
  assert.ok(files.includes('20261107222000_review_runs_base.sql'));
  let inspectedStage=false;
  for(const file of files){
    await db.exec(await readFile(new URL(file,dir),'utf8'));
    if(file==='20261107222000_review_runs_base.sql'){
      inspectedStage=true;
      for(const table of ['review_runs','review_run_items']){
        assert.equal((await q('select count(*)::int n from public.lemma_undo_tables where table_name=$1',[table]))[0].n,0,
          'N48.1 must stage without undo registration');
        assert.equal((await q("select count(*)::int n from pg_trigger where tgrelid=$1::regclass and tgname='lemma_log_change'",['public.'+table]))[0].n,0,
          'N48.1 must not expose mutation triggers before the command');
      }
      assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='review_runs'"))[0].n,0);
    }
  }
  assert.ok(inspectedStage);
  const installed=(await q("select to_regprocedure('public.review_runs_command(jsonb)') is not null as yes"))[0].yes;
  assert.equal(installed,files.includes('20261111020000_review_runs_command.sql'),
    'registration follows the actual command migration');
  for(const table of ['review_runs','review_run_items']){
    assert.equal((await q('select count(*)::int n from public.lemma_undo_tables where table_name=$1',[table]))[0].n,Number(installed));
    assert.equal((await q("select count(*)::int n from pg_trigger where tgrelid=$1::regclass and tgname='lemma_log_change'",['public.'+table]))[0].n,Number(installed));
    const perms=(await q("select has_table_privilege('authenticated',$1,'INSERT') ins, has_table_privilege('authenticated',$1,'UPDATE') upd, has_table_privilege('authenticated',$1,'DELETE') del",['public.'+table]))[0];
    assert.deepEqual(perms,{ins:false,upd:false,del:false},
      'direct authenticated writes stay closed after command activation');
  }
  const resource=await q("select command_fn,mcp_ok from public.lemma_command_resources where resource='review_runs'");
  assert.equal(resource.length,Number(installed));
  if(installed){
    assert.equal(resource[0].command_fn,'review_runs_command');
    assert.equal(resource[0].mcp_ok,true);
  }
  console.log('PASS N48.1 staging invariants and N48.2 additive registry compatibility');
}finally{await db.close();}
