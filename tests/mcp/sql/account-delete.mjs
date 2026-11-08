// N103: owner cascade and browser-denied deletion request SQL contracts.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,params=[])=>(await db.query(sql,params)).rows;
// Give the SQL gate a stable assertion ID: its summary otherwise reports only
// "Expected values to be strictly equal" without the failing test location.
function checkEqual(actual,expected,message){
 const caller=new Error().stack?.split('\n')[2]||'';
 let line=Number(caller.match(/:(\d+):\d+\)?$/)?.[1]||0),label='';
 while(line>0){label=String.fromCharCode(65+(line-1)%26)+label;line=Math.floor((line-1)/26);}
 return assert.equal(actual,expected,message??('ACCOUNT_DELETE_CHECK_'+(label||'UNKNOWN')));
}
const A='11111111-1111-1111-1111-111111111111';
const B='22222222-2222-2222-2222-222222222222';
try{
 await db.exec('create role anon;create role authenticated;create role service_role;'+
  'create schema auth;create schema extensions;'+
  'create table auth.users(id uuid primary key)');
 await db.exec("create function auth.uid() returns uuid language sql as $auth$"+
  "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,"+
  "nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql "+
  "as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated;"+
  "grant execute on function auth.uid() to authenticated");
 const directory=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(directory)).filter(n=>n.endsWith('.sql')&&
  !n.includes('_storage')).sort();
 assert(names.includes('20261207062300_account_delete_guard.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,directory),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[A,B]);
 for(const id of [A,B])
  await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
   [id,id===A?'a'.repeat(48):'b'.repeat(48)]);
 // Exercise a representative multi-level owner data graph, not merely
 // settings and actions: projects -> notes -> cards -> reviews. The second
 // owner must retain every record after the first owner is deleted.
 const records=[
  {user:A,subject:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   project:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   note:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   card:'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',slug:'owner-a'},
  {user:B,subject:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   project:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   note:'ffffffff-ffff-4fff-8fff-ffffffffffff',
   card:'22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',slug:'owner-b'}
 ];
 for(const fixture of records){
  const {user,subject,project,note,card,slug}=fixture;
  await q('insert into public.subjects(id,user_id,name,glyph,hue) '+
   'values($1,$2,$3,$4,$5)',[subject,user,'Owner '+slug,'∑','amber']);
  await q('insert into public.projects(id,user_id,slug,subject_id,title,goal) '+
   'values($1,$2,$3,$4,$5,$6)',[project,user,slug,subject,
    'Private '+slug,'Delete only the target owner']);
  await q('insert into public.notes(id,user_id,project_id,front,back) '+
   'values($1,$2,$3,$4,$5)',[note,user,project,'Owner note '+slug,'Private answer']);
  await q('insert into public.cards(id,user_id,note_id,ord) '+
   'values($1,$2,$3,1)',[card,user,note]);
  await q('insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) '+
   "values($1,$2,3,0,100,'{}'::jsonb)",[user,card]);
 }
 // Audit details do not carry user_id. Their FK to owner actions must be
 // removed before the parent action; another owner's audit remains intact.
 const actionA=(await q("insert into public.actions(user_id,txid,source,summary) "+
  "values($1,90000001,'system','delete-A fixture') returning no",[A]))[0].no;
 const actionB=(await q("insert into public.actions(user_id,txid,source,summary) "+
  "values($1,90000002,'system','preserve-B fixture') returning no",[B]))[0].no;
 for(const actionNo of [actionA,actionB])
  await q("insert into public.action_changes(action_no,seq,table_name,row_pk,op) "+
   "values($1,1,'settings','{}'::jsonb,'insert')",[actionNo]);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[A]);
 checkEqual((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,true);
 await assert.rejects(q('select public.lemma_begin_account_delete($1::uuid)',[A]),
  /permission denied|Service role required/);
 await assert.rejects(q("insert into public.account_deletion_requests(user_id) values($1)",[A]),
  /permission denied|row.level security/);
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 await q('select public.lemma_begin_account_delete($1::uuid)',[A]);
 await q('select public.lemma_begin_account_delete($1::uuid)',[A]);
 await db.exec('reset role');
 checkEqual((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,1);
 // The marker must stop new public-table writes as well as Storage writes,
 // including stale other-tab JWTs. A denied insert/update/delete must not
 // create an action journal row or change any owner record.
 const actionCountBefore=(await q('select count(*)::int n from public.actions where user_id=$1',[A]))[0].n;
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[A]);
 checkEqual((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,false);
 checkEqual((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,1);
 await assert.rejects(q("insert into public.subjects(id,user_id,name,glyph,hue) "+
  "values('abababab-abab-4aba-8aba-abababababab',$1,'Rejected A','∑','amber')",[A]),
  /Account deletion is in progress|permission denied/);
 await assert.rejects(q('update public.settings set reviews_per_day=reviews_per_day+1 where user_id=$1',[A]),
  /Account deletion is in progress|permission denied/);
 await assert.rejects(q('delete from public.notes where user_id=$1',[A]),
  /Account deletion is in progress|permission denied/);
 await db.exec('reset role');
 checkEqual((await q('select count(*)::int n from public.actions where user_id=$1',[A]))[0].n,
  actionCountBefore,'rejected owner writes must not create audit rows');
 // The MCP connector writes as service_role through SECURITY DEFINER commands
 // (mcp_commit/mcp_command/mcp_seen), where current_setting('role') stays
 // 'service_role'. The marker must stop that path too, or an in-flight connector
 // write could recreate actions/action_changes after the purge and block Auth
 // deletion. This helper mirrors that execution context.
 await db.exec(`create function public.test_mcp_owner_write(p_user uuid,p_kind text)
  returns void language plpgsql security definer set search_path='' as $mcp$
  begin
   if p_kind='action' then
    insert into public.actions(user_id,txid,source,summary)
     values(p_user,90000009,'chatgpt','mcp write during deletion');
   elsif p_kind='delete' then
    delete from public.notes where user_id=p_user;
   elsif p_kind='seen' then
    update public.settings set connector_last_seen_at=pg_catalog.now()
     where user_id=p_user;
   else
    insert into public.subjects(id,user_id,name,glyph,hue)
     values('acacacac-acac-4aca-8aca-acacacacacac',p_user,'Rejected MCP','∑','amber');
   end if;
  end $mcp$;
  revoke all on function public.test_mcp_owner_write(uuid,text) from public;
  grant execute on function public.test_mcp_owner_write(uuid,text) to service_role`);
 await db.exec('set role service_role');
 for(const kind of ['action','seen','subject','delete'])
  await assert.rejects(q('select public.test_mcp_owner_write($1::uuid,$2)',[A,kind]),
   /Account deletion is in progress/,'MCP-style '+kind+' write for marked A');
 // A service-role write for an owner without a marker is unaffected.
 await q('select public.test_mcp_owner_write($1::uuid,$2)',[B,'seen']);
 await db.exec('reset role');
 // The SQL test creates a plain service_role (without BYPASSRLS). It cannot
 // directly SELECT protected notes under owner RLS; inspect after reset,
 // while still testing the service-role DELETE under the actual role.
 checkEqual((await q('select count(*)::int n from public.notes where user_id=$1',[A]))[0].n,1,
  'denied MCP-style DELETE must preserve the marked owner note');
 checkEqual((await q('select count(*)::int n from public.actions where user_id=$1',[A]))[0].n,
  actionCountBefore,'rejected MCP writes must not create audit rows');
 checkEqual((await q("select count(*)::int n from public.subjects where user_id=$1 and name='Rejected MCP'",[A]))[0].n,
  0,'rejected MCP write must not create an owner row');
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[B]);
 checkEqual((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,true);
 checkEqual((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,0);
 const bWrite=await q('update public.settings set reviews_per_day=reviews_per_day+1 '+
  'where user_id=$1 returning user_id',[B]);
 checkEqual(bWrite.length,1,'unmarked owner B must retain write access');
 await db.exec('reset role');
 // Service-only cleanup removes every owner-keyed public row *before* hard
 // Auth deletion. Auth's FKs otherwise block on non-cascading audit actions.
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[A]);
 await assert.rejects(q('select public.lemma_purge_account_rows($1::uuid)',[A]),
  /permission denied|Service role required/);
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 await assert.rejects(q('select public.lemma_purge_account_rows($1::uuid)',[B]),
  /Account deletion must be secured/);
 const purged=(await q('select public.lemma_purge_account_rows($1::uuid) result',[A]))[0].result;
 checkEqual(purged.status,'purged');
 checkEqual((await q('select cleanup_txid from public.account_deletion_requests where user_id=$1',[A]))[0].cleanup_txid,null,
  'only the trusted purge may open the cleanup window');
 checkEqual((await q('select public.lemma_purge_account_rows($1::uuid) result',[A]))[0].result.status,
  'purged','retry is idempotent before Auth deletion');
 await db.exec('reset role');
 const owners=await q("select c.relname table_name from pg_catalog.pg_class c "+
  "join pg_catalog.pg_namespace n on n.oid=c.relnamespace "+
  "join pg_catalog.pg_attribute a on a.attrelid=c.oid "+
  "where n.nspname='public' and c.relkind in ('r','p') "+
  "and a.attname='user_id' and a.attnum>0 and not a.attisdropped "+
  "and c.relname<>'account_deletion_requests'");
 for(const {table_name} of owners){
  const count=(await q('select count(*)::int n from public."'+table_name.replaceAll('"','""')+'" where user_id=$1',[A]))[0].n;
  checkEqual(count,0,'owner row remained in '+table_name);
 }
 checkEqual((await q('select count(*)::int n from public.account_deletion_requests where user_id=$1',[A]))[0].n,
  1,'deletion guard remains until Auth user is removed');
 checkEqual((await q('select count(*)::int n from public.action_changes where action_no=$1',[actionA]))[0].n,
  0,'owner A audit details must be purged before Auth');
 checkEqual((await q('select count(*)::int n from public.action_changes where action_no=$1',[actionB]))[0].n,
  1,'owner B audit details must be retained');
 checkEqual((await q('select count(*)::int n from public.actions where no=$1 and user_id=$2',[actionB,B]))[0].n,
  1,'owner B audit action must be retained');
 for(const table of ['subjects','projects','notes','cards','reviews']){
  checkEqual((await q('select count(*)::int n from public.'+table+' where user_id=$1',[A]))[0].n,
   0,'owner A still has '+table);
  checkEqual((await q('select count(*)::int n from public.'+table+' where user_id=$1',[B]))[0].n,
   1,'owner B lost '+table);
 }
 await q('delete from auth.users where id=$1',[A]);
 checkEqual((await q('select count(*)::int n from public.settings where user_id=$1',[A]))[0].n,0);
 checkEqual((await q('select count(*)::int n from public.settings where user_id=$1',[B]))[0].n,1);
 checkEqual((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,0);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[A]);
 checkEqual((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,false,
  'stale JWT must not re-enable Storage writes after Auth deletion');
 await db.exec('reset role');
 const source=await readFile(new URL('../../../supabase/functions/account-delete/index.ts',import.meta.url),'utf8');
 assert(source.includes("admin.auth.getUser(token)"));
 assert(source.includes("admin.storage.from(bucket.id)"));
 assert(source.includes("storage.remove(paths.slice(i,i+100))"));
 assert(source.includes("admin.auth.admin.deleteUser(userId,false)"));
 assert(source.includes("admin.rpc('lemma_purge_account_rows',{p_owner:userId})"));
 assert(source.indexOf("admin.rpc('lemma_purge_account_rows'")<
  source.indexOf("admin.auth.admin.deleteUser(userId,false)"));
 assert(!source.includes("delete from storage.objects"));
 console.log('PASS N103 service-only begin, owner RLS isolation, auth cascade, stale-JWT Storage guard and Storage API');
}finally{await db.close()}
