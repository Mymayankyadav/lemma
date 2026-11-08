// N92: full-migration owner versions, citations and withdrawal acceptance.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const subject='33333333-3333-4333-8333-333333333333';
const project='44444444-4444-4444-8444-444444444444';
const note='55555555-5555-4555-8555-555555555555';
const source='66666666-6666-4666-8666-666666666666';
const foreignSource='77777777-7777-4777-8777-777777777777';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const as=async(id)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
const admin=async()=>{await db.exec('reset role');await q("select set_config('test.uid','',false)")};
const call=async(name,args=[])=>(
 await q('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)
)[0].result;
const row=async id=>(await q('select * from public.proposals where id=$1',[id]))[0];
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
 "create schema auth;create schema extensions;create table auth.users(id uuid primary key);");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$"+
 " select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,"+
 "nullif(current_setting('test.uid',true),'')::uuid) $auth$;");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$"+
 " select decode(repeat('00',n),'hex') $bytes$;");
 await db.exec('grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;');
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.includes('20261116190000_proposal_versions.sql'));
 for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [owner,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
  [other,'b'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','amber')",[subject,owner]);
 await q("insert into public.projects(id,user_id,slug,subject_id,title,goal) values($1,$2,'math',$3,'Math','Practice')",[project,owner,subject]);
 const foreignSubject='88888888-8888-4888-8888-888888888888';
 const foreignProject='99999999-9999-4999-8999-999999999999';
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Other','O','rose')",[foreignSubject,other]);
 await q("insert into public.projects(id,user_id,slug,subject_id,title,goal) values($1,$2,'other',$3,'Other','Practice')",[foreignProject,other,foreignSubject]);
 await q("insert into public.sources(id,user_id,project_id,title,short,status) values($1,$2,$3,'Book','book','ready')",
   [source,owner,project]);
 await q("insert into public.sources(id,user_id,project_id,title,short,status) values($1,$2,$3,'Other Book','other','ready')",
   [foreignSource,other,foreignProject]);
 await q("insert into public.notes(id,user_id,project_id,front,back) values($1,$2,$3,'Original question','Original answer')",[note,owner,project]);
 const no=Number((await q('select no from public.notes where id=$1',[note]))[0].no);
 const beforeNote=(await q('select version from public.notes where id=$1',[note]))[0].version;
 const insertProposal=async(payload={note_no:no,front:'Updated question'},kind='card_edit')=>
  (await q("insert into public.proposals(user_id,project_id,kind,payload,origin)"+
   " values($1,$2,$3,$4::jsonb,'chatgpt') returning id",
   [owner,project,kind,JSON.stringify(payload)]))[0].id;
 const p1=await insertProposal();
 await as(owner);
 // Existing invoker approval must remain callable and metadata-free.
 const validVersions={notes:{[note]:beforeNote}};
 const staleVersions={notes:{[note]:beforeNote+1}};
 await assert.rejects(
  q('select public.approve_proposal($1,$2::jsonb)',[p1,JSON.stringify({expected_versions:staleVersions})]),
  /target changed|unavailable/i);
 assert.equal((await row(p1)).status,'pending');
 assert.equal((await q('select front from public.notes where id=$1',[note]))[0].front,'Original question');
 const approved=(await q('select public.approve_proposal($1,$2::jsonb) result',
  [p1,JSON.stringify({expected_versions:validVersions})]))[0].result;
 assert.equal(approved.note_no,no);
 assert.equal((await row(p1)).status,'approved');
 assert.equal((await q('select front from public.notes where id=$1',[note]))[0].front,'Updated question');

 await admin();
 const p2=await insertProposal({note_no:no,back:'Legacy approval still works'});
 await as(owner);
 await q("update public.notes set front='Bumped since proposal was created' where id=$1",[note]);
 const legacy=(await q('select public.approve_proposal($1) result',[p2]))[0].result;
 assert.equal(legacy.note_no,no,'legacy approval needs no expectedVersions');
 assert.equal((await q('select back from public.notes where id=$1',[note]))[0].back,'Legacy approval still works');

 await admin();
 const p3=await insertProposal();
 await as(owner);
 const withdrawn=await call('withdraw_proposal',[p3]);
 assert.equal(withdrawn.id,p3);
 assert.equal((await row(p3)).status,'pending','withdrawn proposals remain historical pending');
 assert.ok((await row(p3)).withdrawn_at);
 await assert.rejects(q('select public.approve_proposal($1)',[p3]),/not active and pending/);
 const reopened=await call('reopen_proposal',[p3]);
 assert.equal(reopened.status,'pending');
 assert.equal((await row(p3)).withdrawn_at,null);
 const closedAgain=await call('withdraw_proposal',[p3]);
 assert.ok(closedAgain.withdrawnAt);
 await assert.rejects(call('withdraw_proposal',[p3]),/active pending/);

 const baseVersion=(await q('select version from public.notes where id=$1',[note]))[0].version;
 const citations=[{source,version:1,page:'p. 4'}];
 const base={notes:{[note]:baseVersion}};
 const revision=(await q('select public.revise_proposal($1,$2::jsonb,$3::jsonb,$4::jsonb) result',[
  p3,JSON.stringify({note_no:no,front:'Revised question'}),
  JSON.stringify(citations),JSON.stringify(base)]))[0].result;
 const successor=await row(revision.id);
 assert.equal(successor.revised_from,p3);
 assert.equal(successor.payload_version,2);
 assert.equal(successor.group_id,p3);
 assert.deepEqual(successor.citations,citations);
 assert.deepEqual(successor.base_target_versions,base);
 assert.ok((await row(p3)).withdrawn_at,'revised predecessor is withdrawn atomically');
 await assert.rejects(call('reopen_proposal',[p3]),/supersedes/);
 await assert.rejects(q('select public.revise_proposal($1,$2::jsonb)',[p3,
   JSON.stringify({note_no:no,front:'duplicate successor'})]),/already has a revision/);
 await q("update public.notes set front='Concurrent edit' where id=$1",[note]);
 await assert.rejects(q('select public.approve_proposal($1)',[successor.id]),
  /target changed|unavailable/,'stored expected snapshot blocks stale approval');
 assert.equal((await row(successor.id)).status,'pending');

 await admin();
 const p4=await insertProposal();
 await as(owner);
 const badSource=[{source:foreignSource,version:1,page:'p. 7'}];
 await assert.rejects(q('select public.revise_proposal($1,$2::jsonb,$3::jsonb)',[
  p4,JSON.stringify({note_no:no,front:'Untrusted'}),JSON.stringify(badSource)]),
  /Citation source changed|owner-visible/);
 assert.equal((await row(p4)).withdrawn_at,null);
 await assert.rejects(q('select public.revise_proposal($1,$2::jsonb,$3::jsonb)',[
  p4,JSON.stringify({note_no:no,front:'Stale'}),JSON.stringify([{source,version:999,page:'p. 8'}])]),
  /Citation source changed|owner-visible/);
 await assert.rejects(q("update public.proposals set withdrawn_at=now() where id=$1",[p4]),
  /authorized command/,'owner DML cannot forge new command metadata');
 await assert.rejects(q("update public.proposals set payload_version=99 where id=$1",[p4]),
  /authorized command/);
 await assert.rejects(q("select public.revise_proposal($1,'{}'::jsonb)",[successor.id]),
  /target changed|unavailable/,'expected versions also validated before revision');
 // Incident #1149: a revision that has already been APPROVED still
 // supersedes its parent permanently; otherwise both cards are created.
 await admin();
 const originalCardProposal=await insertProposal({
  front:'Which metric is complete?',back:'The norm',type:'basic',kind:'definition'},'card');
 await as(owner);
 const revisedCard=(await q('select public.revise_proposal($1,$2::jsonb) result',[
  originalCardProposal,JSON.stringify({
   front:'Which measure is complete?',back:'The norm',type:'basic',kind:'definition'})
 ]) )[0].result;
 const notesBefore=(await q('select count(*)::int count from public.notes where user_id=$1',[owner]))[0].count;
 const appliedRevision=(await q('select public.approve_proposal($1) result',[revisedCard.id]))[0].result;
 assert.ok(appliedRevision.note_no,'approved revision has an actual card effect');
 assert.equal((await row(revisedCard.id)).status,'approved');
 const notesAfter=(await q('select count(*)::int count from public.notes where user_id=$1',[owner]))[0].count;
 assert.equal(notesAfter,notesBefore+1,'approved successor creates one note');
 await assert.rejects(call('reopen_proposal',[originalCardProposal]),
  /supersedes/,'approved successor must permanently supersede parent');
 await assert.rejects(q('select public.approve_proposal($1)',[originalCardProposal]),
  /not active and pending/,'withdrawn parent cannot apply again');
 assert.ok((await row(originalCardProposal)).withdrawn_at);
 assert.equal((await q('select count(*)::int count from public.notes where user_id=$1',[owner]))[0].count,
  notesBefore+1,'reopen and double approval must never create a second note');
 // Conservative lineage rule also blocks reopening after the successor is
 // itself withdrawn or rejected; an unrelated withdrawn proposal still reopens.
 await admin();
 const rejectedParent=await insertProposal({
  front:'Question 1',back:'Answer 1',type:'basic'},'card');
 await as(owner);
 const rejectedChild=(await q('select public.revise_proposal($1,$2::jsonb) result',[
  rejectedParent,JSON.stringify({front:'Question 2',back:'Answer 2',type:'basic'})
 ]))[0].result;
 await q('select public.reject_proposal($1)',[rejectedChild.id]);
 await assert.rejects(call('reopen_proposal',[rejectedParent]),/supersedes/);

 await as(other);
 await assert.rejects(q('select public.withdraw_proposal($1)',[p4]),/not found for owner/);
 await assert.rejects(q('select public.reopen_proposal($1)',[p3]),/not found for owner/);
 await assert.rejects(q("select public.revise_proposal($1,'{}'::jsonb)",[p4]),/not found for owner/);
 await db.exec('reset role');
 const changed=(await q("select count(*)::int total from public.action_changes where table_name='proposals'"))[0].total;
 assert.ok(changed>=7,'all withdrawn/revised/reopened writes are audited');
 const cols=(await q("select attname from pg_attribute where attrelid='public.proposals'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname);
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/proposals.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(doc.columns).sort(),cols.sort(),'all N92 columns have ownership rules');
 console.log('PASS N92 proposal lineage, citations, stale approval, legacy compatibility, owner guards');
}finally{await db.close()}
