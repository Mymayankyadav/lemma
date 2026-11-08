// N89: exercise the full migration chain in isolated PGlite, never production.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const secret='credential-secret-never-journal';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const role=async name=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 if(name)await db.exec('set role '+name);
};
const as=async id=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
const command=(resource,operation,rest={})=>({
 schemaVersion:1,operationId:randomUUID(),resource,operation,...rest
});
const mcp=async (p,uid=owner)=>(await q(
 'select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
 [uid,'chatgpt',JSON.stringify(p)]))[0].result;
const app=async p=>(await q(
 'select public.notify_command($1::jsonb) result',[JSON.stringify(p)]))[0].result;
const undo=async (uid,no)=>(await q(
 'select public.undo_action($1::uuid,$2::bigint,false) result',[uid,no]))[0].result;
const ok=result=>{assert.equal(result.status,'ok',JSON.stringify(result));return result};
const device=async id=>(await q('select * from public.push_devices where id=$1',[id]))[0];
const hold=async scope=>(await q('select * from public.notify_holds where user_id=$1 and scope=$2',
 [owner,scope]))[0];
try{
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $auth$
  select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid) $auth$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql
  as $bytes$select decode(repeat('00',n),'hex')$bytes$;
 grant usage on schema auth to authenticated;
 grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert(files.some(f=>f.includes('n89_notify_command')),'N89 migration missing');
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [owner,'a'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [other,'b'.repeat(48)]);
 const tables=await q("select table_name from public.lemma_undo_tables where table_name in ('notify_holds','push_devices')");
 assert.deepEqual(tables.map(t=>t.table_name),['notify_holds'],
  'device credentials may never enter undo journal');
 const registry=await q("select resource,command_fn,\"schema\" from public.lemma_command_resources where resource in ('push_devices','notify_holds') order by resource");
 assert.equal(registry.length,2);
 assert.deepEqual(registry.map(r=>r.command_fn),['notify_command','notify_command']);
 assert.deepEqual(registry[0].schema.operations,['create','update','delete']);
 assert.deepEqual(registry[1].schema.operations,['rename','disable','restore']);

 // Only an actual browser may register a subscription. The fake subscription
 // is inserted as the owner fixture; the MCP command cannot create or delete it.
 const deviceId=(await q("insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,$2,$3,$4,'Web phone','android_web') returning id",
  [owner,'https://push.example.test/'+secret,'p256dh_'+secret,'auth_'+secret]))[0].id;
 const foreignId=(await q("insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,$2,$3,$4,'Private phone','desktop') returning id",
  [other,'https://push.example.test/other','otherkey','otherauth']))[0].id;
 await role('service_role');
 for(const operation of ['create','delete'])
  await assert.rejects(mcp(command('push_devices',operation,{
   target:{id:deviceId},patch:{label:'Not allowed'},expectedVersion:1
  })),/Unsupported notification resource or operation/);
 const rename=command('push_devices','rename',{target:{id:deviceId},expectedVersion:1,patch:{label:'Renamed device'}});
 const renamed=ok(await mcp(rename));
 assert.equal(renamed.actionNo,null,'credential-bearing device must not be undoable');
 assert.equal(renamed.current.label,'Renamed device');
 assert.equal(renamed.changed[0].version,2);
 assert.deepEqual(await mcp(rename),renamed,'exact device replay differs');
 assert.equal((await mcp({...rename,patch:{label:'Another label'}})).status,'conflict');
 assert.equal((await mcp(command('push_devices','rename',{
  target:{id:deviceId},expectedVersion:1,patch:{label:'Stale'}
 }))).status,'conflict');
 for(const label of ['', 'x'.repeat(41)])
  await assert.rejects(mcp(command('push_devices','rename',{
   target:{id:deviceId},expectedVersion:2,patch:{label}
  })),/Device label/);
 await assert.rejects(mcp(command('push_devices','rename',{
  target:{id:foreignId},expectedVersion:1,patch:{label:'Bad owner'}
 })),/not found for owner/i);
 const disabled=ok(await mcp(command('push_devices','disable',{
  target:{id:deviceId},expectedVersion:2,patch:{}
 })));
 assert.equal(disabled.current.disabled_reason,'removed');
 const restored=ok(await mcp(command('push_devices','restore',{
  target:{id:deviceId},expectedVersion:3,patch:{}
 })));
 assert.equal(restored.current.disabled_reason,null);
 await role(null);
 const persisted=await device(deviceId);
 assert.equal(persisted.version,4);
 assert.equal(persisted.disabled_at,null);
 assert.equal(persisted.endpoint,'https://push.example.test/'+secret);
 const changes=await q("select count(*)::int n from public.action_changes where table_name='push_devices'");
 assert.equal(changes[0].n,0,'device old/new credentials leaked to action_changes');
 const savedReceipts=await q("select result::text value from public.command_receipts where resource='push_devices'");
 for(const row of savedReceipts)
  assert(!row.value.includes(secret),'device command receipt leaked transport credentials');
 assert(!JSON.stringify([renamed,disabled,restored]).includes(secret),
  'MCP device response included transport credentials');

 // A new hold is versioned and its whole lifecycle is journalled/undoable.
 await role('service_role');
 const create=command('notify_holds','create',{
  patch:{scope:'tutor',until:'2028-01-01T00:00:00Z'}});
 const created=ok(await mcp(create));
 assert.ok(created.actionNo>0);
 assert.equal(created.changed[0].id,'tutor');
 assert.equal(created.changed[0].version,1);
 assert.deepEqual(await mcp(create),created,'hold exact retry');
 assert.equal((await mcp({...create,patch:{
  scope:'tutor',until:'2028-01-02T00:00:00Z'}})).status,'conflict',
  'hold changed-payload retry accepted');
 await role(null);
 assert.equal((await hold('tutor')).version,1);
 await as(owner);
 const update=command('notify_holds','update',{
  target:{id:'tutor'},expectedVersion:1,patch:{until:'2028-02-01T00:00:00Z'}});
 const edited=ok(await app(update));
 assert.ok(edited.actionNo>created.actionNo);
 assert.equal(edited.changed[0].version,2);
 assert.equal((await hold('tutor')).version,2);
 await role('service_role');
 const stale=await mcp(command('notify_holds','update',{
  target:{id:'tutor'},expectedVersion:1,patch:{until:'2028-03-01T00:00:00Z'}}));
 assert.equal(stale.status,'conflict');
 await assert.rejects(mcp(command('notify_holds','update',{
  target:{id:'tutor'},expectedVersion:2,patch:{auth:'not allowed'}
 })),/Unknown notification patch field/);
 await assert.rejects(mcp(command('notify_holds','update',{
  target:{id:'foreign'},expectedVersion:1,patch:{until:'2028-04-01T00:00:00Z'}
 })),/not found for owner/i);
 await as(other);
 assert.equal((await q("select count(*)::int n from public.notify_holds where scope='tutor'"))[0].n,0);
 await role('service_role');
 // Undo an edit before the later delete. An inverse itself is a live journal
 // action, so undoing several historical actions backwards is not allowed.
 await as(owner);
 assert.equal((await undo(owner,edited.actionNo)).undone,edited.actionNo);
 assert.equal((await hold('tutor')).version,1);
 await role('service_role');
 await assert.rejects(mcp(command('notify_holds','delete',{
  target:{id:'tutor'},expectedVersion:1,patch:{}
 }),other),/not found for owner/i);
 const deletion=command('notify_holds','delete',{
  target:{id:'tutor'},expectedVersion:1,patch:{}
 });
 const deleted=ok(await mcp(deletion));
 assert.ok(deleted.actionNo>0);
 assert.deepEqual(await mcp(deletion),deleted);
 await role(null);
 assert.equal(await hold('tutor'),undefined);
 await as(owner);
 assert.equal((await undo(owner,deleted.actionNo)).undone,deleted.actionNo);
 assert.equal((await hold('tutor')).version,1);
 // Prove create undo on a different scope; the prior delete inverse must not
 // block its independent journal action.
 await role('service_role');
 const createOnly=ok(await mcp(command('notify_holds','create',{
  patch:{scope:'n89-create-undo',until:'2028-01-01T00:00:00Z'}
 })));
 await as(owner);
 assert.equal((await undo(owner,createOnly.actionNo)).undone,createOnly.actionNo);
 assert.equal((await hold('n89-create-undo')),undefined,'standalone hold create not undoable');

 // The existing notify_act still creates quiet holds and changes advance
 // versions when it overwrites the same scope; it is not replaced by MCP.
 await role(null);
 await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at) values($1,'tutor','n89-test','Study','Body','#/review',now())",[owner]);
 const notification=(await q("select id from public.notifications where user_id=$1 and key='n89-test'",[owner]))[0].id;
 await q('select public.notify_act($1::uuid,$2::bigint,$3::text,$4::jsonb)',
  [owner,notification,'later',JSON.stringify({scope:'tutor-notify'})]);
 assert.equal((await hold('tutor-notify')).version,1);
 await q('update public.notify_holds set "until"=now()+interval \'4 hours\' where user_id=$1 and scope=$2',
  [owner,'tutor-notify']);
 assert.equal((await hold('tutor-notify')).version,2,'out-of-band hold update did not advance version');
 const rows=await q("select table_name,old::text as old,new::text as new from public.action_changes where table_name='notify_holds'");
 assert(rows.length>=6,'hold lifecycle did not produce journal entries');
 assert(!JSON.stringify(rows).includes(secret),'push credential appeared in hold journal');
 await role('service_role');
 await assert.rejects(mcp(command('notifications','create',{patch:{title:'Forged'}})),
  /Unknown command resource/);
 console.log('PASS N89 device secrecy and receipt CAS, owner ACL, hold lifecycle/replay/undo, notify_act compatibility');
}finally{
 await db.close();
}
