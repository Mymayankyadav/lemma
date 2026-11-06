// N11.3 isolated reversible v6 command acceptance (PGlite only; no production DB).
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const as=async(id)=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
};
let n=100;
const operationId=()=> 'dddddddd-dddd-dddd-dddd-'+String(n++).padStart(12,'0');
const req=(resource,operation,extra={})=>({
  operationId:operationId(),schemaVersion:1,resource,operation,...extra
});
const command=async(payload)=>(await q('select public.study_command($1::jsonb) value',[JSON.stringify(payload)]))[0].value;
const undo=async(user,no)=>(await q('select public.undo_action($1::uuid,$2::bigint,false) value',[user,no]))[0].value;
const actionCount=async()=>(await q('select count(*)::int n from public.actions'))[0].n;
const changes=async(no)=>(await q('select table_name,op from public.action_changes where action_no=$1 order by seq',[no]));
const calendarPatch={kind:'study',title:'Read proofs',starts_at:'2026-11-05T10:00:00Z',
  ends_at:'2026-11-05T11:00:00Z',time_zone:'Asia/Kolkata'};
const realAction=(r)=>assert.ok(Number.isSafeInteger(r.actionNo)&&r.actionNo>0,
  'successful command must return a real journal action');
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
  await as(owner);

  // Calendar creation, updates and deletion all have receipts with journal numbers.
  const createBlock=req('calendar_blocks','create',{patch:calendarPatch});
  const c=await command(createBlock); realAction(c);
  const cid=c.changed[0].id;
  assert.deepEqual(await changes(c.actionNo),[{table_name:'calendar_blocks',op:'insert'}]);
  assert.deepEqual(await command({...createBlock,patch:{...calendarPatch,title:'retry'}}),c);
  const updated=await command(req('calendar_blocks','update',{
    target:{id:cid},expectedVersion:1,patch:{title:'Revised proofs'}
  })); realAction(updated);
  assert.equal(updated.changed[0].version,2);
  assert.deepEqual(await changes(updated.actionNo),[{table_name:'calendar_blocks',op:'update'}]);
  const calendarDelete=req('calendar_blocks','delete',{target:{id:cid},expectedVersion:2,patch:{}});
  const removed=await command(calendarDelete); realAction(removed);
  assert.equal((await q('select count(*)::int n from public.calendar_blocks where id=$1',[cid]))[0].n,0);
  assert.deepEqual(await changes(removed.actionNo),[{table_name:'calendar_blocks',op:'delete'}]);
  assert.deepEqual(await command({...calendarDelete,patch:{title:'changed after ack'}}),removed,
    'receipt replay precedes validation, exactly retaining the actionNo');
  const restored=await undo(owner,removed.actionNo);
  assert.equal(restored.undone,removed.actionNo);
  assert.equal((await q('select title from public.calendar_blocks where id=$1',[cid]))[0].title,'Revised proofs');
  await assert.rejects(undo(owner,removed.actionNo),/already undone/);
  console.log('PASS calendar delete/restore, journal actionNo and exact receipt replay');

  // Saving closes an open focus interval in the same journal action; undo reopens it.
  const created=await command(req('study_entries','create',{patch:{source:'timer',intent:'Prove lemma'}}));
  realAction(created);
  const id=created.changed[0].id;
  const started=await command(req('study_entries','start',{
    target:{id},expectedVersion:1,patch:{}
  })); realAction(started);
  assert.deepEqual((await changes(started.actionNo)).map(x=>x.table_name).sort(),
    ['study_entries','study_intervals']);
  const startRow=(await q('select status,version from public.study_entries where id=$1',[id]))[0];
  assert.deepEqual(startRow,{status:'running',version:2});
  const savedRequest=req('study_entries','save',{
    target:{id},expectedVersion:2,patch:{reflection:'Clear proof'}
  });
  const saved=await command(savedRequest); realAction(saved);
  assert.equal((await q('select status from public.study_entries where id=$1',[id]))[0].status,'saved');
  assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[id]))[0].n,0);
  assert.deepEqual((await changes(saved.actionNo)).map(x=>x.table_name).sort(),
    ['study_entries','study_intervals']);
  const actionBeforeReplay=await actionCount();
  assert.deepEqual(await command({...savedRequest,expectedVersion:99,patch:{}}),saved);
  assert.equal(await actionCount(),actionBeforeReplay,'receipt replay never adds an action');
  const unsaved=await undo(owner,saved.actionNo);
  assert.equal(unsaved.undone,saved.actionNo);
  const afterUndo=(await q('select status,version,reflection,saved_at from public.study_entries where id=$1',[id]))[0];
  assert.equal(afterUndo.status,'running');
  assert.equal(afterUndo.version,2);
  assert.equal(afterUndo.reflection,null);
  assert.equal(afterUndo.saved_at,null);
  assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1 and ended_at is null',[id]))[0].n,1);
  console.log('PASS save/undo restores entry version and open focus interval atomically');

  // Cascade deletion of an entry must restore its child interval, not orphan it.
  const draft=await command(req('study_entries','create',{patch:{source:'manual',intent:'Scratch'}}));
  const did=draft.changed[0].id;
  const interval=await command(req('study_intervals','create',{patch:{
    entry_id:did,kind:'focus',started_at:'2026-11-05T08:00:00Z',ended_at:'2026-11-05T09:00:00Z'
  }})); realAction(interval);
  const deleted=await command(req('study_entries','delete',{
    target:{id:did},expectedVersion:2,patch:{}
  })); realAction(deleted);
  assert.equal((await q('select count(*)::int n from public.study_entries where id=$1',[did]))[0].n,0);
  assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1',[did]))[0].n,0);
  assert.deepEqual((await changes(deleted.actionNo)).map(x=>x.table_name).sort(),
    ['study_entries','study_intervals']);
  await undo(owner,deleted.actionNo);
  assert.equal((await q('select version from public.study_entries where id=$1',[did]))[0].version,2);
  assert.equal((await q('select count(*)::int n from public.study_intervals where entry_id=$1',[did]))[0].n,1);
  console.log('PASS deleting a study entry and undoing restores its dependent interval');

  // An intervening newer edit on the same row refuses stale undo.
  const change1=await command(req('study_entries','update',{
    target:{id:did},expectedVersion:2,patch:{intent:'First edit'}
  }));
  const change2=await command(req('study_entries','update',{
    target:{id:did},expectedVersion:3,patch:{reflection:'Later edit'}
  }));
  realAction(change1);realAction(change2);
  await assert.rejects(undo(owner,change1.actionNo),/Undo A\d+ first/);
  assert.equal((await q('select intent,reflection,version from public.study_entries where id=$1',[did]))[0].version,4);
  assert.equal((await q('select intent from public.study_entries where id=$1',[did]))[0].intent,'First edit');
  await undo(owner,change2.actionNo);
  assert.equal((await q('select reflection from public.study_entries where id=$1',[did]))[0].reflection,null);
  console.log('PASS newer writes block stale undo');

  // The owner is authenticated; neither an owner swap nor a foreign action works.
  await as(other);
  assert.equal((await q('select count(*)::int n from public.actions'))[0].n,0);
  await assert.rejects(undo(owner,change1.actionNo),/Not authorized/);
  await assert.rejects(undo(other,change1.actionNo),/is not yours/);
  await as(owner);
  assert.equal((await q('select intent from public.study_entries where id=$1',[did]))[0].intent,'First edit');
  console.log('PASS cross-owner undo is rejected without modifying records');
} finally {await db.close();}
