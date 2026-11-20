// Rehearse an installed database upgrade using the same SQL as a fresh install.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const cutoverFile = '20261218001300_owner_command_receipt_cutover.sql';
const migrationDir = new URL('../../../supabase/migrations/', import.meta.url);
const writers = ['edit_note_atomic', 'lemma_study_timer_command', 'notify_command', 'presets_command',
  'study_command_correction', 'study_command_lifecycle', 'task_command'];
const runtimeRoles = ['anon', 'authenticated', 'service_role'];
const legacyRole = 'lemma_legacy_receipt_writer';

async function rehearse(db) {
  const rows = async (sql, parameters = []) => (await db.query(sql, parameters)).rows;
  const one = async (sql, parameters = []) => (await rows(sql, parameters))[0];
  const result = async (sql, parameters) => (await one(sql, parameters)).result;
  const as = async (role, owner = '') => {
    await db.exec('reset role');
    await rows("select set_config('test.uid',$1,false), set_config('request.jwt.claims','{}',false)", [owner]);
    if (role) await db.exec('set role ' + role);
  };
  const signatures = () => rows(`select proname, pg_get_function_identity_arguments(oid) args,
    pg_get_function_result(oid) ret from pg_proc where pronamespace = 'public'::regnamespace
    and proname = any($1::text[]) order by proname`, [writers]);
  const marker = () => one(`select count(*)::int count from pg_attribute
    where attrelid = 'public.command_receipts'::regclass and attname = 'trusted_writer_version' and not attisdropped`);
  const command = (resource, operation, patch) => ({operationId: randomUUID(), schemaVersion: 1, resource, operation, patch});
  const call = (fn, envelope) => result('select public.' + fn + '($1::jsonb) result', [JSON.stringify(envelope)]);
  const helper = (fn, envelope, owner, operationId = envelope.operationId) => result(
    'select public.' + fn + '($1::jsonb,$2::uuid,$3::uuid) result', [JSON.stringify(envelope), owner, operationId]);
  const owner = randomUUID(), other = randomUUID();
  const files = (await readdir(migrationDir)).filter(f => f.endsWith('.sql')).sort();
  const cutover = files.indexOf(cutoverFile);
  assert.ok(cutover > 0);
  const migrate = async file => {
    try { await db.exec(await readFile(new URL(file, migrationDir), 'utf8')); }
    catch (error) { throw new Error(file + ': ' + error.message, {cause: error}); }
  };

  for (const name of runtimeRoles) {
    if (!(await one('select 1 from pg_roles where rolname=$1', [name]))) await db.exec('create role ' + name);
  }
  await db.exec(`create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $uid$
      select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
        nullif(current_setting('test.uid',true),'')::uuid) $uid$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('01',n),'hex')$$;
    grant usage on schema auth to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
  for (const file of files.slice(0, cutover)) await migrate(file);
  const beforeSignatures = await signatures();
  assert.equal(beforeSignatures.length, writers.length);
  const beforeMarker = await marker();
  assert.equal(beforeMarker.count,0,'only the protected cutover introduces the provenance column');
  await rows('insert into auth.users(id) values ($1),($2)', [owner, other]);
  for (const [id, secret] of [[owner,'1'.repeat(48)], [other,'2'.repeat(48)]]) {
    await rows('insert into public.settings(user_id,connector_secret) values ($1,$2)', [id, secret]);
  }
  const subject = (await one("insert into public.subjects(user_id,name,glyph,hue) values ($1,'Math','M','amber') returning id", [owner])).id;
  const project = (await one("insert into public.projects(user_id,subject_id,slug,title,goal) values ($1,$2,'proof','Proof','Learn') returning id", [owner,subject])).id;
  const note = (await one("insert into public.notes(user_id,project_id,front,back) values ($1,$2,'Q','A') returning id", [owner,project])).id;
  const oldTask = command('tasks','create',{title:'Before upgrade'});
  await as('authenticated', owner);
  const original = await call('task_command', oldTask);
  assert.equal(original.status, 'ok');
  const legacy = command('calendar_blocks','create',{});
  const legacyResult = {operationId: legacy.operationId, status:'ok', actionNo:null, changed:[]};
  await rows("insert into public.command_receipts(operation_id,resource,result) values ($1,'calendar_blocks',$2)", [legacy.operationId,JSON.stringify(legacyResult)]);
  const registered = () => one("select exists(select 1 from public.lemma_undo_tables where table_name='command_receipts') registered");
  await as(null);
  const beforeRegistration = await registered();
  // A correctly typed, previously writable marker cannot establish provenance.
  await db.exec('begin');
  await db.exec('alter table public.command_receipts add column trusted_writer_version smallint');
  await rows('update public.command_receipts set trusted_writer_version=1 where operation_id=$1',[legacy.operationId]);
  await assert.rejects(migrate(cutoverFile), error => error.cause?.code === '42701');
  await db.exec('rollback');
  assert.deepEqual(await marker(),beforeMarker);
  // Hosted defaults and historical per-column grants must both be handled.
  await db.exec('grant insert(operation_id),update(result) on public.command_receipts to anon, public; grant truncate on public.command_receipts to authenticated');
  await db.exec('begin');
  await migrate(cutoverFile);
  assert.equal((await marker()).count, 1);
  await db.exec('rollback');
  assert.deepEqual(await marker(), beforeMarker);
  assert.equal((await one("select to_regnamespace('lemma_receipt_dispatch') is null rolled_back")).rolled_back, true);
  assert.equal((await one("select has_column_privilege('anon','public.command_receipts','result','UPDATE') granted")).granted, true);
  await as('authenticated', owner);
  assert.deepEqual(await call('task_command', oldTask), original);
  assert.deepEqual(await call('study_command', legacy), legacyResult);

  await as(null);
  for (const membership of ['with inherit true, set false','with inherit false, set true']) {
    await db.exec('begin');
    const grantee='fixture_receipt_grantee_' + randomUUID().replaceAll('-','');
    await db.exec('create role ' + grantee);
    await db.exec('grant insert(result) on public.command_receipts to ' + grantee);
    await db.exec('grant ' + grantee + ' to authenticated ' + membership);
    await assert.rejects(migrate(cutoverFile), /Client write or dispatch/);
    await db.exec('rollback');
  }
  for (const file of files.slice(cutover)) await migrate(file);
  assert.deepEqual(await signatures(), beforeSignatures);
  assert.deepEqual(await registered(), beforeRegistration, 'export registry membership is preserved');
  const markerShape = await one(`select atttypid::regtype::text type, attnotnull, atthasdef
    from pg_attribute where attrelid='public.command_receipts'::regclass and attname='trusted_writer_version'`);
  assert.deepEqual(markerShape, {type:'smallint', attnotnull:false, atthasdef:false});
  for (const role of ['anon','authenticated']) {
    const acl = await one(`select
      has_any_column_privilege($1::name,'public.command_receipts','INSERT,UPDATE') column_write,
      has_table_privilege($1::name,'public.command_receipts','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') table_write,
      has_schema_privilege($1::name,'lemma_receipt_dispatch','USAGE') private_access,
      pg_has_role($1::name,$2::name,'MEMBER') writer`, [role,legacyRole]);
    assert.deepEqual(acl, {column_write:false, table_write:false, private_access:false, writer:false});
  }
  assert.deepEqual(await rows(`select privilege_type from (
      select (aclexplode(relacl)).* from pg_class where oid='public.command_receipts'::regclass
      union all select (aclexplode(attacl)).* from pg_attribute where attrelid='public.command_receipts'::regclass
    ) acl where grantee=0 and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER')`), []);
  assert.deepEqual(await one(`select rolcanlogin, rolbypassrls, rolsuper,
      has_column_privilege(rolname,'public.command_receipts','trusted_writer_version','INSERT,UPDATE') can_mark
    from pg_roles where rolname=$1`, [legacyRole]), {rolcanlogin:false,rolbypassrls:false,rolsuper:false,can_mark:false});
  await as('authenticated', owner);
  assert.deepEqual(await call('task_command', oldTask), original);
  assert.deepEqual(await call('study_command', legacy), legacyResult);
  const replay = async (fn, args) => {
    const first = await fn(...args);
    assert.equal(first.status,'ok');
    assert.deepEqual(await fn(...args), first, 'replay returns the original DTO');
    return first;
  };
  const taskRequest = command('tasks','create',{title:'After upgrade'});
  await rows("select set_config('lemma.source','other',false), set_config('lemma.tool','client value',false), set_config('lemma.summary','client value',false)");
  const task = await replay(call,['task_command',taskRequest]);
  const journal = action => one('select source,tool,summary from public.actions where no=$1',[action]);
  assert.deepEqual(await journal(task.actionNo),{source:'app',tool:'task_command',summary:'Task create'});
  const preset = await replay(call,['presets_command', command('presets','create',{label:'Reading'})]);
  await replay(call,['notify_command', command('notify_holds','create',{scope:'study',until:'2028-01-01T00:00:00Z'})]);
  const edit = (id, opId) => result('select public.edit_note_atomic($1,1,$2::jsonb,$3) result',[id,'{"front":"Updated"}',opId]);
  await replay(edit,[note,randomUUID()]);
  const lifecycle = command('study_entries','create',{source:'timer',intent:'Practice'});
  const draft = await replay(helper,['study_command_lifecycle',lifecycle,owner]);
  assert.equal(draft.actionNo, null, 'legacy direct helper response');
  const timerId = draft.changed[0].id;
  const start = {...command('study_entries','start',{}), target:{id:timerId}, expectedVersion:1};
  const started = await helper('study_command_lifecycle',start,owner);
  const lease = {...command('study_entries','take_lease',{device:'phone'}), target:{id:timerId}, expectedVersion:started.changed[0].version};
  const taken = await replay(helper,['lemma_study_timer_command',lease,owner]);
  const pause = {...command('study_entries','pause',{}), target:{id:timerId}, expectedVersion:taken.changed[0].version};
  assert.equal((await helper('study_command_lifecycle',pause,owner)).status,'conflict','direct helper obeys active lease');
  const correction = command('study_entries','create_manual',{intent:'Proof',intervals:[
    {kind:'focus',started_at:'2026-01-05T09:00:00Z',ended_at:'2026-01-05T09:05:00Z'}]});
  await replay(helper,['study_command_correction',correction,owner]);
  assert.equal((await one('select count(*)::int n from public.command_receipts where trusted_writer_version is not null')).n,0);
  const snapshot = await result('select public.begin_owner_export() result',[]);
  const page = await result("select public.owner_export_page($1,'tasks') result",[snapshot]);
  assert.ok(page.rows.some(r=>r.id===task.changed[0].id));
  assert.ok(page.rows.every(r=>r.user_id===owner));

  await as('authenticated',other);
  assert.deepEqual(await rows('select operation_id from public.command_receipts'),[]);
  await assert.rejects(edit(note,randomUUID()), /Note not found/);
  await assert.rejects(call('task_command',{...command('tasks','update',{title:'Other'}),target:{id:task.changed[0].id},expectedVersion:1}), /Task not found/);
  await assert.rejects(call('presets_command',{...command('presets','update',{label:'Other'}),target:{id:preset.changed[0].id},expectedVersion:1}), /Preset not found/);
  for(const [fn,envelope] of [['study_command_lifecycle',lifecycle],['lemma_study_timer_command',lease],['study_command_correction',correction]]) {
    await assert.rejects(helper(fn,envelope,owner), /Invalid/);
    await assert.rejects(helper(fn,envelope,other,randomUUID()), /Invalid/);
  }
  await as('service_role');
  const bridge = command('tasks','create',{title:'Service caller'});
  const through = await result("select public.mcp_task_command($1,'chatgpt',$2::jsonb) result",[other,JSON.stringify(bridge)]);
  assert.equal(through.status,'ok');
  await as(null);
  assert.deepEqual(await journal(through.actionNo),{source:'chatgpt',tool:'study',summary:'Task create'});
  const trusted = command('calendar_blocks','create',{});
  const haveTrustedWriter = (await one("select to_regprocedure('public.lemma_trusted_receipt_finish(uuid,uuid,text,jsonb,jsonb)') is not null present")).present;
  if(haveTrustedWriter) {
    const args = [owner,trusted.operationId,'fixture',JSON.stringify(trusted)];
    const expected = {operationId:trusted.operationId,status:'ok'};
    const saved = await result('select public.lemma_trusted_receipt_finish($1,$2,$3,$4,$5) result', [...args,JSON.stringify(expected)]);
    assert.deepEqual(saved,expected);
    assert.deepEqual(await result('select public.lemma_trusted_receipt_begin($1,$2,$3,$4) result',args),expected);
    assert.equal((await result('select public.lemma_trusted_receipt_begin($1,$2,$3,$4) result',
      [owner,legacy.operationId,'calendar_blocks',JSON.stringify(legacy)])).status,'conflict');
  } else {
    await rows(`insert into public.command_receipts(user_id,operation_id,resource,result,trusted_writer_version)
      values ($1,$2,'fixture','{"_request":null,"_request_sha256":"fixture"}',1)`,[owner,trusted.operationId]);
  }
  await as('authenticated',owner);
  const collision = await call('study_command',trusted);
  assert.equal(collision.status,'conflict');
  assert.equal('_request_sha256' in collision,false);
  // Rolling back the application to old RPCs preserves trusted records and reads.
  assert.deepEqual(await call('task_command',oldTask),original);
  assert.equal((await one('select trusted_writer_version from public.command_receipts where operation_id=$1',[trusted.operationId])).trusted_writer_version,1);
  await as('service_role');
  await rows('select public.lemma_begin_account_delete($1)',[owner]);
  const purged=await result('select public.lemma_purge_account_rows($1) result',[owner]);
  assert.equal(purged.status,'purged');
  await as(null);
  assert.equal((await one('select count(*)::int n from public.command_receipts where user_id=$1',[owner])).n,0);
  assert.equal((await one('select count(*)::int n from public.command_receipts where user_id=$1',[other])).n,1);
}

const url = process.env.NOTIF_TEST_DATABASE_URL;
if (!url) {
  const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  try { await rehearse(db); } finally { await db.close(); }
} else {
  const endpoint = new URL(url);
  assert.ok(['postgres:','postgresql:'].includes(endpoint.protocol) && ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)
    && endpoint.pathname==='/lemma_test' && !endpoint.search, 'expected the isolated loopback lemma_test PostgreSQL fixture');
  const {Client} = (await import('pg')).default;
  const control = new Client({connectionString:endpoint.href});
  const database = 'lemma_receipt_cutover_' + randomUUID().replaceAll('-','');
  const deployer = 'lemma_receipt_admin_' + randomUUID().replaceAll('-','');
  let client, created=false, createdDeployer=false, existingRoles;
  await control.connect();
  try {
    // PostgreSQL roles are cluster-wide. Serialize concurrent runs and remove
    // only roles this fixture provisioned after dropping its unique database.
    await control.query("select pg_advisory_lock(hashtextextended('lemma_receipt_cutover_fixture',0))");
    existingRoles = new Set((await control.query('select rolname from pg_roles')).rows.map(row=>row.rolname));
    for(const role of runtimeRoles) {
      if(!existingRoles.has(role)) await control.query('create role ' + role);
    }
    await control.query('create role ' + deployer + ' nologin nosuperuser createrole nobypassrls');
    createdDeployer=true;
    await control.query('grant authenticated to ' + deployer + ' with admin true, inherit false, set true');
    await control.query('grant anon, service_role to ' + deployer + ' with inherit false, set true');
    if(existingRoles.has(legacyRole)) {
      // A separate isolated database may already have installed the shared
      // role. Give only this disposable NOLOGIN administrator migration rights.
      await control.query('grant ' + legacyRole + ' to ' + deployer + ' with admin true, inherit false, set true');
    }
    await control.query('create database ' + database + ' owner ' + deployer + ' template template0');
    created=true;
    endpoint.pathname = '/' + database;
    client = new Client({connectionString:endpoint.href});
    await client.connect();
    await client.query('set session authorization ' + deployer);
    await rehearse({query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql)});
  } finally {
    try {
      if(client) await client.end();
      if(created) await control.query('drop database ' + database);
      if(existingRoles && !existingRoles.has(legacyRole)) {
        await control.query('drop role if exists ' + legacyRole);
      } else if(createdDeployer && (await control.query(`select 1 from pg_auth_members
        where roleid='authenticated'::regrole and member=to_regrole($1) and grantor=to_regrole($2)`,
        [legacyRole,deployer])).rowCount) {
        await control.query('revoke authenticated from ' + legacyRole + ' granted by ' + deployer);
      }
      if(createdDeployer) await control.query('drop role ' + deployer);
      if(existingRoles) {
        for(const role of runtimeRoles) if(!existingRoles.has(role)) {
          await control.query('drop role if exists ' + role);
        }
      }
    } finally { await control.end(); }
  }
}
console.log('PASS receipt cutover, rejected provenance drift, rollback, seven legacy RPCs, RLS, timer leases, replay, export and purge');
