// N42.1: full-migration PGlite for isolated owner deadlines schema.
// D8(b) command lifecycle, projections, undo and generic MCP are N42.2.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const reject=async(sql,args=[])=>assert.rejects(q(sql,args),
  /constraint|violates|permission denied|row.level security/i);
const add=async(user,kind,dueKind,dueDate,dueAt,more='')=>{
  return q('insert into public.deadlines(user_id,title,kind,due_kind,due_date,due_at'+
    (more?',remaining_minutes,estimate_source':'')+
    ') values($1,$2,$3,$4,$5,$6'+(more?',$7,$8':'')+') returning *',
    [user,'Math exam',kind,dueKind,dueDate,dueAt,
      ...(more?[30,'owner']:[])]);
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema extensions;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $auth$
    select coalesce(
     nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid)
   $auth$;
   create function extensions.gen_random_bytes(n int) returns bytea language sql as
     $bytes$select decode(repeat('00',n),'hex')$bytes$;
   grant usage on schema auth to authenticated;
   grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261107070000_deadlines_base.sql'));
 assert.ok(migrations.includes('20261107123040_deadline_feed.sql'),
   'the unapplied N42.2.1 function uses the next forward migration version');
 for(const migration of migrations)await db.exec(await readFile(new URL(migration,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
  [other,'2'.repeat(48)]);
 const originalCount=(await q('select count(*)::int n from public.deadlines'))[0].n;
 assert.equal(originalCount,0,'existing project/checkpoint targets must never be copied');

 const mine=(await add(owner,'exam','date','2026-11-30',null,'estimate'))[0];
 const theirs=(await add(other,'seminar','instant',null,'2026-12-01T15:30:00+05:30'))[0];
 assert.equal(mine.version,1);
 assert.equal(mine.status,'open');
 assert.equal(mine.source,'app');
 assert.equal(mine.estimate_source,'owner');
 assert.equal(mine.remaining_minutes,30);
 assert.equal(mine.due_at,null);
 assert.equal(theirs.due_date,null);
 assert.equal(theirs.user_id,other);
 assert.ok(mine.updated_at&&mine.created_at);
 assert.notEqual(mine.id,theirs.id);

 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date,due_at) values($1,$2,$3,$4,$5,$6)',
  [owner,'Both','exam','date','2026-11-30','2026-11-30T12:00:00Z']);
 await reject('insert into public.deadlines(user_id,title,kind,due_kind) values($1,$2,$3,$4)',
  [owner,'Missing','exam','instant']);
 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
  [owner,' ','exam','date','2026-11-30']);
 for(const kind of ['invalid',null])
  await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
   [owner,'Bad kind',kind,'date','2026-11-30']);
 await reject('update public.deadlines set remaining_minutes=-1,estimate_source=$1 where id=$2',
  ['owner',mine.id]);
 await reject('update public.deadlines set remaining_minutes=20,estimate_source=null where id=$1',
  [mine.id]);
 await reject('update public.deadlines set remaining_minutes=null,estimate_source=$1 where id=$2',
  ['derived',mine.id]);
 await reject('update public.deadlines set estimate_source=$1 where id=$2',['fake',mine.id]);
 await reject('update public.deadlines set status=$1 where id=$2',['unknown',mine.id]);

 const otherSubject='33333333-3333-3333-3333-333333333333';
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Biology','B','lime')",
  [otherSubject,other]);
 await reject('update public.deadlines set subject_id=$1 where id=$2',
  [otherSubject,mine.id]);

 // N42.1 must not expose writes before command receipts and registered undo.
 // Verify both ordinary permissions AND RLS independently: if Supabase grants
 // DML by default, the absent write policies must still prevent owner writes.
 const grants=(await q(`select
  has_table_privilege('authenticated','public.deadlines','SELECT') can_read,
  has_table_privilege('authenticated','public.deadlines','INSERT') can_insert,
  has_table_privilege('authenticated','public.deadlines','UPDATE') can_update,
  has_table_privilege('authenticated','public.deadlines','DELETE') can_delete`))[0];
 assert.deepEqual(grants,{can_read:true,can_insert:false,can_update:false,can_delete:false});
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const visible=await q('select id from public.deadlines order by id');
 assert.deepEqual(visible.map(r=>r.id),[mine.id]);
 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
  [owner,'Blocked direct insert','milestone','date','2026-12-15']);
 await reject("update public.deadlines set status='done' where id=$1",[mine.id]);
 await reject('delete from public.deadlines where id=$1',[mine.id]);
 await db.exec('reset role');
 // Test the defensive policy separately with permissive fixture-only grants.
 // This is not a migration grant and does not loosen the production table.
 await db.exec('grant insert,update,delete on public.deadlines to authenticated');
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 await reject('insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,$2,$3,$4,$5)',
  [owner,'RLS blocked','milestone','date','2026-12-15']);
 assert.deepEqual(await q('update public.deadlines set title=$1 where id=$2 returning id',
  ['RLS blocked own update',mine.id]),[]);
 assert.deepEqual(await q('delete from public.deadlines where id=$1 returning id',[mine.id]),[]);
 assert.deepEqual(await q('update public.deadlines set title=$1 where id=$2 returning id',
  ['Cross-owner',theirs.id]),[]);
 await db.exec('reset role');
 // Admin-only setup still exercises triggers and the domain invariants.
 const modified=(await q("update public.deadlines set status='done' where id=$1 returning *",[mine.id]))[0];
 assert.equal(modified.status,'done');
 assert.ok(new Date(modified.updated_at).getTime()>=new Date(mine.updated_at).getTime());
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='deadlines'"))[0].n,3,
  'two inserts and one status change are audited, failed writes are not');
 const fks=await q("select condeferrable from pg_constraint where conrelid='public.deadlines'::regclass and contype='f'");
 assert.equal(fks.filter(row=>row.condeferrable).length,3);
 const policies=await q("select policyname,cmd from pg_policies where tablename='deadlines'");
 assert.ok(policies.some(r=>r.policyname==='deadlines_owner_select'));
 assert.ok(policies.every(r=>r.cmd==='SELECT'||r.cmd==='select'),
  'no owner DML policy until N42.2');
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/deadlines.json',import.meta.url),'utf8'));
 const cols=await q("select column_name from information_schema.columns where table_schema='public' and table_name='deadlines'");
 assert.deepEqual(Object.keys(doc.columns).sort(),cols.map(c=>c.column_name).sort(),
  'capability registry must classify every persisted deadline field');
 for(const [field,meta] of Object.entries(doc.columns)){
  assert.ok(meta.classification&&meta.appPath&&meta.mcpPath&&meta.exportPolicy&&meta.deletionPolicy,field);
 }

 // N42.2.1: physical and projected deadlines share one owner-scoped feed.
 // Source dates remain civil dates, and refreshing the source changes the
 // projection without materializing any additional deadline row.
 const ownProject='66666666-6666-6666-6666-666666666666';
 const foreignProject='77777777-7777-7777-7777-777777777777';
 const ownCheckpoint='88888888-8888-8888-8888-888888888888';
 const foreignCheckpoint='99999999-9999-9999-9999-999999999999';
 // The action journal requires one owner per statement/transaction.
 await q(`insert into public.projects(id,user_id,slug,title,target_date)
   values($1,$2,'math-plan','Mathematics path','2026-12-15')`,
   [ownProject,owner]);
 await q(`insert into public.projects(id,user_id,slug,title,target_date)
   values($1,$2,'foreign-plan','Foreign path','2026-11-29')`,
   [foreignProject,other]);
 await q(`insert into public.checkpoints
   (id,user_id,project_id,code,position,title,objective,criterion,steps,due_on)
   values($1,$2,$3,'CP1',1,'Algebra checkpoint','Show mastery','Solve','["Practice"]'::jsonb,'2026-12-02')`,
   [ownCheckpoint,owner,ownProject]);
 await q(`insert into public.checkpoints
   (id,user_id,project_id,code,position,title,objective,criterion,steps,due_on)
   values($1,$2,$3,'CP1',1,'Foreign checkpoint','Other work','Explain','["Explain"]'::jsonb,'2026-12-03')`,
   [foreignCheckpoint,other,foreignProject]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const feed=await q('select * from public.deadline_feed()');
 assert.equal(feed.length,3,'one physical deadline and two owner projections');
 const byOrigin=Object.fromEntries(feed.map(row=>[row.origin,row]));
 assert.deepEqual(Object.keys(byOrigin).sort(),['checkpoint','deadline','project']);
 assert.equal(byOrigin.deadline.source_id,mine.id,'physical owner deadline ID');
 assert.equal(byOrigin.deadline.projected,false,'physical deadlines not projected');
 assert.equal(byOrigin.deadline.status,'done','physical status stays authoritative');
 assert.equal(byOrigin.deadline.due_kind,'date','physical civil due kind');
 assert.equal(byOrigin.project.source_id,ownProject,'project projection source ID');
 assert.equal(byOrigin.project.projected,true,'project has projected marker');
 assert.equal(byOrigin.project.project_id,ownProject,'project join ID');
 assert.equal(new Date(String(byOrigin.project.due_date)).toISOString().slice(0,10),
   '2026-12-15','project due date retains its civil day across PGlite date decoding');
 assert.equal(byOrigin.checkpoint.source_id,ownCheckpoint,'checkpoint projection source ID');
 assert.equal(byOrigin.checkpoint.checkpoint_id,ownCheckpoint,'checkpoint projection join ID');
 assert.equal(byOrigin.checkpoint.project_id,ownProject,'checkpoint parent project ID');
 assert.equal(byOrigin.checkpoint.projected,true,'checkpoint is projected');
 assert.equal(new Date(String(byOrigin.checkpoint.due_date)).toISOString().slice(0,10),
   '2026-12-02','checkpoint due date retains its civil day across PGlite date decoding');
 assert.equal((await q('select origin from public.deadline_feed(1,1)'))[0].origin,
   'checkpoint','bounded pages have stable due-date ordering');
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from public.deadlines'))[0].n,2,
   'projections never create physical deadlines');
 await q('update public.projects set target_date=null where id=$1',[ownProject]);
 await q('update public.checkpoints set due_on=null where id=$1',[ownCheckpoint]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 assert.deepEqual((await q('select origin from public.deadline_feed()')).map(x=>x.origin),
   ['deadline'],'clearing source dates removes projections without writes');
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[other]);
 await db.exec('set role authenticated');
 const foreignFeed=await q('select origin,source_id from public.deadline_feed()');
 assert.deepEqual(foreignFeed.map(x=>x.source_id).sort(),
   [theirs.id,foreignProject,foreignCheckpoint].sort(),
   'a second owner sees only her own physical and projected rows');
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 assert.deepEqual(await q('select origin from public.deadline_feed()'),[],
   'an unsigned session cannot read the projections');
 assert.equal((await q('select count(*)::int n from public.deadlines'))[0].n,2);

 // N42.2.2 full lifecycle, receipts, owner isolation, registry, undo and MCP.
 assert.ok(migrations.includes('20261107222010_deadlines_command.sql'));
 const asOwner=async who=>{
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims','{}',false)");
  await q("select set_config('test.uid',$1,false)",[who]);
  await db.exec('set role authenticated');
 };
 const admin=async()=>{
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims','{}',false)");
  await q("select set_config('test.uid','',false)");
 };
 let sequence=0;
 const envelope=(operation,fields={})=>({
  operationId:'cccccccc-cccc-4ccc-8ccc-'+String(++sequence).padStart(12,'0'),
  schemaVersion:1,resource:'deadlines',operation,...fields
 });
 const cmd=async p=>(await q('select public.deadlines_command($1::jsonb) result',
  [JSON.stringify(p)]))[0].result;
 const make=(title,patch={})=>envelope('create',{
  patch:{title,kind:'exam',due_kind:'date',due_date:'2026-12-25',...patch}});
 const versioned=(operation,id,ver,patch={})=>cmd(envelope(operation,{
  target:{id},expectedVersion:ver,patch}));
 const get=async id=>(await q('select * from public.deadlines where id=$1',[id]))[0];
 const action=receipt=>{
  assert.equal(receipt.status,'ok');
  assert.ok(Number.isSafeInteger(receipt.actionNo)&&receipt.actionNo>0,
   'every mutation carries a reversible action number');
  assert.equal(receipt.changed.length,1);
 };
 const registry=(await q(
  'select command_fn,mcp_ok,"schema" from public.lemma_command_resources where resource=$1',
  ['deadlines']))[0];
 assert.equal(registry.command_fn,'deadlines_command');
 assert.equal(registry.mcp_ok,true);
 assert.deepEqual(registry.schema.operations,
  ['create','update','complete','reopen','cancel','restore','delete']);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='deadlines'"))[0].n,1);
 await asOwner(owner);
 const original=make('Mathematics examination');
 const created=await cmd(original);action(created);
 assert.equal((await q("select count(*)::int n from public.action_changes where action_no=$1 and table_name='deadlines'",
  [created.actionNo]))[0].n,1,
  'canonical journal-guard trigger preserves exactly one audit change');

 const id=created.changed[0].id;
 assert.equal(created.changed[0].version,1);
 assert.equal((await get(id)).user_id,owner);
 assert.equal((await get(id)).source,'app');
 assert.deepEqual(await cmd(original),created,'exact retry returns original receipt');
 const replayConflict=await cmd({...original,patch:{...original.patch,title:'Changed retry'}});
 assert.equal(replayConflict.status,'conflict');
 assert.match(replayConflict.conflict.reason,/different payload/i);
 assert.equal((await get(id)).title,'Mathematics examination');
 const stale=await versioned('update',id,17,{title:'Wrong version'});
 assert.equal(stale.status,'conflict');
 assert.equal(stale.conflict.expectedVersion,17);
 assert.equal(stale.conflict.currentVersion,1);
 const edited=await versioned('update',id,1,{title:'Updated exam'});
 action(edited);
 assert.equal(edited.changed[0].version,2);
 assert.equal((await get(id)).title,'Updated exam');
 const complete=await versioned('complete',id,2);action(complete);
 assert.equal((await get(id)).status,'done');
 await assert.rejects(versioned('complete',id,3),/Only open deadlines/);
 const reopened=await versioned('reopen',id,3);action(reopened);
 assert.equal((await get(id)).status,'open');
 const cancelled=await versioned('cancel',id,4);action(cancelled);
 assert.equal((await get(id)).status,'cancelled');
 await assert.rejects(versioned('complete',id,5),/Only open deadlines/);
 await assert.rejects(versioned('update',id,5,{title:'Not open'}),/Only open deadlines/);
 const restored=await versioned('restore',id,5);action(restored);
 assert.equal((await get(id)).version,6);
 assert.equal((await get(id)).status,'open');
 await assert.rejects(versioned('restore',id,6),/Only cancelled deadlines/);
 for(const patch of [{user_id:other},{version:99},{source:'worker'},
   {status:'done'},{kind:'unknown'},{due_at:'2026-12-25T12:00:00'}]){
  await assert.rejects(versioned('update',id,6,patch),
   /Unknown deadline patch|Invalid deadline|violates|check constraint/i);
 }
 await assert.rejects(cmd(make('Explicit invalid calendar day',{due_date:'2026-02-30'})),
  /Invalid civil deadline date/);
 for(const bad of [make(' '),make('Date',{due_date:'2026-02-30'}),
  make('Naive',{due_kind:'instant',due_date:null,due_at:'2026-12-25T12:00:00'}),
  make('Infinity',{due_kind:'instant',due_date:null,due_at:'infinity'}),
  make('Half minute',{remaining_minutes:1.5,estimate_source:'owner'}),
  make('Unpaired estimate',{remaining_minutes:30}),
  make('Foreign subject',{subject_id:otherSubject}),
  make('Forged user',{user_id:other})]){
  await assert.rejects(cmd(bad),/Invalid|Unknown|check|constraint|violates|estimate|instant/i);
 }
 await assert.rejects(cmd(envelope('create',{expectedVersion:1,patch:{
  title:'Wrong',kind:'exam',due_kind:'date',due_date:'2026-12-25'}})),
  /expectedVersion/i);
 await assert.rejects(versioned('reopen',id,6),/Only completed deadlines/);
 await assert.rejects(versioned('delete',id,6,{title:'Not allowed'}),
  /Unknown deadline patch/);
 const deleted=await versioned('delete',id,6);action(deleted);
 assert.equal(await get(id),undefined);
 const undoneDelete=(await q('select public.undo_action($1::uuid,$2::bigint,false) r',
  [owner,deleted.actionNo]))[0].r;
 assert.equal(undoneDelete.undone,deleted.actionNo);
 assert.equal((await get(id)).title,'Updated exam');
 const temp=await cmd(make('Undo create'));action(temp);
 await q('select public.undo_action($1::uuid,$2::bigint,false)',
  [owner,temp.actionNo]);
 assert.equal(await get(temp.changed[0].id),undefined,'undo removes a created row');
 const editable=await cmd(make('Undo edit'));
 const edit=await versioned('update',editable.changed[0].id,1,{title:'After change'});
 action(edit);
 await q('select public.undo_action($1::uuid,$2::bigint,false)',
  [owner,edit.actionNo]);
 assert.equal((await get(editable.changed[0].id)).title,'Undo edit');
 assert.equal((await get(editable.changed[0].id)).version,1);
 const first=await cmd(make('Undo should conflict'));
 const firstEdit=await versioned('update',first.changed[0].id,1,{title:'Step one'});
 await versioned('update',first.changed[0].id,2,{title:'Step two'});
 await assert.rejects(q('select public.undo_action($1::uuid,$2::bigint,false)',
  [owner,firstEdit.actionNo]),/Undo/i);
 await asOwner(other);
 assert.equal((await q('select count(*)::int n from public.deadlines where id=$1',[id]))[0].n,0);
 await assert.rejects(versioned('update',id,7,{title:'Steal'}),
  /Deadline not found for owner/);
 const foreign=await cmd(make('Other owner'));action(foreign);
 await asOwner(owner);
 assert.equal((await q('select count(*)::int n from public.deadlines where id=$1',
  [foreign.changed[0].id]))[0].n,0);
 await assert.rejects(q('select public.undo_action($1::uuid,$2::bigint,false)',
  [owner,foreign.actionNo]),/not yours|Not authorized/i);
 await assert.rejects(q(
  "insert into public.deadlines(user_id,title,kind,due_kind,due_date) values($1,'Bypass','exam','date','2026-12-25')",
  [owner]),/permission denied|row.level security/i);
 await assert.rejects(q('select public.mcp_command($1::uuid,$2::text,$3::jsonb)',
  [owner,'chatgpt',JSON.stringify(make('Forbidden proxy'))]),
  /permission denied|Service role required/i);
 await admin();
 await db.exec('set role service_role');
 await assert.rejects(cmd(make('No unscoped service owner')),
  /Authentication required|permission denied/i);
 const mcpPayload=make('MCP deadline');
 const mcp=async p=>(await q(
  'select public.mcp_command($1::uuid,$2::text,$3::jsonb) result',
  [owner,'chatgpt',JSON.stringify(p)]))[0].result;
 const viaMcp=await mcp(mcpPayload);action(viaMcp);
 assert.deepEqual(await mcp(mcpPayload),viaMcp,'MCP replay uses same receipt');
 assert.equal((await mcp({...mcpPayload,patch:{
  ...mcpPayload.patch,title:'Changed MCP payload'}})).status,'conflict');
 await admin();
 assert.equal((await get(viaMcp.changed[0].id)).source,'mcp');
 const journal=(await q('select source,tool,user_id from public.actions where no=$1',
  [viaMcp.actionNo]))[0];
 assert.equal(journal.user_id,owner);
 assert.equal(journal.source,'chatgpt');
 assert.equal(journal.tool,'study');
 assert.equal((await q('select connector_last_client from public.settings where user_id=$1',
  [owner]))[0].connector_last_client,'chatgpt');
 assert.ok((await q("select count(*)::int n from public.action_changes where table_name='deadlines'"))[0].n>3,
  'all successful mutations are journalled');

 console.log('PASS N42.1 owner deadlines schema, date/instant exclusivity, estimates, FKs, RLS, audit and inventory');
}finally{await db.close()}
