// NOTIF-1a: isolated PostgreSQL; no live Supabase connection.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
const owner='11111111-1111-1111-1111-111111111111'
const other='99999999-9999-9999-9999-999999999999'
const q=async(sql,params=[])=>(await db.query(sql,params)).rows
const setUser=async(id)=>db.exec("select set_config('test.uid','"+id+"',false)")
const migrationUrl=new URL('../../supabase/migrations/20261101104000_notifications_base.sql',import.meta.url)
const migration=await readFile(migrationUrl,'utf8')
const device=(n,user=owner)=>[user,'https://push.example.test/'+user+'/'+n,'publickey'+n,'authkey'+n,'Device '+n,'android_web']
const add=async(n,user=owner)=>q('insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,$2,$3,$4,$5,$6) returning id',device(n,user))
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 const dir=new URL('../../supabase/migrations/',import.meta.url)
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
  await db.exec(await readFile(new URL(file,dir),'utf8'))
 await q('insert into auth.users(id) values($1),($2)',[owner,other])
 await setUser(owner)
 await db.exec('select public.bootstrap()')
 const columns=await q("select column_name from information_schema.columns where table_schema='public' and table_name in ('push_devices','notifications','notify_holds')")
 assert(columns.some(x=>x.column_name==='disabled_reason'))
 assert(columns.some(x=>x.column_name==='facts'))
 assert(columns.some(x=>x.column_name==='until'))
 assert.equal((await q("select count(*)::int n from pg_policies where schemaname='public' and tablename in ('push_devices','notifications','notify_holds')"))[0].n,3)
 console.log('PASS NOTIF-1a tables and owner policies')

 await q('update public.settings set notify=$1::jsonb where user_id=$2',[JSON.stringify({enabled:true,custom:'kept'}),owner])
 assert.deepEqual((await q('select notify from public.settings where user_id=$1',[owner]))[0].notify,{enabled:true,custom:'kept'})
 await assert.rejects(q('update public.settings set notify=$1::jsonb where user_id=$2',['[]',owner]),/settings_notify_object_check/)
 await assert.rejects(q('update public.settings set notify=$1::jsonb where user_id=$2',[JSON.stringify({x:'x'.repeat(5000)}),owner]),/settings_notify_object_check/)
 console.log('PASS NOTIF-1a bounded settings JSON object')
 const settingsAction=(await q('select max(no) n from public.actions where user_id=$1',[owner]))[0].n
 await q('select public.undo_action($1,$2,false)',[owner,settingsAction])
 assert.equal((await q('select notify from public.settings where user_id=$1',[owner]))[0].notify,null)
 console.log('PASS NOTIF-1a settings.notify update is journalled and undoable')


 await db.exec('set role authenticated')
 for(let n=1;n<=10;n++)await add(n)
 await assert.rejects(add(11),/You have 10 devices with reminders. Remove one first./)
 assert.equal((await q('select count(*)::int n from public.push_devices where disabled_at is null'))[0].n,10)
 const original=(await q('select id from public.push_devices where endpoint=$1',[device(1)[1]]))[0].id
 await q('update public.push_devices set disabled_at=now(),disabled_reason=$1 where id=$2',['removed',original])
 await add(11)
 await assert.rejects(q('select public.upsert_push_device($1,$2,$3,$4,$5)',
  [device(1)[1],'newkey','authkey1','Re-enable','android_web']),
  /You have 10 devices with reminders. Remove one first./)
 await assert.rejects(q('update public.push_devices set disabled_at=null,disabled_reason=null where id=$1',[original]),
  /You have 10 devices with reminders. Remove one first./)
 assert.equal((await q('select count(*)::int n from public.push_devices where disabled_at is null'))[0].n,10)
 assert.equal((await q('select count(*)::int n from public.push_devices'))[0].n,11)
 await q('update public.push_devices set disabled_at=now(),disabled_reason=$1 where endpoint=$2',['removed',device(11)[1]])
 await q('update public.push_devices set disabled_at=null,disabled_reason=null where id=$1',[original])
 assert.equal((await q('select id from public.push_devices where id=$1',[original]))[0].id,original)
 console.log('PASS NOTIF-1a 10-device cap on insert and restore, same-id lifecycle')

 const existing=await q('select (public.upsert_push_device($1,$2,$3,$4,$5)).id id',
 [device(1)[1],'newkey','authkey1','Renamed','android_web'])
 assert.equal(existing[0].id,original)
 assert.equal((await q('select label from public.push_devices where id=$1',[original]))[0].label,'Renamed')
 assert.equal((await q('select count(*)::int n from public.push_devices'))[0].n,11)
 console.log('PASS NOTIF-1a endpoint re-add preserves row id')
 // PGlite serialises requests on one backend; the advisory lock also protects
 // real concurrent PostgreSQL connections (independent integration still needed).
 await q('update public.push_devices set disabled_at=now(),disabled_reason=$1 where endpoint=$2',['removed',device(2)[1]])
 assert.equal((await q('select count(*)::int n from public.push_devices where disabled_at is null'))[0].n,9)
 // The two requests arrive together; the PGlite harness has one backend,
 // so queue its SQL operations rather than issuing unsupported overlapping queries.
 let queue=Promise.resolve()
 const queuedAdd=(n)=>{
  const run=queue.then(()=>add(n))
  queue=run.then(()=>undefined,()=>undefined)
  return run
 }
 const simultaneous=await Promise.allSettled([queuedAdd(12),queuedAdd(13)])
 assert.equal(simultaneous.filter(x=>x.status==='fulfilled').length,1)
 assert.equal(simultaneous.filter(x=>x.status==='rejected').length,1)
 assert.equal((await q('select count(*)::int n from public.push_devices where disabled_at is null'))[0].n,10)
 console.log('PASS NOTIF-1a concurrent-request cap (single PGlite backend)')


 await db.exec('reset role')
 await setUser(other)
 await db.exec('set role authenticated')
 assert.equal((await q('select count(*)::int n from public.push_devices'))[0].n,0)
 await assert.rejects(q('select public.upsert_push_device($1,$2,$3,$4,$5)',
  [device(1)[1],'foreignkey','auth','Foreign','desktop']),/This browser gets reminders for another Lemma account./)
 assert.equal((await q('select count(*)::int n from public.notify_holds'))[0].n,0)
 assert.equal((await q('select count(*)::int n from public.notifications'))[0].n,0)
 assert.equal((await q('update public.push_devices set label=$1 returning id',['Foreign'])).length,0)
 await assert.rejects(q("insert into public.notifications(user_id,kind,key,title,body,url,due_at) values($1,'test','test:1','Test','Hello','#/',now())",[other]),/permission denied/)
 await q('insert into public.notify_holds(user_id,scope,"until") values($1,$2,now()+interval \'1 hour\')',[other,'due'])
 await db.exec('reset role')
 await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at) values($1,'test','test:owner','Test','Hello','#/',now())",[owner])
 await setUser(owner)
 await db.exec('set role authenticated')
 assert.equal((await q('select count(*)::int n from public.notifications'))[0].n,1)
 assert.equal((await q('select count(*)::int n from public.notify_holds'))[0].n,0)
 await db.exec('reset role')
 console.log('PASS NOTIF-1a notification read-only owner RLS and cross-owner isolation')

 const before=await q("select tablename,policyname,roles::text from pg_policies where schemaname='public' and tablename in ('push_devices','notifications','notify_holds') order by tablename")
 const grantsBefore=await q("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('push_devices','notifications','notify_holds') order by table_name,grantee,privilege_type")
 await db.exec(`drop function public.upsert_push_device(text,text,text,text,text);
 drop trigger push_devices_cap on public.push_devices;
 drop function public.push_devices_cap();
 drop table public.notify_holds,public.notifications,public.push_devices;
 alter table public.settings drop column notify;`)
 await db.exec(migration)
 const after=await q("select tablename,policyname,roles::text from pg_policies where schemaname='public' and tablename in ('push_devices','notifications','notify_holds') order by tablename")
 assert.deepEqual(after,before)
 const grantsAfter=await q("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('push_devices','notifications','notify_holds') order by table_name,grantee,privilege_type")
 assert.deepEqual(grantsAfter,grantsBefore)
 console.log('PASS NOTIF-1a down → up restores owner policies and grants')
}finally{await db.close()}
