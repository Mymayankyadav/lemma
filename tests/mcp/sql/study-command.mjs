// N11 isolated command acceptance. Never connect to the owner's Supabase.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const subject='22222222-2222-2222-2222-222222222222';
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const as=async(id)=>{await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[id]);await db.exec('set role authenticated')};
const command=async(payload)=>(await q('select public.study_command($1::jsonb) value',[JSON.stringify(payload)]))[0].value;
const patch={
 kind:'study',title:'Read proofs',starts_at:'2026-11-06T09:00:00Z',
 ends_at:'2026-11-06T10:00:00Z',time_zone:'Asia/Kolkata'
};
const request=(id,operation,extra={})=>({
 operationId:id,schemaVersion:1,resource:'calendar_blocks',operation,...extra
});
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create schema extensions; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
   await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values ($1),($2)',[owner,other]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values ($1,$2,'Math','M','amber')",[subject,owner]);
 await as(owner);
 const firstId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
 const create=request(firstId,'create',{patch:{...patch,subject_id:subject}});
 const created=await command(create);
 assert.equal(created.status,'ok');
 assert.equal(created.operationId,firstId);
 assert.equal(created.changed.length,1);
 assert.equal(created.changed[0].version,1);
 assert.equal(created.actionNo,null,'journal is deferred to remaining N11 work');
 const blockId=created.changed[0].id;
 assert.equal((await q('select count(*)::int n from public.calendar_blocks'))[0].n,1);
 assert.equal((await q('select title from public.calendar_blocks where id=$1',[blockId]))[0].title,'Read proofs');
 assert.deepEqual(await command({...create,patch:{...patch,title:'different on retry'}}),created,
   'lost acknowledgement returns the exact first receipt before validation');
 assert.equal((await q('select count(*)::int n from public.calendar_blocks'))[0].n,1);
 const secondId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
 const updated=await command(request(secondId,'update',{
   target:{id:blockId},expectedVersion:1,patch:{title:'Revised proofs'}
 }));
 assert.equal(updated.status,'ok');
 assert.equal(updated.changed[0].version,2);
 const current=(await q('select * from public.calendar_blocks where id=$1',[blockId]))[0];
 assert.equal(current.title,'Revised proofs');
 assert.equal(current.time_zone,'Asia/Kolkata','an omitted patch key is preserved');
 assert.equal(current.subject_id,subject);
 assert.deepEqual(await command(request(secondId,'update',{
   target:{id:blockId},expectedVersion:1,patch:{title:'retry'}
 )),updated,'retry after update returns the receipt even with a stale version');
 const conflictId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
 const stale=await command(request(conflictId,'update',{
   target:{id:blockId},expectedVersion:1,patch:{title:'stale'}
 }));
 assert.equal(stale.status,'conflict');
 assert.equal(stale.current.version,2);
 assert.equal(stale.current.title,'Revised proofs');
 assert.equal(stale.conflict.expectedVersion,1);
 assert.deepEqual(await command(request(conflictId,'update',{
   target:{id:blockId},expectedVersion:1,patch:{title:'another stale retry'}
 })),stale);
 assert.equal((await q('select title from public.calendar_blocks where id=$1',[blockId]))[0].title,'Revised proofs');
 const clear=await command(request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','update',{
   target:{id:blockId},expectedVersion:2,patch:{subject_id:null}
 }));
 assert.equal(clear.changed[0].version,3);
 assert.equal((await q('select subject_id from public.calendar_blocks where id=$1',[blockId]))[0].subject_id,null,
  'explicit null clears a nullable field');
 await assert.rejects(command(request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','update',{
   target:{id:blockId},expectedVersion:3,patch:{user_id:other}
 })),/Unknown patch field/);
 await assert.rejects(command(request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','create',{
   patch:{...patch,version:99}
 })),/Unknown patch field/);
 await assert.rejects(command(request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','create',{
   patch:{...patch,ends_at:'2026-11-06T08:00:00Z'}
 })),/check constraint/);
 await assert.rejects(command(request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8','update',{
   target:{id:blockId},patch:{title:'no version'}
 })),/expectedVersion/);
 await assert.rejects(command(request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9','create',{
   patch:{...patch},schemaVersion:2
 })),/schemaVersion/);
 await assert.rejects(command(request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10','delete',{
   target:{id:blockId},expectedVersion:3,patch:{}
 })),/Unsupported operation/);
 await as(other);
 assert.equal((await q('select count(*)::int n from public.calendar_blocks'))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.command_receipts'))[0].n,0);
 await assert.rejects(command(request('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','update',{
   target:{id:blockId},expectedVersion:3,patch:{title:'cross owner'}
 })),/not found/);
 await assert.rejects(command(request('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','create',{
   patch:{...patch,subject_id:subject}
 })),/foreign key|row-level security/);
 const ownedByOther=await command(request(firstId,'create',{patch:{...patch,kind:'busy',title:'Private'}}));
 assert.equal(ownedByOther.status,'ok','operation IDs are scoped to authenticated owners');
 assert.notEqual(ownedByOther.changed[0].id,blockId);
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.calendar_blocks'))[0].n,1);
 assert.equal((await q('select count(*)::int n from public.command_receipts'))[0].n,4);
 console.log('PASS N11 calendar command: receipts, version conflicts, patch distinction, validation and owner isolation');
} finally {await db.close()}
