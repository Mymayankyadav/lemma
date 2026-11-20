// The CI Postgres service runs each race on two physical connections in a fresh database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {openN191Postgres} from './fixtures/n191-pg-fixture.mjs';

const db=process.env.NOTIF_TEST_DATABASE_URL ? await openN191Postgres(process.env.NOTIF_TEST_DATABASE_URL) :
 new (await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')).PGlite();
const owner=randomUUID(),other=randomUUID(),slug='tutor-fixture',objective='Distinguish necessity and sufficiency.';
let checkpoint,otherCheckpoint;
const q=async (sql,params=[],connection=db)=>(await connection.query(sql,params)).rows;
const one=async (sql,params=[],c=db)=>(await q(sql,params,c))[0].result;
async function as(role,uid='',c=db) {
 await c.query('reset role');
 await c.query("select set_config('test.uid',$1,false)",[uid]);
 if(role)await c.query('set role '+role);
}
const ownerCmd=(command,c=db,cp=checkpoint,id=owner)=>one('select public.tutor_owner_command($1,$2,$3,$4::jsonb) result',
 [id,slug,cp,JSON.stringify(command)],c);
const state=(id=owner,cp=checkpoint,before=null)=>one('select public.tutor_thread_state($1,$2,$3,$4) result',[id,slug,cp,before]);
const hostCmd=(hash,command,c=db)=>one('select public.tutor_grant_command($1,$2::jsonb) result',[hash,JSON.stringify(command)],c);
const cmd=(operation,fields)=>({operation,operationId:randomUUID(),...fields});
const denied=(promise,code='42501')=>assert.rejects(promise,error=>error.code===code);
const hash='a'.repeat(64),altHash='b'.repeat(64);
const firstQuestion=cmd('start',{expectedVersion:0,question:'Show the converse.',objective,localExcerpt:'  ∀ x: x=x\n'});
let turnId=firstQuestion.operationId;
const tableNames=['tutor_release_controls','tutor_threads','tutor_turns','tutor_grants','tutor_grant_credentials','tutor_attempts',
 'tutor_replies','tutor_suggestions','tutor_recovered_replies'];

try {
 for(const role of ['anon','authenticated','service_role']){
  if(!(await q('select 1 from pg_roles where rolname=$1',[role])).length)await db.exec('create role '+role);
 }
 await db.exec(`create schema auth; create schema extensions; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $a$ select coalesce(
    nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid) $a$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$ select decode(repeat('00',n),'hex') $b$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(name=>name.endsWith('.sql')&&!name.includes('_storage')).sort();
 // --include-all can install this migration after the previously deployed, future-dated chain.
 if(process.env.N193_TEST_MIGRATION_LAST==='1'){
  const index=names.findIndex(name=>name.endsWith('_n193_tutor_threads.sql'));
  names.push(...names.splice(index,1));
 }
 for(const name of names){
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 }
 await q('insert into auth.users(id) values ($1),($2)',[owner,other]);
 async function seed(id){
  const project=await one("insert into public.projects(user_id,slug,title,goal,status) values($1,$2,'Logic','Review','active') returning id result",[id,slug]);
  return one("insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,'CP1',1,'Logic',$3,'Explain',jsonb_build_array('Explain the proof')) returning id result",[id,project,objective]);
 }
 checkpoint=await seed(owner);otherCheckpoint=await seed(other);
 const sourceId=await one("insert into public.sources(user_id,project_id,title,short,status) select $1,project_id,'Logic reader','Logic','ready' from public.checkpoints where id=$2 returning id result",[owner,checkpoint]);
 await q("insert into public.source_pages(user_id,source_id,page,body) values($1,$2,1,'A selected passage.'),($1,$2,2,'Unselected page.')",[owner,sourceId]);
 await q('update public.checkpoints set source_id=$1 where id=$2',[sourceId,checkpoint]);
 for(const table of tableNames){
  const [row]=await q(`select relrowsecurity rls,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') authed,
    has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') anon,
    has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') service from pg_class where oid=$1::regclass`,['public.'+table]);
  assert.deepEqual(row,{rls:true,authed:false,anon:false,service:false},table);
  if(!['tutor_release_controls','tutor_grant_credentials'].includes(table))
   assert.equal(await one("select count(*)::int result from pg_trigger where tgrelid=$1::regclass and tgname='lemma_account_delete_write_guard'",['public.'+table]),1);
 }
 await as('anon');await denied(state());await denied(ownerCmd(firstQuestion));await denied(hostCmd(hash,{operation:'get',turnId}));
 await as('authenticated',other);await denied(state());await denied(ownerCmd(firstQuestion));
 assert.deepEqual((await state(other,otherCheckpoint)).turns,[]);await denied(state(other,checkpoint));
 await as('authenticated',owner);await denied(state(owner,otherCheckpoint));await denied(hostCmd(hash,{operation:'get',turnId}));
 assert.equal((await state()).canSubmit,false);assert.equal((await state()).head.lastSequence,0);
 await as();await db.exec("insert into public.tutor_release_controls values('manual',true),('mcp',true)");
 await as('authenticated',owner);await denied(ownerCmd(firstQuestion),'55000');
 // Repeat the cutover in this disposable database only. The production writer stays fail-closed.
 await as();await db.exec(`create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select true';
  grant insert on public.command_receipts to authenticated;`);
 await as('authenticated',owner);await denied(ownerCmd(firstQuestion),'55000');assert.equal((await state()).head.lastSequence,0);
 await as();await db.exec(`revoke insert,update,delete,truncate on public.command_receipts from public,anon,authenticated;
  alter table public.command_receipts add column if not exists trusted_writer_version smallint;`);
 await as('authenticated',owner);
 const source=await one('select public.tutor_source_preview($1,$2,$3,$4) result',[owner,slug,checkpoint,1]);
 assert.deepEqual(source,{kind:'source',refId:sourceId,version:'1',page:1,excerpt:'A selected passage.'});
 firstQuestion.source=source;
 await denied(ownerCmd({...firstQuestion,source:{...source,excerpt:'Unapproved page text.'}}),'40001');
 await denied(ownerCmd({...firstQuestion,localExcerpt:'😀'.repeat(601)}),'22023');
 await denied(ownerCmd({...firstQuestion,objective:'Unreviewed changes'}),'40001');
 await denied(ownerCmd({...firstQuestion,account:other}),'22023');
 const first=await ownerCmd(firstQuestion);assert.equal(first.status,'submitted');turnId=first.turnId;
 await as('authenticated',other);
 const unrelated=await ownerCmd({operation:'start',operationId:firstQuestion.operationId,question:'Other owner',expectedVersion:0},db,otherCheckpoint,other);
 assert.equal(unrelated.status,'submitted');assert.notEqual(unrelated.turnId,turnId);
 await as('authenticated',owner);
 assert.deepEqual(await ownerCmd(firstQuestion),first);
 assert.equal((await ownerCmd({...firstQuestion,question:'Changed question'})).status,'conflict');
 assert.equal((await ownerCmd(cmd('start',{expectedVersion:1,question:'Second active turn'}))).status,'turn-pending');
 const current=await state();assert.equal(current.head.pendingTurnId,turnId);
 assert.equal(current.turns[0].snapshot.localExcerpt.text,firstQuestion.localExcerpt);
 const [context]=current.turns[0].snapshot.selectedContext;
 assert.deepEqual(context,{kind:'checkpoint',refId:checkpoint,version:'2',excerpt:objective});
 const grant=cmd('grant',{turnId,expectedVersion:1,tokenHash:hash});
 assert.equal((await ownerCmd(grant)).status,'granted');
 await ownerCmd(cmd('grant',{turnId,expectedVersion:1,tokenHash:altHash}));
 await as('service_role');await denied(state());await denied(ownerCmd(firstQuestion));
 assert.equal(await one('select public.tutor_grant_active($1) result',[hash]),true);
 await denied(hostCmd(hash,{operation:'get',turnId:randomUUID()}));
 assert.deepEqual((await hostCmd(hash,{operation:'get',turnId})).snapshot,current.turns[0].snapshot);
 await denied(hostCmd(hash,cmd('approve',{turnId})));
 const claim=cmd('claim',{turnId,expectedVersion:1}),firstClaim=await hostCmd(hash,claim);
 assert.deepEqual(await hostCmd(hash,claim),firstClaim);
 const lease=Date.parse(firstClaim.leaseUntil)-Date.now();assert.ok(lease>280000 && lease<=301000);
 const leased={turnId,claimId:firstClaim.claimId,generation:firstClaim.generation};
 await denied(hostCmd(altHash,cmd('claim',{turnId,expectedVersion:2})),'40001');
 await denied(hostCmd(altHash,cmd('renew',leased)));
 const renewal=cmd('renew',leased);const renewed=await hostCmd(hash,renewal);
 assert.equal(renewed.status,'renewed');assert.deepEqual(await hostCmd(hash,renewal),renewed);
 await as();await q("update public.tutor_attempts set lease_until=clock_timestamp()-interval '1 minute' where id=$1",[firstClaim.claimId]);
 await as('service_role');await denied(hostCmd(hash,claim));await denied(hostCmd(hash,renewal));
 const takeover=await hostCmd(altHash,cmd('claim',{turnId,expectedVersion:2}));
 const nextLease={turnId,claimId:takeover.claimId,generation:takeover.generation};
 assert.equal(takeover.generation,firstClaim.generation+1);
 await denied(hostCmd(hash,cmd('reply',{...leased,expectedVersion:3,messageId:randomUUID(),body:'Stale reply.'})));
 const citation={kind:'checkpoint',refId:checkpoint,version:'2'};
 const sourceCitation={kind:'source',refId:sourceId,page:1,version:'1'};
 const card={kind:'card',front:'Is the converse true?',back:'It requires proof.',summary:'Review the converse.'};
 const final=cmd('reply',{...nextLease,expectedVersion:3,messageId:randomUUID(),body:'Tutor reply.',
  reportedHost:'Example host',citations:[citation,sourceCitation],suggestions:[card,{kind:'change',summary:'Clarify the objective.',objective:'Prove the converse.',version:2},
   {kind:'plan',summary:'A follow-up checkpoint.',checkpoints:[{title:'Converse',objective:'Test a claim.',criterion:'Give a counterexample.',steps:['Identify the claim.']}]}]});
 await denied(hostCmd(altHash,{...final,citations:[{...citation,refId:otherCheckpoint}]}),'22023');
 await denied(hostCmd(altHash,{...final,citations:[{...sourceCitation,page:2}]}),'22023');
 await denied(hostCmd(altHash,{...final,suggestions:[{...card,approve:true}]}),'22023');
 const manual=cmd('manual',{turnId,expectedVersion:3,messageId:randomUUID(),body:'Manual reply drafted concurrently.'});
 // Hold the winning transaction open while the other backend reaches its advisory lock.
 async function race(hostFirst,remote,local,token){
  const remoteActor=async c=>{await as('service_role','',c);return hostCmd(token,remote,c)};
  const appActor=async c=>{await as('authenticated',owner,c);return ownerCmd(local,c)};
  const [win,lose]=hostFirst?[remoteActor,appActor]:[appActor,remoteActor];
  if(!db.native)return [await win(db),await lose(db)];
  const ready=Promise.withResolvers(),release=Promise.withResolvers(),pid=Promise.withResolvers();
  const winner=db.transaction(async c=>{const result=await win(c);ready.resolve();await release.promise;return result});
  winner.catch(ready.reject);await ready.promise;
  const loser=db.transaction(async c=>{pid.resolve(await one('select pg_backend_pid() result',[],c));return lose(c)});
  loser.catch(pid.reject);
  try {await db.waitForBlockedLock(await pid.promise)}finally{release.resolve()}
  return Promise.all([winner,loser]);
 }
 const [won,lost]=await race(true,final,manual,altHash);assert.equal(won.status,'completed');assert.equal(lost.status,'already-completed');
 await as('service_role');assert.deepEqual(await hostCmd(altHash,final),won);
 await denied(hostCmd(altHash,{...final,operationId:randomUUID(),body:'Another final'}),'40001');
 await as('authenticated',owner);assert.deepEqual(await ownerCmd(manual),lost);
 let view=await state();const saved=view.turns[0].finalReply;
 assert.deepEqual(saved.citations,[citation,sourceCitation]);assert.equal(saved.provenance.reportedHost,'Example host');assert.equal(saved.provenance.kind,'connector');assert.equal(saved.provenance.hostVerified,false);
 assert.equal(view.recoveredDrafts[0].body,manual.body);assert.equal(view.recoveredDrafts[0].messageId,manual.messageId);assert.equal(view.head.pendingTurnId,null);
 assert.equal(saved.suggestions.length,3);
 const proposed=saved.suggestions.find(s=>s.kind==='card');assert.equal(proposed.status,'pending');
 await as();assert.equal(await one('select count(*)::int result from public.cards'),0);
 assert.equal(await one('select count(*)::int result from public.checkpoints where user_id=$1',[owner]),1);
 assert.equal(await one('select count(*)::int result from public.tutor_replies'),1);
 const receipts=await one("select jsonb_agg(result) result from public.command_receipts where resource='tutor'");
 for(const privateText of [firstQuestion.question,final.body,manual.body,card.front,hash,altHash])
  assert.ok(!JSON.stringify(receipts).includes(privateText),'Private content absent from receipts');
 await as('authenticated',other);
 await assert.rejects(one('select public.approve_proposal($1) result',[proposed.proposalId]));
 await as('authenticated',owner);
 await one('select public.approve_proposal($1) result',[proposed.proposalId]);
 assert.equal((await state()).turns[0].finalReply.suggestions.find(s=>s.kind==='card').status,'approved');
 await as();assert.equal(await one('select count(*)::int result from public.cards'),1);
 const second=cmd('start',{expectedVersion:1,question:'Identify a sufficient condition.'});
 await as('authenticated',owner);const secondId=(await ownerCmd(second)).turnId;
 const secondHash='c'.repeat(64);
 await ownerCmd(cmd('grant',{turnId:secondId,expectedVersion:1,tokenHash:secondHash}));
 await as('service_role');const secondClaim=await hostCmd(secondHash,cmd('claim',{turnId:secondId,expectedVersion:1}));
 const secondLocal=cmd('manual',{turnId:secondId,expectedVersion:2,messageId:randomUUID(),body:'Imported by the learner.'});
 const secondRemote=cmd('reply',{turnId:secondId,expectedVersion:2,generation:secondClaim.generation,claimId:secondClaim.claimId,
  messageId:randomUUID(),body:'Connector text from a losing reply.'});
 const [manualWin,hostLoss]=await race(false,secondRemote,secondLocal,secondHash);
 assert.equal(manualWin.status,'completed');assert.equal(hostLoss.status,'already-completed');
 await as('service_role');assert.deepEqual(await hostCmd(secondHash,secondRemote),hostLoss);
 await denied(hostCmd(secondHash,{...secondRemote,operationId:randomUUID()}),'40001');
 await as('authenticated',owner);view=await state();
 assert.equal(view.turns[1].finalReply.provenance.label,'Imported by you');assert.equal(view.recoveredDrafts.length,2);
 const suggested=cmd('suggest_card',{turnId:secondId,expectedVersion:manualWin.version,front:'Manual question',back:'Manual answer'});
 const manualSuggestion=await ownerCmd(suggested);assert.deepEqual(await ownerCmd(suggested),manualSuggestion);
 await one('select public.approve_proposal($1) result',[manualSuggestion.proposalId]);
 await as();assert.equal(await one('select count(*)::int result from public.cards'),2);
 await as('authenticated',owner);
 const plans=saved.suggestions.filter(s=>s.kind==='plan_change');
 for(const plan of plans)await one('select public.approve_proposal($1) result',[plan.proposalId]);
 await as();assert.equal(await one('select count(*)::int result from public.checkpoints where user_id=$1',[owner]),2);
 await as('authenticated',owner);const third=cmd('start',{expectedVersion:2,question:'A cancellable question.'});
 const thirdId=(await ownerCmd(third)).turnId,thirdHash='d'.repeat(64);
 const issued=await ownerCmd(cmd('grant',{turnId:thirdId,expectedVersion:1,tokenHash:thirdHash}));
 await as('service_role');const thirdCmd=cmd('claim',{turnId:thirdId,expectedVersion:1});await hostCmd(thirdHash,thirdCmd);
 await as('authenticated',owner);await ownerCmd(cmd('revoke',{turnId:thirdId,expectedVersion:2,grantId:issued.grantId}));
 await as('service_role');await denied(hostCmd(thirdHash,thirdCmd));
 assert.equal(await one('select public.tutor_grant_active($1) result',[thirdHash]),false);
 await as('authenticated',owner);const switched=await ownerCmd(cmd('switch',{turnId:thirdId,expectedVersion:2}));
 await ownerCmd(cmd('cancel',{turnId:thirdId,expectedVersion:switched.version}));
 assert.equal((await state()).turns.at(-1).status,'cancelled');
 assert.deepEqual((await state(owner,checkpoint,2)).turns.map(t=>t.id),[turnId]);
 const privateTables=['tutor_release_controls','tutor_grant_credentials'];
 const exportable=tableNames.filter(name=>!privateTables.includes(name));
 const expectedBodies=new Set([final.body,secondLocal.body]);
 const exportId=await one('select public.begin_owner_export() result');
 const tables=(await one('select public.owner_export_page($1) result',[exportId])).rows.map(r=>r.table_name);
 for(const name of exportable)assert.ok(tables.includes(name),name);
 for(const name of privateTables)assert.ok(!tables.includes(name),name);
 const exported=await one("select public.owner_export_page($1,'tutor_replies') result",[exportId]);
 assert.deepEqual(new Set(exported.rows.map(r=>r.body)),expectedBodies);
 const memberPage=(table,cursor=null)=>one('select public.lemma_export_page($1,$2,1) result',[table,cursor]);
 const servicePage=(id,table,cursor=null)=>one('select public.lemma_export_page_for($1,$2,$3,1) result',[id,table,cursor]);
 async function checkReplyPages(read){
  const first=await read('tutor_replies'),second=await read('tutor_replies',first.nextCursor);
  assert.deepEqual(new Set([...first.rows,...second.rows].map(r=>r.body)),expectedBodies);
  assert.equal((await read('tutor_replies',second.nextCursor)).rows.length,0);
  for(const name of privateTables)await assert.rejects(read(name),/not registered/i);
 }
 await checkReplyPages(memberPage);
 await as('authenticated',other);
 await assert.rejects(one("select public.owner_export_page($1,'tutor_replies') result",[exportId]));
 assert.deepEqual((await memberPage('tutor_replies')).rows,[]);
 await denied(servicePage(owner,'tutor_replies'));
 await as('service_role');
 await checkReplyPages((table,cursor)=>servicePage(owner,table,cursor));
 assert.deepEqual((await servicePage(other,'tutor_replies')).rows,[]);
 await as();
 assert.equal(await one('select count(*)::int result from public.lemma_undo_tables where table_name=any($1::text[])',[tableNames]),0);
 assert.equal(await one('select count(*)::int result from lemma_export_private.additional_tables where table_name=any($1::text[])',[exportable]),exportable.length);
 await as('authenticated',owner);const recovery=await ownerCmd(cmd('start',{expectedVersion:3,question:'Recover if transport disabled.'}));
 await as();await db.exec("update public.tutor_release_controls set enabled=false");
 await as('authenticated',owner);assert.equal((await state()).turns.length,4);
 assert.equal((await ownerCmd(cmd('manual',{turnId:recovery.turnId,expectedVersion:1,messageId:randomUUID(),body:'Recovered after rollback.'}))).status,'completed');
 await denied(ownerCmd(cmd('start',{question:'Disabled',expectedVersion:3})),'55000');
 await as('service_role');await denied(hostCmd(hash,{operation:'get',turnId}));
 await as('service_role');await q('select public.lemma_begin_account_delete($1)',[owner]);
 await as('authenticated',owner);await denied(state());
 await as('service_role');await q('select public.lemma_purge_account_rows($1)',[owner]);
 await as();await q('delete from auth.users where id=$1',[owner]);
 assert.equal(await one('select count(*)::int result from public.tutor_grant_credentials'),0);
 console.log('N193 passed '+(db.native?'independent PostgreSQL connection races':'serial PGlite transitions')+', lease fencing, receipt replay, approval, export and rollback.');
} finally {await db.close()}
