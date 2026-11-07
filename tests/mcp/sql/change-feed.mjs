// N54 owner journal feed, bounded cursor, tenant RLS and retention: PGlite.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const a='11111111-1111-1111-1111-111111111111';
const b='99999999-9999-9999-9999-999999999999';
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const as=async owner=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
};
try{
 await db.exec([
  'create role anon;create role authenticated;create role service_role;',
  'create schema auth;create schema extensions;',
  'create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$ select decode(repeat('00',n),'hex') $bytes$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261118010000_owner_changes.sql'));
 for(const path of migrations)await db.exec(await readFile(new URL(path,dir),'utf8'));
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/owner_changes.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.owner_changes'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.deepEqual(Object.keys(doc.columns).sort(),columns);
 await q('insert into auth.users(id) values($1),($2)',[a,b]);
 for(const [owner,secret] of [[a,'a'.repeat(48)],[b,'b'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,secret]);
 let serial=0;
 const cmd=async(op,id=null,version=null)=>{
  const p={schemaVersion:1,resource:'study_entries',operation:op,
   operationId:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(++serial).padStart(12,'0'),
   ...(id?{target:{id}}:{}),...(version?{expectedVersion:version}:{}),
   patch:op==='create'?{source:'manual',intent:'Feed proof'}:
     op==='update'?{intent:'Revised proof'}:{}};
  return (await q('select public.study_command($1::jsonb) receipt',[JSON.stringify(p)]))[0].receipt;
 };
 await as(a);
 const created=await cmd('create');
 assert.equal(created.status,'ok');
 const id=created.changed[0].id;
 const revised=await cmd('update',id,1);
 assert.equal(revised.status,'ok');
 const removed=await cmd('delete',id,2);
 assert.equal(removed.status,'ok');
 const page=(await q('select public.changes_since(0,2) as result'))[0].result;
 assert.equal(page.changes.length,2);
 assert.ok(page.changes.every(x=>x.resource==='study_entries'||x.resource==='settings'));
 assert.ok(page.changes[0].cursor<page.changes[1].cursor);
 const all=(await q('select public.changes_since(0,100) as result'))[0].result;
 const changes=all.changes.filter(x=>x.resource==='study_entries');
 assert.equal(changes.length,3,'one feed row per journalled mutation');
 assert.deepEqual(changes.map(x=>x.op),['insert','update','delete']);
 assert.equal(changes[0].record_id,id);
 assert.ok(changes[2].tombstone);
 assert.equal(changes[2].version,2);
 const after=(await q('select public.changes_since($1,100) result',[page.nextCursor]))[0].result;
 assert.ok(after.changes.every(x=>x.cursor>page.nextCursor));
 await assert.rejects(q('select public.changes_since(0,101)'),/Invalid change feed/);
 await as(b);
 assert.equal((await q('select public.changes_since(0,100) result'))[0].result.changes.length,0);
 assert.deepEqual(await q('select cursor from public.owner_changes where user_id=$1',[a]),[]);
 await db.exec('reset role');
 const oldest=changes[1].cursor;
 await q("update public.owner_changes set committed_at=now()-interval '31 days' where user_id=$1 and cursor<=$2",
  [a,oldest]);
 await db.exec('set role service_role');
 const pruned=(await q('select public.lemma_prune_owner_changes() n'))[0].n;
 assert.ok(pruned>=2);
 await as(a);
 const reset=(await q('select public.changes_since(1,100) result'))[0].result;
 assert.equal(reset.reset,true,'pruning announces a replay/reset for stale cursors');
 assert.ok(reset.changes.every(x=>x.cursor>oldest));
 console.log('PASS N54 owner-scoped journal projection, paging, tombstones and reset');
}finally{await db.close()}
