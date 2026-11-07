// N37: a resource registered ONLY in this test is immediately discoverable
// and writable through the production owner-bound generic MCP dispatcher.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const q=async(text,values=[])=>(await db.query(text,values)).rows;
const role=async(name)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 if(name)await db.exec('set role '+name);
};
const call=async(id,command)=>(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) value',
 [id,'chatgpt',JSON.stringify(command)]))[0].value;
try{
 await db.exec(\`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $auth$ select coalesce(
  nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
  nullif(current_setting('test.uid',true),'')::uuid) $auth$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql
 as $bytes$ select decode(repeat('00',n),'hex') $bytes$;
 grant usage on schema auth to authenticated;
 grant execute on function auth.uid() to authenticated;\`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 for(const file of migrations)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [id,s] of [[owner,'a'.repeat(48)],[other,'b'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[id,s]);
 await db.exec(\`create table public.future_mcp_fixture(
  id uuid primary key,user_id uuid not null references auth.users(id),
  title text not null,version int not null default 1);
 create trigger lemma_log_change after insert or update or delete on public.future_mcp_fixture
 for each row execute function public.log_change();
 insert into public.lemma_undo_tables(table_name) values('future_mcp_fixture');
 create function public.future_mcp_fixture_command(p jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $fixture$
 declare v_owner uuid;v_id uuid;v_action bigint;v_result jsonb;
 begin
  v_owner:=auth.uid();
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p->>'resource'<>'future_mcp_fixture' or p->>'operation'<>'create'
   then raise exception 'Unknown fixture command'; end if;
  v_id:=(p->'target'->>'id')::uuid;
  insert into public.future_mcp_fixture(id,user_id,title)
    values(v_id,v_owner,p->'patch'->>'title');
  select no into v_action from public.actions
    where txid=txid_current() and user_id=v_owner order by no desc limit 1;
  if v_action is null then raise exception 'Fixture write was not journalled'; end if;
  v_result:=pg_catalog.jsonb_build_object('status','ok',
    'operationId',p->>'operationId','actionNo',v_action,
    'changed',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id',v_id,'version',1)));
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,(p->>'operationId')::uuid,'future_mcp_fixture',v_result);
  return v_result;
 end $fixture$;
 insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('future_mcp_fixture','future_mcp_fixture_command',true,
 '{"operations":["create"],"fields":["title"]}'::jsonb);\`);
 const registered=(await q("select resource,\"schema\" from public.lemma_command_resources where resource='future_mcp_fixture'"))[0];
 assert.equal(registered.resource,'future_mcp_fixture');
 assert.deepEqual(registered.schema.operations,['create']);
 assert.deepEqual(registered.schema.fields,['title']);
 await role('authenticated');
 await assert.rejects(call(owner,{schemaVersion:1,resource:'future_mcp_fixture',operation:'create',
  operationId:'aaaaaaaa-aaaa-4aaa-8aaa-111111111111',target:{id:key},
  patch:{title:'Unauthorized'}}),/permission denied|Service role required/i);
 await role('service_role');
 const envelope={schemaVersion:1,resource:'future_mcp_fixture',operation:'create',
  operationId:'aaaaaaaa-aaaa-4aaa-8aaa-111111111111',target:{id:key},
  patch:{title:'New registered owner resource'}};
 const receipt=await call(owner,envelope);
 assert.equal(receipt.status,'ok');assert.ok(receipt.actionNo>0);
 assert.equal(receipt.changed[0].id,key);
 await role(null);
 const row=(await q('select user_id,title from public.future_mcp_fixture where id=$1',[key]))[0];
 assert.equal(row.user_id,owner);
 assert.equal(row.title,'New registered owner resource');
 const action=(await q('select user_id,source,tool from public.actions where no=$1',[receipt.actionNo]))[0];
 assert.equal(action.user_id,owner);assert.equal(action.source,'chatgpt');assert.equal(action.tool,'study');
 await role('service_role');
 await assert.rejects(call(owner,{...envelope,resource:'not_registered'}),
  /Unknown command resource/);
 await assert.rejects(call('33333333-3333-4333-8333-333333333333',
  {...envelope,operationId:'aaaaaaaa-aaaa-4aaa-8aaa-222222222222',
   target:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}}),/Owner not found/);
 await role(null);
 assert.equal((await q("select count(*)::int n from public.future_mcp_fixture where user_id=$1",[other]))[0].n,0);
 console.log('PASS N37 test-only registered resource discovered, owner-bound MCP command and journal');
}finally{await db.close()}
