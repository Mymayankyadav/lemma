// N92: full-migration proposal lifecycle and immutable revision history.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(s,a=[])=>(await db.query(s,a)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const sid='33333333-3333-4333-8333-333333333333';
const pid='44444444-4444-4444-8444-444444444444';
const proposal='55555555-5555-4555-8555-555555555555';
const call=async(f,args)=> (await q('select public.'+f+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value',args))[0].value;
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$select nullif(current_setting('test.uid',true),'')::uuid $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(names.includes('20261116020000_n92_proposal_versions.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[sid,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'math','Math','Study')",[pid,owner,sid]);
 await q("insert into public.proposals(id,user_id,project_id,kind,payload,reason,origin) values($1,$2,$3,'card',$4::jsonb,'Evidence','chatgpt')",[proposal,owner,pid,JSON.stringify({front:'Q',back:'A'})]);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[owner]);
 const row=(await q('select payload_version,version,citations from public.proposals where id=$1',[proposal]))[0];
 assert.equal(row.payload_version,1);assert.deepEqual(row.citations,[]);
 const withdrawn=await q('select (public.withdraw_proposal($1,$2,$3)).*',[proposal,row.version,'Owner changed plan']);
 assert.equal(withdrawn[0].status,'rejected');
 assert.ok(withdrawn[0].withdrawn_at);
 await assert.rejects(q('select public.withdraw_proposal($1,$2,$3)',[proposal,row.version,'Again']),/Stale/);
 const reopened=(await q('select (public.reopen_proposal($1,$2)).*',[proposal,withdrawn[0].version]))[0];
 assert.equal(reopened.status,'pending');assert.equal(reopened.withdrawn_at,null);
 const updated={front:'Q2',back:'A2'};
 const citations=[{source:pid,version:1,page:'12'}];
 const revision=(await q('select (public.revise_proposal($1,$2,$3::jsonb,$4::jsonb)).*',
  [proposal,reopened.version,JSON.stringify(updated),JSON.stringify(citations)]))[0];
 assert.equal(revision.status,'pending');assert.equal(revision.revised_from,proposal);
 assert.equal(revision.payload_version,1);assert.deepEqual(revision.citations,citations);
 assert.equal(revision.group_id,proposal);
 const retry=(await q('select (public.revise_proposal($1,$2,$3::jsonb,$4::jsonb)).*',
  [proposal,reopened.version,JSON.stringify(updated),JSON.stringify(citations)]))[0];
 assert.equal(retry.id,revision.id,'same revision is not duplicated');
 await assert.rejects(q('select public.reopen_proposal($1,$2)',[proposal,reopened.version+1]),/successor/);
 await assert.rejects(q('select public.revise_proposal($1,$2,$3::jsonb,$4::jsonb)',
  [proposal,reopened.version,JSON.stringify(updated),JSON.stringify([{source:pid,version:0,page:'12'}])]),/Invalid/);
 await q("select set_config('test.uid',$1,false)",[other]);
 await assert.rejects(q('select public.withdraw_proposal($1,$2,$3)',[revision.id,1,'steal']),/not found for owner/i);
 assert.equal((await q('select count(*)::int n from public.proposals where id=$1',[revision.id]))[0].n,0);
 await db.exec('reset role');
 const journal=(await q("select count(*)::int n from public.action_changes where table_name='proposals' and row_pk->>'id'=$1",[revision.id]))[0].n;
 assert.equal(journal,1,'revision insertion is audited');
 console.log('PASS N92 withdraw/reopen/revise, owner, citation, retry, journal');
}finally{await db.close()}
