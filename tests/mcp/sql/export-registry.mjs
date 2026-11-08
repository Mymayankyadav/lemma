// N95: integration guard for the authoritative dynamic undo registry.
// The owner export must be based on this registry, never a hardcoded table list.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
  "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
  "create function auth.uid() returns uuid language sql as $auth$ "+
  "select nullif(current_setting('test.uid',true),'')::uuid $auth$;"+
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$ "+
  "select decode(repeat('00',n),'hex') $bytes$;"+
  "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
 // Registry discovery is an intentionally unresolved server-authorization
 // blocker (#1156): an authenticated browser must not gain this grant via N95.
 const registryAcl=(await q("select has_table_privilege('authenticated','public.lemma_undo_tables','SELECT') as can_read,has_table_privilege('authenticated','public.lemma_undo_tables','INSERT') as can_write"))[0];
 assert.deepEqual(registryAcl,{can_read:false,can_write:false});
 await db.exec('set role authenticated');
 await assert.rejects(q('select table_name from public.lemma_undo_tables limit 1'),
  /permission denied|not authorized/i,'browser cannot read the undo registry today');
 await db.exec('reset role');
 const registry=(await q('select table_name from public.lemma_undo_tables order by table_name'))
  .map(r=>r.table_name);
 assert.ok(registry.length>20,'registry includes v6 owner resources');
 for(const expected of ['settings','tasks','study_entries','study_intervals','reviews','proposals'])
  assert.ok(registry.includes(expected),'required registered owner table '+expected);
 assert.equal(new Set(registry).size,registry.length,'registry has no duplicate names');
 for(const name of registry){
  assert.match(name,/^[a-z_][a-z0-9_]*$/);
  const exists=(await q('select to_regclass($1) is not null as found',['public.'+name]))[0].found;
  assert.equal(exists,true,'registered table has real owner schema: '+name);
 }
 const active=(await q('select count(*)::int total from public.lemma_undo_tables'))[0].total;
 assert.equal(active,registry.length);
 // A dynamically registered table must become discoverable without changing
 // a client-side array or shipping a new frontend build.
 await q("insert into public.lemma_undo_tables(table_name) values('test_export_resource')");
 const extended=(await q('select table_name from public.lemma_undo_tables order by table_name'))
  .map(r=>r.table_name);
 assert.ok(extended.includes('test_export_resource'));
 assert.equal(extended.length,registry.length+1);
 console.log('PASS N95 database registry names, dynamic registration and bounded schema identifiers');

 // An authenticated browser may execute only the owner-bound export RPC,
 // not SELECT the registry. anon and service_role have no EXECUTE privilege.
 const permitted=(await q("select has_function_privilege('authenticated','public.lemma_export_page(text,text,integer)','EXECUTE') allowed,has_function_privilege('anon','public.lemma_export_page(text,text,integer)','EXECUTE') anonymous,has_function_privilege('service_role','public.lemma_export_page(text,text,integer)','EXECUTE') service"))[0];
 assert.deepEqual(permitted,{allowed:true,anonymous:false,service:false});
 const a='11111111-1111-4111-8111-111111111111';
 const b='22222222-2222-4222-8222-222222222222';
 await q("insert into auth.users(id) values($1),($2)",[a,b]);
 // Journal actions cannot mix owners: seed independent owner transactions.
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[a,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[b,'b'.repeat(48)]);
 for(let i=0;i<112;i++)await q("insert into public.subjects(user_id,name,glyph,hue) values($1,$2,'M','cyan')",[a,'N95 Subject '+i]);
 await q("insert into public.subjects(user_id,name,glyph,hue) values($1,'Other owner subject','M','cyan')",[b]);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[a]);
 const exportPage=async(table,cursor,limit)=>(await q(
  'select public.lemma_export_page($1,$2,$3) output',[table,cursor,limit]))[0].output;
 const names=await exportPage(null,null,5);
 assert.equal(names.rows.length,5,'registry list has a bounded page');
 const moreNames=await exportPage(null,names.nextCursor,5);
 assert.equal(moreNames.rows.length,5,'registry names have a stable cursor');
 assert(names.rows.every(row=>row.table_name),'all registry entries have table_name');
 await assert.rejects(exportPage('auth.users',null,5),/not registered/);
 await assert.rejects(exportPage('lemma_undo_tables',null,5),/not registered/);
 await assert.rejects(exportPage('subjects',null,101),/page limit/);
 await assert.rejects(exportPage('subjects','"not an array"',5),/cursor/);
 const settings=await exportPage('settings',null,100);
 assert.equal(settings.rows.length,1,'caller sees only its own settings');
 assert.equal(settings.rows[0].user_id,a);
 assert(!('connector_secret' in settings.rows[0]),'connector secret never reaches browser');
 let cursor=null,returned=[];
 for(let page=0;page<30;page++){
  const result=await exportPage('subjects',cursor,10);
  returned.push(...result.rows);
  if(result.rows.length<10)break;
  assert.notEqual(result.nextCursor,cursor,'cursor advances');
  cursor=result.nextCursor;
 }
 assert.equal(returned.length,112,'all owner subjects returned across keyset pages');
 assert.equal(new Set(returned.map(row=>row.id)).size,112,'no duplicate pages');
 assert(returned.every(row=>row.user_id===a),'no foreign owner rows');
 await q("select set_config('test.uid',$1,false)",[b]);
 assert.equal((await exportPage('subjects',null,100)).rows.length,1);
 const otherSettings=await exportPage('settings',null,100);
 assert.equal(otherSettings.rows.length,1);
 assert.equal(otherSettings.rows[0].user_id,b);
 await db.exec('reset role');
 console.log('PASS N95 authenticated-only RPC, owner rows, keysets, registry paging and credential redaction');
}finally{await db.close()}
