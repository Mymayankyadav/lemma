// N11.1 isolated calendar-command acceptance. Never connect to production.
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
 assert.ok(Number.isSafeInteger(created.actionNo)&&created.actionNo>0,'calendar create is now journalled with a real actionNo');
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
 })),updated,'retry after update returns the receipt even with a stale version');
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
 })),error=>/subject.*(owner|belong|found)|foreign key|row-level security/i.test(String(error)));
 assert.equal((await q('select count(*)::int n from public.calendar_blocks'))[0].n,0,'RLS hides the owner block and the rejected cross-owner insert');
 const ownedByOther=await command(request(firstId,'create',{patch:{...patch,kind:'busy',title:'Private'}}));
 assert.equal(ownedByOther.status,'ok','operation IDs are scoped to authenticated owners');
 assert.notEqual(ownedByOther.changed[0].id,blockId);
 await as(owner);
 assert.equal((await q('select count(*)::int n from public.calendar_blocks'))[0].n,1);
 assert.equal((await q('select count(*)::int n from public.command_receipts'))[0].n,4);

 // N11.2 entry lifecycle and receipt replay.
 const study=(id,operation,extra={})=>({operationId:id,schemaVersion:1,resource:'study_entries',operation,...extra});
 const entryCreate=study('cccccccc-cccc-cccc-cccc-ccccccccccc1','create',{patch:{source:'timer',intent:'Proof practice',subject_id:subject}});
 const entryCreated=await command(entryCreate);
 assert.equal(entryCreated.status,'ok');
 const entryId=entryCreated.changed[0].id;
 assert.equal(entryCreated.changed[0].version,1);
 assert.deepEqual(await command({...entryCreate,patch:{source:'manual',intent:'different'}}),entryCreated);
 const started=await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc2','start',{target:{id:entryId},expectedVersion:1,patch:{}}));
 assert.equal(started.changed[0].version,2);
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1',[entryId]))[0].n,1);
 const paused=await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc3','pause',{target:{id:entryId},expectedVersion:2,patch:{}}));
 assert.equal(paused.changed[0].version,3);
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[entryId]))[0].n,0);
 const resumed=await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc4','resume',{target:{id:entryId},expectedVersion:3,patch:{}}));
 assert.equal(resumed.changed[0].version,4);
 const saved=await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc5','save',{target:{id:entryId},expectedVersion:4,patch:{reflection:'Completed proof'}}));
 assert.equal(saved.changed[0].version,5);
 assert.equal((await q('select status from public.study_entries where id=$1',[entryId]))[0].status,'saved');
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[entryId]))[0].n,0);
 assert.deepEqual(await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc5','save',{target:{id:entryId},expectedVersion:4,patch:{}})),saved);
 await assert.rejects(command(study('cccccccc-cccc-cccc-cccc-ccccccccccc6','save',{target:{id:entryId},expectedVersion:5,patch:{}})),/Terminal/);
 await assert.rejects(command({
   operationId:'ffffffff-ffff-ffff-ffff-fffffffffff6',schemaVersion:1,
   resource:'study_intervals',operation:'create',
   patch:{entry_id:entryId,kind:'focus',started_at:'2026-11-05T10:00:00Z',ended_at:'2026-11-05T11:00:00Z'}
 }),/Terminal study entry/);
 const draft=await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc7','create',{patch:{source:'manual',intent:'Scratch'}}));
 const draftId=draft.changed[0].id;
 const discarded=await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc8','discard',{target:{id:draftId},expectedVersion:1,patch:{}}));
 assert.equal(discarded.status,'ok');
 assert.equal((await q('select status from public.study_entries where id=$1',[draftId]))[0].status,'discarded');
 const staleStudy=await command(study('cccccccc-cccc-cccc-cccc-ccccccccccc9','update',{target:{id:entryId},expectedVersion:1,patch:{intent:'stale'}}));
 assert.equal(staleStudy.status,'conflict');
 await assert.rejects(command(study('cccccccc-cccc-cccc-cccc-cccccccccc10','create',{patch:{source:'manual',user_id:other}})),/Unknown patch field/);
 await as(other);
 await assert.rejects(command(study('dddddddd-dddd-dddd-dddd-ddddddddddd1','update',{target:{id:entryId},expectedVersion:5,patch:{intent:'steal'}})),/not found/);
 await as(owner);

 const breakEntry=await command(study('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1','create',{patch:{source:'timer',intent:'Break test'}}));
 const breakId=breakEntry.changed[0].id;
 await command(study('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2','start',{target:{id:breakId},expectedVersion:1,patch:{}}));
 await command(study('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3','break',{target:{id:breakId},expectedVersion:2,patch:{}}));
 assert.equal((await q("select count(*)::int n from public.study_intervals where entry_id=$1 and kind='break' and ended_at is null",[breakId]))[0].n,1);
 await command(study('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4','resume',{target:{id:breakId},expectedVersion:3,patch:{}}));
 assert.equal((await q("select count(*)::int n from public.study_intervals where entry_id=$1 and kind='break' and ended_at is null",[breakId]))[0].n,0);
 const discardBreak=await command(study('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5','discard',{target:{id:breakId},expectedVersion:4,patch:{}}));
 assert.equal(discardBreak.status,'ok');
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1',[breakId]))[0].n,0);
 const intervalEntry=await command(study('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6','create',{patch:{source:'manual'}}));
 const intervalId=intervalEntry.changed[0].id;
 const intervalRequest=(id,operation,extra={})=>({operationId:id,schemaVersion:1,resource:'study_intervals',operation,...extra});
 const intervalCreated=await command(intervalRequest('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee7','create',{patch:{entry_id:intervalId,kind:'focus',started_at:'2026-11-05T10:00:00Z',ended_at:'2026-11-05T11:00:00Z'}}));
 assert.equal(intervalCreated.status,'ok');
 assert.equal(intervalCreated.changed[0].version,2,'interval creation advances parent version');
 const iid=intervalCreated.changed[0].id;
 assert.deepEqual(await command(intervalRequest('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee7','create',{patch:{entry_id:intervalId,kind:'break',started_at:'2026-11-05T10:00:00Z'}})),intervalCreated);
 const intervalUpdated=await command(intervalRequest('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee8','update',{target:{id:iid},expectedVersion:2,patch:{kind:'break'}}));
 assert.equal(intervalUpdated.status,'ok');
 assert.equal(intervalUpdated.changed[0].version,3);
 const staleInterval=await command(intervalRequest('ffffffff-ffff-ffff-ffff-fffffffffff7','update',{target:{id:iid},expectedVersion:2,patch:{kind:'focus'}}));
 assert.equal(staleInterval.status,'conflict','stale interval update cannot overwrite newer write');
 assert.equal(staleInterval.conflict.currentVersion,3);
 assert.equal((await q('select kind from public.study_intervals where id=$1',[iid]))[0].kind,'break');
 // Reject invalid transitions without mutating state or consuming the operation ID.
 await assert.rejects(command(study('ffffffff-ffff-ffff-ffff-fffffffffff1','resume',{
   target:{id:intervalId},expectedVersion:3,patch:{}
 })),/Invalid resume transition/);
 const partial=await command(study('ffffffff-ffff-ffff-ffff-fffffffffff2','update',{
   target:{id:intervalId},expectedVersion:3,patch:{intent:'Updated intent'}
 }));
 assert.equal(partial.changed[0].version,4);
 const unchanged=(await q('select source,intent from public.study_entries where id=$1',[intervalId]))[0];
 assert.equal(unchanged.source,'manual','omitted patch field is preserved');
 assert.equal(unchanged.intent,'Updated intent');
 await assert.rejects(command(study('ffffffff-ffff-ffff-ffff-fffffffffff3','pause',{
   target:{id:intervalId},expectedVersion:4,patch:{}
 })),/Invalid pause transition/);
 await as(other);
 await assert.rejects(command(intervalRequest('ffffffff-ffff-ffff-ffff-fffffffffff4','update',{
   target:{id:iid},expectedVersion:1,patch:{kind:'focus'}
 })),/not found/);
 await assert.rejects(command(intervalRequest('ffffffff-ffff-ffff-ffff-fffffffffff5','create',{
   patch:{entry_id:intervalId,kind:'focus',started_at:'2026-11-05T12:00:00Z',ended_at:'2026-11-05T13:00:00Z'}
 })),/Study entry not found|foreign key|row-level security/);
 await as(owner);
 // Missing and null expectedVersion must never mutate an entry, interval or receipt.
 const receiptCount=async()=>(await q('select count(*)::int n from public.command_receipts'))[0].n;
 const version=async()=>(await q('select version from public.study_entries where id=$1',[intervalId]))[0].version;
 // Create-only fields must not return ok for acknowledged no-op updates.
 // Mixed valid/invalid patches and patched deletes also roll back cleanly.
 const studyBefore=(await q('select source,intent,version from public.study_entries where id=$1',[intervalId]))[0];
 const intervalBefore=(await q('select entry_id,kind,started_at,ended_at from public.study_intervals where id=$1',[iid]))[0];
 for(const [i,patch] of [{source:'timer'},{source:'timer',intent:'silently ignored'}].entries()){
   const operationId='ffffffff-ffff-ffff-ffff-'+String(60+i).padStart(12,'0');
   const before=await receiptCount();
   await assert.rejects(command(study(operationId,'update',{
     target:{id:intervalId},expectedVersion:4,patch
   })),/Unknown patch field: source/);
   assert.deepEqual((await q('select source,intent,version from public.study_entries where id=$1',[intervalId]))[0],studyBefore);
   assert.equal(await receiptCount(),before,'invalid study patch stores no success receipt');
 }
 for(const [i,patch] of [{entry_id:entryId},{entry_id:entryId,kind:'focus'}].entries()){
   const operationId='ffffffff-ffff-ffff-ffff-'+String(62+i).padStart(12,'0');
   const before=await receiptCount();
   await assert.rejects(command(intervalRequest(operationId,'update',{
     target:{id:iid},expectedVersion:4,patch
   })),/Unknown patch field: entry_id/);
   assert.deepEqual((await q('select entry_id,kind,started_at,ended_at from public.study_intervals where id=$1',[iid]))[0],intervalBefore);
   assert.equal(await version(),4,'invalid interval patch leaves parent version unchanged');
   assert.equal(await receiptCount(),before,'invalid interval patch stores no success receipt');
 }
 for(const [operationId,payload] of [
   ['ffffffff-ffff-ffff-ffff-000000000064',study('ffffffff-ffff-ffff-ffff-000000000064','delete',{target:{id:intervalId},expectedVersion:4,patch:{intent:'ignored'}})],
   ['ffffffff-ffff-ffff-ffff-000000000065',intervalRequest('ffffffff-ffff-ffff-ffff-000000000065','delete',{target:{id:iid},expectedVersion:4,patch:{kind:'focus'}})]
 ]){
   const before=await receiptCount();
   await assert.rejects(command(payload),/Unknown patch field/);
   assert.deepEqual((await q('select source,intent,version from public.study_entries where id=$1',[intervalId]))[0],studyBefore);
   assert.deepEqual((await q('select entry_id,kind,started_at,ended_at from public.study_intervals where id=$1',[iid]))[0],intervalBefore);
   assert.equal(await receiptCount(),before,'patched delete does not consume operationId '+operationId);
 }
 let nonce=20;
 for(const operation of ['update','delete','start','pause','resume','break','save','discard']){
   for(const invalid of [undefined,null]){
     const operationId='ffffffff-ffff-ffff-ffff-'+String(nonce++).padStart(12,'0');
     const payload=study(operationId,operation,{target:{id:intervalId},patch:operation==='delete'?{}:{intent:'must not write'}});
     if(invalid!==undefined) payload.expectedVersion=invalid;
     const before=await receiptCount();
     await assert.rejects(command(payload),/expectedVersion/);
     assert.equal(await version(),4,'invalid version leaves entry unchanged');
     assert.equal(await receiptCount(),before,'rejected operation has no receipt');
   }
 }
 for(const operation of ['update','delete']){
   for(const invalid of [undefined,null]){
     const operationId='ffffffff-ffff-ffff-ffff-'+String(nonce++).padStart(12,'0');
     const payload=intervalRequest(operationId,operation,{target:{id:iid},patch:operation==='delete'?{}:{kind:'focus'}});
     if(invalid!==undefined) payload.expectedVersion=invalid;
     const before=await receiptCount();
     await assert.rejects(command(payload),/expectedVersion/);
     assert.equal(await version(),4);
     assert.equal((await q('select kind from public.study_intervals where id=$1',[iid]))[0].kind,'break');
     assert.equal(await receiptCount(),before);
   }
 }
 // One open interval per entry; a future open interval is invalid.
 const openStart='2026-11-05T14:00:00Z';
 const open=await command(intervalRequest('ffffffff-ffff-ffff-ffff-000000000050','create',{
   patch:{entry_id:intervalId,kind:'focus',started_at:openStart}
 }));
 assert.equal(open.changed[0].version,5);
 const openId=open.changed[0].id;
 await assert.rejects(command(intervalRequest('ffffffff-ffff-ffff-ffff-000000000051','create',{
   patch:{entry_id:intervalId,kind:'focus',started_at:openStart}
 })),/Open interval exists/);
 await assert.rejects(command(intervalRequest('ffffffff-ffff-ffff-ffff-000000000052','create',{
   patch:{entry_id:intervalId,kind:'focus',started_at:'2099-01-01T10:00:00Z'}
 })),/Future interval start/);
 await assert.rejects(command(intervalRequest('ffffffff-ffff-ffff-ffff-000000000053','update',{
   target:{id:iid},expectedVersion:5,patch:{ended_at:null}
 })),/Open interval exists/);
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[intervalId]))[0].n,1);
 const closed=await command(intervalRequest('ffffffff-ffff-ffff-ffff-000000000054','update',{
   target:{id:openId},expectedVersion:5,patch:{ended_at:'2026-11-05T15:00:00Z'}
 }));
 assert.equal(closed.changed[0].version,6);
 const intervalDeleted=await command(intervalRequest('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee9','delete',{target:{id:iid},expectedVersion:6,patch:{}}));
 assert.equal(intervalDeleted.status,'ok');
 assert.equal(intervalDeleted.changed[0].version,7);
 assert.equal((await q('select count(*)::int n from public.study_intervals where id=$1',[iid]))[0].n,0);
 const finalSaved=await command(study('ffffffff-ffff-ffff-ffff-000000000055','save',{
   target:{id:intervalId},expectedVersion:7,patch:{reflection:'Finished'}
 }));
 assert.equal(finalSaved.status,'ok');
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[intervalId]))[0].n,0);
 // A saved entry never retains an open interval.
 const futureEntry=await command(study('ffffffff-ffff-ffff-ffff-000000000056','create',{patch:{source:'manual'}}));
 const futureId=futureEntry.changed[0].id;
 await assert.rejects(command(intervalRequest('ffffffff-ffff-ffff-ffff-000000000057','create',{
   patch:{entry_id:futureId,kind:'focus',started_at:'2099-01-01T11:00:00Z'}
 })),/Future interval start/);
 assert.equal((await q('select version from public.study_entries where id=$1',[futureId]))[0].version,1);
 // A pre-existing future interval (e.g. legacy/corrupt data) cannot be saved.
 // The rejected save must not change the entry or consume its operation ID.
 const beforeFutureSaveReceipts=await receiptCount();
 await q('insert into public.study_intervals(entry_id,user_id,kind,started_at) values ($1,$2,$3,$4)',[
   futureId,owner,'focus','2099-01-01T11:00:00Z'
 ]);
 await assert.rejects(command(study('ffffffff-ffff-ffff-ffff-000000000059','save',{
   target:{id:futureId},expectedVersion:1,patch:{reflection:'must not save'}
 })),/Future open interval/);
 const unchangedFuture=(await q('select status,version,saved_at from public.study_entries where id=$1',[futureId]))[0];
 assert.equal(unchangedFuture.status,'draft');
 assert.equal(unchangedFuture.version,1);
 assert.equal(unchangedFuture.saved_at,null);
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[futureId]))[0].n,1);
 assert.equal(await receiptCount(),beforeFutureSaveReceipts);
 await q('delete from public.study_intervals where entry_id=$1 and user_id=$2',[futureId,owner]);
 const futureSaved=await command(study('ffffffff-ffff-ffff-ffff-000000000058','save',{
   target:{id:futureId},expectedVersion:1,patch:{}
 }));
 assert.equal(futureSaved.status,'ok');
 assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[futureId]))[0].n,0);
 console.log('PASS N11.1 calendar command: receipts, version conflicts, patch distinction, validation and owner isolation');
} finally {await db.close()}
