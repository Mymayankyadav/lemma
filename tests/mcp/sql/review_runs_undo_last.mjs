// bug #1299 (N119): undo the last graded answer of a durable review run in isolated PGlite.
// The answer's schedule is restored by undo_review and the run steps back to that item, atomically;
// retries reuse the receipt; stale versions, other owners, service_role and wrong items are refused.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const uid=()=>randomUUID();
const checkEqual=(actual,expected,why)=>{
  const where=new Error().stack?.split('\n')[2]||'';
  const line=where.match(/:(\d+):\d+\)?$/)?.[1]||'unknown';
  return assert.equal(actual,expected,why??('UNDO_LAST_ASSERT_LINE_'+line));
};
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const as=async(id,role='authenticated')=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role '+role);
};
const cmd=async(operation,patch={},target={},expectedVersion,operationId=uid())=>{
  const envelope={schemaVersion:1,resource:'review_runs',operationId,operation,
    target,patch,...(expectedVersion===undefined?{}:{expectedVersion})};
  return (await q('select public.review_runs_command($1::jsonb) as receipt',[JSON.stringify(envelope)]))[0].receipt;
};
const undoEnvelope=(runId,version,itemId,operationId=uid())=>({schemaVersion:1,resource:'review_runs',
  operation:'undo_last',operationId,target:{id:runId},expectedVersion:version,patch:{item_id:itemId}});
const undo=async(envelope)=>(await q('select public.review_runs_undo_last($1::jsonb) as receipt',
  [JSON.stringify(envelope)]))[0].receipt;
const prev=JSON.stringify({state:0,due:'2026-11-01T00:00:00Z',stability:0,difficulty:0,last_review:null,step:0,reps:0,lapses:0});
try {
  await db.exec([
    'create role anon; create role authenticated; create role service_role;',
    'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
    "create function auth.uid() returns uuid language sql as $a$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $a$;",
    "create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$ select decode(repeat('00',n),'hex') $b$;",
    'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
  ].join('\n'));
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
  assert.ok(files.includes('20261209100000_review_runs_undo_last.sql'));
  for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
  await q('insert into auth.users(id) values($1),($2)',[owner,other]);
  for(const [id,secret] of [[owner,'a'.repeat(48)],[other,'b'.repeat(48)]])
    await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[id,secret]);
  const subject=(await q("insert into public.subjects(user_id,name,glyph,hue) values($1,'Undo','☆','amber') returning id",[owner]))[0].id;
  const project=(await q("insert into public.projects(user_id,subject_id,slug,title,goal,status) values($1,$2,'undo','Undo','Review','active') returning id",[owner,subject]))[0].id;
  const cards=[];
  for(let i=0;i<2;i++){
    const note=(await q("insert into public.notes(user_id,project_id,front,back) values($1,$2,$3,'A') returning id",[owner,project,'Q'+i]))[0].id;
    cards.push((await q('insert into public.cards(user_id,note_id,ord) values($1,$2,1) returning id',[owner,note]))[0].id);
  }
  // Grade through the card/review path the app uses: a review row with the card's previous state, then the card update.
  async function grade(cardId){
    await db.exec('reset role');
    const id=(await q("insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) values($1,$2,3,0,1000,$3::jsonb) returning id",
      [owner,cardId,prev]))[0].id;
    await q('update public.cards set reps=reps+1,state=2 where id=$1',[cardId]);
    await as(owner);
    return id;
  }
  await as(owner);
  const startPatch={filters:{includeNew:true},selected_deck_ids:['project:undo'],card_budget:5,
    minute_budget:5,scheduler_version:'fsrs-5',settings_version:1};
  const started=await cmd('start',startPatch);
  checkEqual(started.itemCount,2);
  const runId=started.run.id;
  const items=await q('select * from public.review_run_items where run_id=$1 order by position',[runId]);
  // Nothing to undo before the first answer.
  await assert.rejects(undo(undoEnvelope(runId,started.run.version,items[0].id)),/No answer to undo/);
  const review=await grade(items[0].card_id);
  const advanced=await cmd('advance',{kind:'graded',item_id:items[0].id,review_id:String(review)},{id:runId},started.run.version);
  checkEqual(advanced.run.position,1);
  // Only the last graded item, at the current version.
  await assert.rejects(undo(undoEnvelope(runId,advanced.run.version,items[1].id)),/Only the last graded item/);
  const stale=await undo(undoEnvelope(runId,advanced.run.version+1,items[0].id));
  checkEqual(stale.status,'conflict','stale expectedVersion is a conflict receipt, not a write');
  checkEqual((await q('select position from public.review_runs where id=$1',[runId]))[0].position,1);
  // Another owner cannot see or undo the run.
  await as(other);
  await assert.rejects(undo(undoEnvelope(runId,advanced.run.version,items[0].id)),/not found/i);
  // service_role is not granted this app-only command.
  await as(owner,'service_role');
  await assert.rejects(undo(undoEnvelope(runId,advanced.run.version,items[0].id)),/permission denied/i);
  await as(owner);
  const envelope=undoEnvelope(runId,advanced.run.version,items[0].id);
  const undone=await undo(envelope);
  checkEqual(undone.status,'ok');assert.ok(undone.actionNo);
  checkEqual(undone.run.position,0);checkEqual(undone.run.status,'running');
  checkEqual(undone.item.state,'pending');checkEqual(undone.item.review_id,null);
  await db.exec('reset role');
  assert.ok((await q('select undone_at from public.reviews where id=$1',[review]))[0].undone_at,'the answer is undone');
  const card=(await q('select state,reps from public.cards where id=$1',[items[0].card_id]))[0];
  checkEqual(card.state,0,'the card schedule is restored');checkEqual(card.reps,0);
  await as(owner);
  // Exact retry returns the same receipt; a changed payload under the same operationId conflicts.
  assert.deepEqual(await undo(envelope),undone);
  const reused=await undo({...envelope,expectedVersion:undone.run.version});
  checkEqual(reused.status,'conflict');
  // The item can be graded again, and the run finishes; undo then reopens the exhausted run.
  const regrade=await grade(items[0].card_id);
  const again=await cmd('advance',{kind:'graded',item_id:items[0].id,review_id:String(regrade)},{id:runId},undone.run.version);
  const last=await grade(items[1].card_id);
  const finished=await cmd('advance',{kind:'graded',item_id:items[1].id,review_id:String(last)},{id:runId},again.run.version);
  checkEqual(finished.run.status,'exhausted');
  const reopened=await undo(undoEnvelope(runId,finished.run.version,items[1].id));
  checkEqual(reopened.run.status,'running');checkEqual(reopened.run.position,1);checkEqual(reopened.run.ended_at,null);
  // An answer that is no longer the card's newest cannot be undone through the run.
  const newer=await grade(items[0].card_id);
  assert.ok(newer);
  const back=await q('select position from public.review_runs where id=$1',[runId]);
  checkEqual(back[0].position,1);
  console.log('PASS bug #1299 review run undo: restore, retry, conflict, owner, role, exhausted');
} finally { await db.close(); }
