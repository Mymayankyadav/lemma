// N47.1: full-migration owner, validation and stale-acknowledgement checks.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const entry='33333333-3333-3333-3333-333333333333';
const block='44444444-4444-4444-4444-444444444444';
const otherEntry='55555555-5555-5555-5555-555555555555';
const participants=[
 {kind:'entry',id:entry,version:1},{kind:'block',id:block,version:1},
];
const insert=async(input={},user=owner)=>q(
 'insert into public.overlap_acknowledgements(user_id,participants,starts_at,ends_at,reason,disposition,attributed_to) values($1,$2::jsonb,$3,$4,$5,$6,$7::jsonb) returning *',[
 user,JSON.stringify(input.participants??participants),
 input.starts_at??'2026-11-07T09:15:00Z',
 input.ends_at??'2026-11-07T09:45:00Z',
 input.reason??null,input.disposition??'keep_both',
 input.attributed_to===undefined?null:JSON.stringify(input.attributed_to),
]);
const stale=async (who,list)=>(await q(
 'select public.overlap_ack_is_stale($1::uuid,$2::jsonb) value',
 [who,JSON.stringify(list)]))[0].value;
const invalid=async(input,re=/constraint|violates|Overlap participants/i)=>
  assert.rejects(insert(input),re);
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
   nullif(current_setting('test.uid',true),'')::uuid)$auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(names.includes('20261107120000_overlap_acknowledgements.sql'));
 assert.ok(names.includes('20261107123030_overlap_attribution_uuid_case.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Focus')",[entry,owner]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Other')",[otherEntry,other]);
 await q("insert into public.calendar_blocks(id,user_id,kind,title,starts_at,ends_at,time_zone) values($1,$2,'study','Block','2026-11-07T09:00:00Z','2026-11-07T10:00:00Z','Asia/Kolkata')",
  [block,owner]);
 assert.equal(await stale(owner,participants),false,'the exact participant versions are current');
 const ack=(await insert())[0];assert.ok(ack.id);assert.equal(ack.version,1);
 assert.equal(ack.disposition,'keep_both');assert.equal(ack.attributed_to,null);
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='overlap_acknowledgements'"))[0].n,1);
 const attributed=(await insert({disposition:'attribute_to',
  attributed_to:{kind:'entry',id:entry}}))[0];
 assert.equal(attributed.disposition,'attribute_to');
 // bug #1072: UUID identity is case-insensitive at every SQL boundary.
 // This read-only helper regression fails on N47.1 before the new migration:
 // its old JSON-containment comparison treats uppercase and lowercase ID
 // strings as different participants even though they are one typed UUID.
 const upperCaseParticipants=[
  {kind:'entry',id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',version:1},
  {kind:'block',id:'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',version:1},
 ];
 const choiceValid=async(list,disposition,choice)=>(await q(
  'select public.overlap_ack_choice_valid($1::jsonb,$2,$3::jsonb) value',
  [JSON.stringify(list),disposition,choice===null?null:JSON.stringify(choice)]))[0].value;
 assert.equal((await q('select public.overlap_ack_participants_valid($1::jsonb) valid',
  [JSON.stringify(upperCaseParticipants)]))[0].valid,true,
  'mixed-case typed participant IDs are permitted');
 assert.equal(await choiceValid(upperCaseParticipants,'attribute_to',{
  kind:'entry',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 }),true,'equivalent mixed-case UUID must be recognized as exact participant');
 assert.equal(await choiceValid(upperCaseParticipants,'attribute_to',{
  kind:'entry',id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
 }),true,'unchanged uppercase attribution stays valid');
 assert.equal(await choiceValid(upperCaseParticipants,'attribute_to',{
  kind:'block',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 }),false,'typed participant kind must also match');
 assert.equal(await choiceValid(upperCaseParticipants,'attribute_to',{
  kind:'entry',id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 }),false,'a different valid UUID is not in the set');
 assert.equal(await choiceValid(upperCaseParticipants,'attribute_to',{
  kind:'entry',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner:'forged',
 }),false,'extra choice fields remain invalid');
 assert.equal(await choiceValid(upperCaseParticipants,'attribute_to',{
  kind:'entry',id:'invalid',
 }),false,'malformed choice UUID remains invalid');
 assert.equal(await choiceValid(upperCaseParticipants,'keep_both',null),true,
  'keep_both still accepts an absent SQL choice');
 assert.equal(await choiceValid(upperCaseParticipants,'keep_both',{
  kind:'entry',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 }),false,'keep_both still forbids an attributed choice');
 await invalid({participants:[participants[0]]});
 await invalid({participants:[participants[0],participants[0]]});
 await invalid({participants:[participants[0],{kind:'unknown',id:block,version:1}]});
 await invalid({participants:[participants[0],{kind:'block',id:block,version:0}]});
 await invalid({participants:[participants[0],{kind:'block',id:block,version:1,owner:'spoof'}]});
 await invalid({participants:[participants[0],{kind:'block',id:block,version:2}]});
 await invalid({participants:[participants[0],{kind:'entry',id:otherEntry,version:1}]});
 await invalid({disposition:'attribute_to',attributed_to:{kind:'entry',id:otherEntry}});
 await invalid({disposition:'keep_both',attributed_to:{kind:'entry',id:entry}});
 await invalid({ends_at:'2026-11-07T09:15:00Z'});
 await invalid({reason:'x'.repeat(601)});
 assert.equal(await stale(other,participants),true,'another owner cannot validate foreign IDs');
 await db.exec(`select set_config('test.uid','${owner}',false);set role authenticated;`);
 const shown=await q('select id from public.overlap_acknowledgements order by id');
 assert.deepEqual(shown.map(x=>x.id).sort(),[ack.id,attributed.id].sort());
 await assert.rejects(insert(),/permission denied|row-level security/i);
 await db.exec(`reset role;select set_config('test.uid','${other}',false);set role authenticated;`);
 assert.deepEqual(await q('select id from public.overlap_acknowledgements'),[],
  'RLS hides another owner acknowledgements');
 await db.exec('reset role');
 await q('update public.study_entries set version=2 where id=$1',[entry]);
 assert.equal(await stale(owner,participants),true,'version mismatch becomes stale without rewriting row');
 const old=(await q('select participants,version from public.overlap_acknowledgements where id=$1',[ack.id]))[0];
 assert.equal(old.version,1,'acknowledgement remains immutable until explicit update');
 assert.equal(JSON.parse(JSON.stringify(old.participants))[0].version,1);
 assert.equal(await stale(owner,[
  {kind:'entry',id:entry,version:2},{kind:'block',id:block,version:1}]),false);
 const updated=await q("update public.overlap_acknowledgements set participants=$1::jsonb where id=$2 returning version",
  [JSON.stringify([{kind:'entry',id:entry,version:2},{kind:'block',id:block,version:1}]),ack.id]);
 assert.equal(updated[0].version,2);
 const docs=JSON.parse(await readFile(new URL(
  '../../../docs/v6/capability-registry/overlap_acknowledgements.json',import.meta.url),'utf8'));
 const cols=(await q("select attname from pg_attribute where attrelid='public.overlap_acknowledgements'::regclass and attnum>0 and not attisdropped"))
  .map(x=>x.attname);
 assert.deepEqual(Object.keys(docs.columns).sort(),cols.sort());
 console.log('PASS N47.1 participant validation, current/stale versions, owner RLS and audit');
}finally{await db.close()}
