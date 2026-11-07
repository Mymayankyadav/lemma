// N47.2.2: validation-only first slice, full-migration PGlite acceptance.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const input={operationId:'11111111-1111-4111-8111-111111111111',
 schemaVersion:1,resource:'overlap_acknowledgements',operation:'create',
 patch:{participants:[
  {kind:'entry',id:'33333333-3333-3333-3333-333333333333',version:1},
  {kind:'block',id:'44444444-4444-4444-4444-444444444444',version:1}],
 starts_at:'2026-11-07T08:00:00Z',ends_at:'2026-11-07T08:15:00Z',
 disposition:'keep_both'}};
const call=async p=>(await q('select public.overlap_ack_validate_envelope($1::jsonb) value',
 [JSON.stringify(p)]))[0].value;
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
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261107233000_overlap_ack_validation.sql'));
 for(const name of migrations)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1)',[owner]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 assert.deepEqual(await call(input),input,'valid create envelope is unchanged');
 await assert.rejects(call({...input,user_id:owner}),/Unknown command field/);
 await assert.rejects(call({...input,operation:'restore'}),/Unsupported acknowledgement operation/);
 await assert.rejects(call({...input,schemaVersion:2}),/schemaVersion must be 1/);
 await assert.rejects(call({...input,operationId:'not-a-uuid'}),/uuid/i);
 await assert.rejects(call({...input,patch:{...input.patch,participants:[input.patch.participants[0]]}}),
  /Participants must be/);
 await assert.rejects(call({...input,patch:{...input.patch,participants:[
   input.patch.participants[0],input.patch.participants[0]]}}),/Participants must be/);
 await assert.rejects(call({...input,patch:{...input.patch,attributed_to:{kind:'entry',id:input.patch.participants[0].id}}}),
  /Attribution must match/);
 await assert.rejects(call({...input,patch:{...input.patch,reason:'x'.repeat(601)}}),/reason exceeds/);
 await assert.rejects(call({...input,patch:{...input.patch,user_id:owner}}),/Unknown patch field/);
 const edit={...input,operation:'update',target:{id:'66666666-6666-4666-8666-666666666666'},
  expectedVersion:2,patch:{reason:'Recorded context'}};
 assert.deepEqual(await call(edit),edit,'partial update allowed with optimistic version');
 const completeUpdate={...edit,patch:{
  participants:input.patch.participants,disposition:'attribute_to',
  attributed_to:{kind:'entry',id:input.patch.participants[0].id}}};
 assert.deepEqual(await call(completeUpdate),completeUpdate,
  'complete update attribution agrees with participant set');
 await assert.rejects(call({...completeUpdate,patch:{...completeUpdate.patch,
   attributed_to:{kind:'entry',id:'55555555-5555-4555-8555-555555555555'}}}),
  /Attribution must match an acknowledged participant/);
 const partialAttribution={...edit,patch:{disposition:'attribute_to'}};
 assert.deepEqual(await call(partialAttribution),partialAttribution,
  'partial updates need existing-row context and stay accepted');
 await assert.rejects(call({...edit,expectedVersion:0}),/positive integer/);
 await assert.rejects(call({...edit,patch:{}}),/Update patch/);
 await assert.rejects(call({...edit,patch:{disposition:null}}),/Invalid disposition/);
 await assert.rejects(call({...input,patch:{...input.patch,disposition:null}}),/Invalid disposition/);
 await assert.rejects(call({...edit,target:{}}),/target.id must be/);
 const deletion={...edit,operation:'delete',patch:{}};
 assert.deepEqual(await call(deletion),deletion);
 await assert.rejects(call({...deletion,patch:{reason:'bad'}}),/Unknown patch field/);
 const attribution={...input,patch:{...input.patch,disposition:'attribute_to',
  attributed_to:{kind:'entry',id:input.patch.participants[0].id}}};
 assert.deepEqual(await call(attribution),attribution);
 // Internal registry tables are readable by the admin test fixture, not
 // by authenticated callers. Only the envelope itself uses the client role.
 await db.exec('reset role');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='overlap_acknowledgements'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='overlap_acknowledgements'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='overlap_acknowledgements'"))[0].n,0);
 await db.exec('set role anon');
 await assert.rejects(call(input),/permission denied|Authentication required/);
 console.log('PASS N47.2.2 owner-bound overlap command envelope, immutable validation and read-only stage');
}finally{await db.close()}
