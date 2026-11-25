import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=async(sql,args=[])=>(await q(sql,args))[0];
const owner=randomUUID(),other=randomUUID();
const as=async(uid,role='authenticated')=>{
 await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[uid]);await db.exec('set role '+role);
};
const input={projectSlug:'proofs',front:'A proof',back:'Proof body',type:'basic',kind:'proof'};
const create=async(payload=input,operation=randomUUID())=>(await one('select public.create_note_atomic($1,$2::jsonb) r',[operation,JSON.stringify(payload)])).r;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort())
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [uid,slug] of [[owner,'proofs'],[other,'other-only']]){
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[uid,uid.replaceAll('-','').padEnd(48,'a')]);
  await q("insert into public.projects(user_id,slug,title,goal,status) values($1,$2,'Proofs','Prove','active')",[uid,slug]);
 }
 await as(owner);
 for(const [type,front,ordinals] of [['basic','A proof',[1]],['reverse','A converse',[1,2]],['cloze','{{c1::one}} and {{c3::three}}',[1,3]]]){
  const operation=randomUUID(),payload={...input,type,front};
  const receipt=await create(payload,operation);
  assert.equal(receipt.status,'ok');
  const cards=await q('select id,ord from public.cards where note_id=$1 order by ord',[receipt.noteId]);
  assert.deepEqual(cards.map(c=>c.ord),ordinals);
  assert.deepEqual(await create(payload,operation),receipt,'lost acknowledgement replays one creation');
  assert.equal((await one('select count(*)::int n from public.notes where id=$1',[receipt.noteId])).n,1);
  assert.equal((await create({...payload,back:'Changed'},operation)).status,'conflict');
  const state={state:2,due:'2030-01-01T00:00:00Z',stability:2,difficulty:5,last_review:'2026-11-25T00:00:00Z',step:0,reps:1,lapses:0};
  await q('select public.record_review($1,3,null,100,$2::jsonb)',[cards[0].id,JSON.stringify(state)]);
  assert.deepEqual(await create(payload,operation),receipt,'a retry cannot delete later independent learning');
  assert.equal((await one('select count(*)::int n from public.reviews where card_id=$1',[cards[0].id])).n,1);
 }
 await assert.rejects(create({...input,projectSlug:'other-only'}),/Project not found for owner/);
 await assert.rejects(create({...input,checkpointCode:'MISSING'}),/Checkpoint not found for owner/);
 const renamed=await create();
 await q("update public.projects set slug='renamed-proofs' where user_id=$1 and slug='proofs'",[owner]);
 assert.deepEqual(await create(input,renamed.operationId),renamed,'a renamed path cannot strand an acknowledged creation');
 await q("update public.projects set slug='proofs' where user_id=$1 and slug='renamed-proofs'",[owner]);
 const undoable=await create();
 await q('select public.undo_action($1,$2,false)',[owner,undoable.actionNo]);
 assert.equal((await one('select count(*)::int n from public.notes where id=$1',[undoable.noteId])).n,0);
 assert.equal((await create(input,undoable.operationId)).status,'conflict','retry after Undo cannot recreate deleted content');
 const countBefore=(await one('select count(*)::int n from public.notes')).n;
 await db.exec('reset role');
 await db.exec(`create function public.test_reject_card() returns trigger language plpgsql as $$begin raise exception 'fixture card failure';end$$;
  create trigger test_reject_card before insert on public.cards for each row execute function public.test_reject_card();`);
 await as(owner);const retry=randomUUID();
 await assert.rejects(create(input,retry),/fixture card failure/);
 assert.equal((await one('select count(*)::int n from public.notes')).n,countBefore,'card failure rolls back the note');
 assert.equal((await one('select count(*)::int n from public.command_receipts where operation_id=$1',[retry])).n,0);
 await db.exec('reset role');await db.exec('drop trigger test_reject_card on public.cards');
 await as(owner);assert.equal((await create(input,retry)).status,'ok','same operation retries a rolled-back transaction');
 await as(other);await assert.rejects(create(),/Project not found for owner/);
 await as(owner,'service_role');await assert.rejects(create(),/permission denied/);
 await as(owner,'anon');await assert.rejects(create(),/permission denied/);
 console.log('N239 atomic note creation: variants, owner isolation, lost acknowledgement, history, rollback and Undo pass');
}finally{await db.close();}
