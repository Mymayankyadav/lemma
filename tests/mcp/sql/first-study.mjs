// Exercise the shipped functions against the complete release-candidate migration stack.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
const one=async(sql,args=[]) => (await q(sql,args))[0];
const alpha=randomUUID(),beta=randomUUID();
let actor;
const auth=async uid=>{
 actor=uid;
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[uid]);
 await db.exec('set role authenticated');
};
const create=async(id,path,front='Question',back='Answer')=>(await one(
 'select public.create_first_study_card($1,$2,$3,$4,$5) as receipt',[id,actor,JSON.stringify(path),front,back])).receipt;
const grade=async input=>(await one('select public.grade_study_run_item($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as receipt',input)).receipt;
const path={kind:'new',title:'First path'};
try{
 await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(repeat('00',n),'hex') $$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 const dir=process.env.N195_TEST_MIGRATIONS||fileURLToPath(new URL('../../../supabase/migrations/',import.meta.url));
 for(const file of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort())
  await db.exec(await readFile(join(dir,file),'utf8'));
 for(const uid of [alpha,beta]){
  await q('insert into auth.users(id) values($1)',[uid]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[uid,uid.replaceAll('-','').repeat(2).slice(0,48)]);
 }
 const op=randomUUID();
 await auth(alpha);
 assert.equal((await one('select public.lemma_plan_released() as released')).released,false);
 await assert.rejects(create(op,path),{code:'55000'});
 await db.exec('reset role');
 // The release owner supplies this reviewed capability. Simulate its on state only inside this disposable database.
 await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select true'");
 await db.exec(`create function public.stop_test_receipt() returns trigger language plpgsql as $$
   begin if current_setting('test.drop_receipt',true)='on' then raise exception 'Fixture receipt failure'; end if;
   return new; end $$;
   create trigger drop_test_receipt before insert on public.command_receipts for each row execute function public.stop_test_receipt();`);
 await auth(alpha);
 await db.exec("set test.drop_receipt='on'");
 await assert.rejects(create(op,path),/Fixture receipt failure/);
 assert.equal((await one("select count(*)::int as n from public.projects where not system")).n,0);
 assert.equal((await one('select count(*)::int as n from public.notes')).n,0);
 await db.exec("set test.drop_receipt='off'");
 const first=await create(op,path);
 assert.equal(first.status,'applied');
 assert.deepEqual(await create(op,path),first);
 assert.equal((await create(op,path,'Different')).status,'conflict');
 assert.equal((await create(randomUUID(),path)).reason,'library_changed');
 const note=await one('select project_id,front,back from public.notes where id=$1',[first.noteId]);
 assert.deepEqual(note,{project_id:first.projectId,front:'Question',back:'Answer'});
 assert.equal((await one('select count(*)::int as n from public.cards where note_id=$1',[first.noteId])).n,1);
 const receipt=await one('select result from public.command_receipts where operation_id=$1',[op]);
 assert.ok(!JSON.stringify(receipt).includes('Question'));
 assert.ok(!JSON.stringify(receipt).includes('Answer'));
 assert.equal((await one('select no from public.actions where no=$1',[first.actionNo])).no,first.actionNo);
 await auth(beta);
 await assert.rejects(q('select public.create_first_study_card($1,$2,$3,$4,$5)',[randomUUID(),alpha,JSON.stringify(path),'Q','A']),{code:'42501'});
 await assert.rejects(create(op,{kind:'existing',id:first.projectId,slug:first.projectSlug}),{code:'P0002'});
 await db.exec('reset role');
 const bpath=await one("insert into public.projects(user_id,slug,title) values($1,'existing','Existing') returning id,slug",[beta]);
 await auth(beta);
 assert.equal((await create(randomUUID(),{kind:'existing',...bpath})).projectId,bpath.id);
 await auth(alpha);
 // An unrelated eligible card must never enter the single-card snapshot.
 const other=await one("insert into public.notes(user_id,project_id,front,back) values($1,$2,'Other','Other answer') returning id",[alpha,first.projectId]);
 await q('insert into public.cards(user_id,note_id,ord) values($1,$2,1)',[alpha,other.id]);
 const start=await one('select public.review_runs_command($1::jsonb) as receipt',[JSON.stringify({
  schemaVersion:1,resource:'review_runs',operation:'start',operationId:randomUUID(),patch:{
   filters:{cardId:first.cardId},selected_deck_ids:[],card_budget:1,minute_budget:1,scheduler_version:'fsrs-v6',settings_version:1,
  },
 })]);
 const run=start.receipt.changed.find(row=>row.resource==='review_runs');
 const items=await q('select id,card_id,expected_card_version from public.review_run_items where run_id=$1',[run.id]);
 assert.equal(items.length,1);assert.equal(items[0].card_id,first.cardId);
 const now=new Date(),tomorrow=new Date(now.getTime()+86_400_000);
 const next={state:2,due:tomorrow.toISOString(),stability:1,difficulty:5,last_review:now.toISOString(),step:0,reps:1,lapses:0};
 const input=[randomUUID(),run.id,items[0].id,first.cardId,run.version,items[0].expected_card_version,3,'sure',1530,JSON.stringify(next)];
 await db.exec("set test.drop_receipt='on'");
 await assert.rejects(grade(input),/Fixture receipt failure/);
 assert.equal((await one('select count(*)::int as n from public.reviews')).n,0);
 assert.equal((await one('select reps from public.cards where id=$1',[first.cardId])).reps,0);
 assert.equal((await one('select position from public.review_runs where id=$1',[run.id])).position,0);
 await db.exec("set test.drop_receipt='off'");
 const graded=await grade(input); // The client discards this acknowledgement and replays the original payload.
 assert.equal(graded.status,'applied');assert.deepEqual(await grade(input),graded);
 assert.equal((await grade([...input.slice(0,6),2,...input.slice(7)])).status,'conflict');
 assert.equal((await grade([randomUUID(),...input.slice(1)])).reason,'review_changed');
 assert.equal((await one('select count(*)::int as n from public.reviews')).n,1);
 assert.equal((await one('select reps from public.cards where id=$1',[first.cardId])).reps,1);
 assert.deepEqual(await one('select position,status from public.review_runs where id=$1',[run.id]),{position:1,status:'exhausted'});
 assert.equal((await one('select review_id from public.review_run_items where id=$1',[items[0].id])).review_id,graded.reviewId);
 await auth(beta);
 await assert.rejects(grade(input),{code:'P0002'});
 console.log('PASS first card and grade: gate, rollback, scope, duplicate/lost acknowledgement, conflicts, owner isolation, single schedule and run advance');
}finally{await db.close();}
