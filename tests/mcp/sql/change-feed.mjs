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
 // Reproduce Supabase browser default table grants *before* creating any
 // domain tables. New read-only feed tables must revoke every write grant
 // explicitly: RLS by itself is not an ACL substitute.
 await db.exec('alter default privileges in schema public grant insert,update,delete,truncate on tables to anon,authenticated');
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
 let lastCommandEnvelope='';
 const cmd=async(op,id=null,version=null)=>{
  const p={schemaVersion:1,resource:'study_entries',operation:op,
   operationId:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(++serial).padStart(12,'0'),
   ...(id?{target:{id}}:{}),...(version?{expectedVersion:version}:{}),
   patch:op==='create'?{source:'manual',intent:'Feed proof'}:
     op==='update'?{intent:'Revised proof'}:{}};
  lastCommandEnvelope=JSON.stringify(p);
  return (await q('select public.study_command($1::jsonb) receipt',[lastCommandEnvelope]))[0].receipt;
 };
 await as(a);
 const created=await cmd('create');
 assert.equal(created.status,'ok');
 const beforeReplay=(await q("select count(*)::int n from public.owner_changes where user_id=$1",[a]))[0].n;
 const retry=(await q('select public.study_command($1::jsonb) receipt',[lastCommandEnvelope]))[0].receipt;
 assert.deepEqual(retry,created,'exact command retry returns its original receipt');
 assert.equal((await q("select count(*)::int n from public.owner_changes where user_id=$1",[a]))[0].n,beforeReplay,
  'idempotent command retry must not append another owner delta');
 const id=created.changed[0].id;
 const revised=await cmd('update',id,1);
 assert.equal(revised.status,'ok');
 const removed=await cmd('delete',id,2);
 assert.equal(removed.status,'ok');
 const page=(await q('select public.changes_since(0,2) as result'))[0].result;
 assert.equal(page.changes.length,2,`unexpected owner feed: ${JSON.stringify(page.changes)}`);
 assert.ok(page.changes.every(x=>x.resource==='study_entries'||x.resource==='settings'));
 assert.ok(page.changes[0].cursor<page.changes[1].cursor);
 const all=(await q('select public.changes_since(0,100) as result'))[0].result;
 const changes=all.changes.filter(x=>x.resource==='study_entries');
 assert.equal(changes.length,3,`expected one row per mutation: ${JSON.stringify(changes)}`);
 assert.deepEqual(changes.map(x=>x.op),['insert','update','delete']);
 assert.ok(changes.every((x,i)=>i===0||x.cursor>changes[i-1].cursor),
  'same-owner mutations have monotonically ordered visible cursors');
 assert.equal(changes[0].record_id,id);
 assert.ok(changes[2].tombstone);
 assert.equal(changes[2].version,2,`delete must retain old version: ${JSON.stringify(changes[2])}`);
 const after=(await q('select public.changes_since($1,100) result',[page.nextCursor]))[0].result;
 assert.ok(after.changes.every(x=>x.cursor>page.nextCursor));
 await assert.rejects(q('select public.changes_since(0,101)'),/Invalid change feed/);
 await as(b);
 // This fixture also inserted the other owner's settings row; its own
 // journal event must remain visible. The owner's study mutations must not.
 // Every browser DML privilege must be denied on BOTH new tables even
 // when the platform grants them by default at CREATE TABLE time.
 for(const role of ['anon','authenticated']){
  for(const table of ['owner_changes','owner_change_retention']){
   for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']){
    const allowed=(await q('select has_table_privilege($1,$2,$3) result',
     [role,'public.'+table,privilege]))[0].result;
    assert.equal(allowed,false,
     role+' must not have '+privilege+' on new feed table '+table);
   }
  }
 }
 await assert.rejects(q(
  "insert into public.owner_changes(user_id,resource,record_id,version,op,tombstone) values($1,'tasks','blocked',1,'insert',false)",
  [b]),/permission denied|row-level security/i,
  'direct authenticated DML cannot inject a fake change event');
 const otherFeed=(await q('select public.changes_since(0,100) result'))[0].result.changes;
 assert.equal(otherFeed.filter(x=>x.resource==='settings').length,1,
  'second owner still sees their own settings write');
 assert.equal(otherFeed.some(x=>x.resource==='study_entries'),false,
  'another owner must never see the first owner study lifecycle');
 assert.deepEqual(await q('select cursor from public.owner_changes where user_id=$1',[a]),[]);
 await db.exec('reset role');
 // Regression: real undo-registered resources have non-UUID and composite
 // primary keys. The feed must never abort the original action by casting
 // e.g. a legacy note key "N" to uuid.
 const lastAction=(await q('select no from public.actions where user_id=$1 order by no desc limit 1',
  [a]))[0].no;
 await q("insert into public.action_changes(action_no,seq,table_name,row_pk,op,new) values($1,999,'notes',$2::jsonb,'insert',$3::jsonb)",
  [lastAction,JSON.stringify({id:'N'}),JSON.stringify({id:'N',version:1})]);
 await as(a);
 const withStringKey=(await q('select public.changes_since(0,100) result'))[0].result.changes;
 assert.equal(withStringKey.find(x=>x.resource==='notes')?.record_id,'N',
  'non-UUID journal IDs retain their source identifier verbatim');
 // Future undo-registry additions are picked up without installing another
 // domain trigger or editing the projection function. An unregistered
 // resource's journal rows stay excluded until the table is registered.
 const future='future_feed_fixture';
 await db.exec('reset role');
 await db.exec("create table public.future_feed_fixture(id uuid primary key,user_id uuid not null,version int not null); create trigger lemma_log_change after insert or update or delete on public.future_feed_fixture for each row execute function public.log_change();");
 const futureId='abcdabcd-abcd-4bcd-8bcd-abcdabcdabcd';
 const logFuture=async seq=>q(
  "insert into public.action_changes(action_no,seq,table_name,row_pk,op,new) values($1,$2,$3,$4::jsonb,'insert',$5::jsonb)",
  [lastAction,seq,future,JSON.stringify({id:futureId}),
   JSON.stringify({id:futureId,user_id:a,version:1})]);
 const preCount=(await q("select count(*)::int n from public.owner_changes where user_id=$1",[a]))[0].n;
 await db.exec('reset role');
 await logFuture(1000);
 assert.equal((await q("select count(*)::int n from public.owner_changes where user_id=$1",[a]))[0].n,
  preCount,'unregistered journal tables do not generate owner deltas');
 await q('insert into public.lemma_undo_tables(table_name) values($1)',[future]);
 await logFuture(1001);
 await as(a);
 const later=(await q('select public.changes_since(0,100) result'))[0].result.changes;
 assert.equal(later.filter(x=>x.resource===future).length,1,
  'newly registered owner table projects writes without a function replacement');
 assert.equal(later.find(x=>x.resource===future)?.record_id,futureId);

 await assert.rejects(q('select public.lemma_prune_owner_changes()'),
  /Only the scheduled service role|permission denied/i,
  'authenticated clients may never prune other owners\u0027 deltas');
 await db.exec('reset role');
 const oldest=changes[1].cursor;
 await q("update public.owner_changes set committed_at=now()-interval '31 days' where user_id=$1 and cursor<=$2",
  [a,oldest]);
 await db.exec('set role service_role');
 const pruned=(await q('select public.lemma_prune_owner_changes() n'))[0].n;
 assert.ok(pruned>=2);
 const repeated=(await q('select public.lemma_prune_owner_changes() n'))[0].n;
 assert.equal(repeated,0,'retention prune is idempotent without newly expired rows');
 await as(a);
 const reset=(await q('select public.changes_since(1,100) result'))[0].result;
 assert.equal(reset.reset,true,'pruning announces a replay/reset for stale cursors');
 const initial=(await q('select public.changes_since(0,100) result'))[0].result;
 assert.equal(initial.reset,true,
  'even an initial cursor zero needs a full projection rebuild after retention');
 assert.ok(reset.changes.every(x=>x.cursor>oldest));
 assert.ok(reset.changes.some(x=>x.resource===future),
  'retention preserves newer dynamically registered resource deltas');
 await as(b);
 assert.deepEqual(await q('select user_id from public.owner_change_retention where user_id=$1',[a]),[],
  'retention watermark is owner-RLS protected independently of the event feed');
 const otherReset=(await q('select public.changes_since(0,100) result'))[0].result;
 assert.equal(otherReset.reset,false,
  'one owner\u0027s retention cannot force a second owner to reset');
 // The existing service-role MCP dispatcher writes through the same
 // journal, so it must contribute exactly one owner-scoped change.
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 const mcpPayload={schemaVersion:1,resource:'tasks',operation:'create',
  operationId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000090',
  patch:{title:'MCP journal test'}};
 const mcp=(await q("select public.mcp_command($1::uuid,'chatgpt',$2::jsonb) receipt",
  [a,JSON.stringify(mcpPayload)]))[0].receipt;
 assert.equal(mcp.status,'ok');
 await as(a);
 const mcpItems=(await q('select public.changes_since(0,100) result'))[0]
  .result.changes.filter(x=>x.resource==='tasks');
 assert.equal(mcpItems.length,1,'MCP write appears exactly once');
 assert.equal(mcpItems[0].record_id,mcp.changed[0].id);
 await as(b);
 assert.equal((await q('select public.changes_since(0,100) result'))[0]
  .result.changes.some(x=>x.record_id===mcp.changed[0].id),false,
  'second owner cannot read the MCP action delta');

 // A scheduled notification tick must not be blocked by an unbounded
 // multi-tenant backlog. Drain a 550-row expired batch in bounded calls.
 await db.exec('reset role');
 await q("insert into public.owner_changes(user_id,resource,record_id,version,op,tombstone,committed_at) select $1,'tasks',i::text,1,'insert',false,now()-interval '32 days' from generate_series(1,550) i",[a]);
 await db.exec('set role service_role');
 const tick1=(await q('select public.lemma_prune_owner_changes() n'))[0].n;
 assert.equal(tick1,500,'one tick prunes at most 500 rows from one owner');
 const tick2=(await q('select public.lemma_prune_owner_changes() n'))[0].n;
 assert.equal(tick2,50,'a subsequent tick drains the remaining expired rows');
 const tick3=(await q('select public.lemma_prune_owner_changes() n'))[0].n;
 assert.equal(tick3,0,'the bounded prune is idempotent when the queue drains');
 await as(a);
 assert.equal((await q("select count(*)::int n from public.owner_changes where user_id=$1 and committed_at<now()-interval '30 days'",[a]))[0].n,0);
 console.log('PASS N54 owner-scoped journal projection, paging, non-UUID keys, tombstones, MCP and reset');
}finally{await db.close()}
