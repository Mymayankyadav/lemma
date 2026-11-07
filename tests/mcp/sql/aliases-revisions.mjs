// N93: a real migration boot, historical slugs and immutable edit snapshots.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const subject='33333333-3333-4333-8333-333333333333';
const project='44444444-4444-4444-8444-444444444444';
const source='55555555-5555-4555-8555-555555555555';
const subject2='66666666-6666-4666-8666-666666666666';
const project2='77777777-7777-4777-8777-777777777777';
const concept1='88888888-8888-4888-8888-888888888888';
const concept2='99999999-9999-4999-8999-999999999999';
const checkpoint1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const checkpoint2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$select nullif(current_setting('test.uid',true),'')::uuid $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(migrations.includes('20261116030000_n93_alias_revisions.sql'));
 for(const name of migrations)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proofs','Proof','Study')",[project,owner,subject]);
 await q("insert into public.sources(id,user_id,project_id,title,short) values($1,$2,$3,'Proof chapter','C1')",[source,owner,project]);
 await q("insert into public.source_pages(user_id,source_id,page,body) values($1,$2,1,'alpha')",[owner,source]);
 await q("update public.projects set slug='axioms' where id=$1",[project]);
 // The historical slug is now reserved against a second project on the same
 // owner; the identity is still resolvable from both old and current slugs.
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Topology','T','rose')",[subject2,owner]);
 await assert.rejects(q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proofs','Duplicate','Study')",[project2,owner,subject2]),/reserved|unique/i);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'topology','Topology','Study')",[project2,owner,subject2]);
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'metric','Metric')",[concept1,owner,subject]);
 await q("update public.concepts set slug='distance' where id=$1",[concept1]);
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'metric','Other metric')",[concept2,owner,subject2]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion) values($1,$2,$3,'CP1',1,'Proof','A proof','Prove')",[checkpoint1,owner,project]);
 await q("update public.checkpoints set code='CP2' where id=$1",[checkpoint1]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion) values($1,$2,$3,'CP1',1,'Proof two','B proof','Prove')",[checkpoint2,owner,project2]);
 
 await q("update public.sources set title='New proof chapter' where id=$1",[source]);
 await q("update public.source_pages set body='beta' where source_id=$1 and page=1",[source]);
 await q("update public.source_pages set body='beta' where source_id=$1 and page=1",[source]);
 assert.equal((await q("select count(*)::int n from public.record_aliases where user_id=$1 and old_value='proofs'",[owner]))[0].n,1);
 assert.equal((await q("select count(*)::int n from public.source_page_revisions where source_id=$1",[source]))[0].n,1,
   'an unchanged second update must not duplicate an old-content snapshot');
 assert.equal((await q("select count(*)::int n from public.source_revisions where source_id=$1",[source]))[0].n,1);
 assert.equal((await q("select snapshot->>'title' value from public.source_revisions where source_id=$1",[source]))[0].value,'Proof chapter');
 assert.equal((await q("select snapshot->>'body' value from public.source_page_revisions where source_id=$1",[source]))[0].value,'alpha');
 const revisionTables=(await q("select table_name from public.lemma_undo_tables where table_name in('record_aliases','source_revisions','source_page_revisions') order by table_name")).map(x=>x.table_name);
 assert.deepEqual(revisionTables,['record_aliases','source_page_revisions','source_revisions']);
 assert.equal((await q("select count(*)::int n from public.source_page_revisions where source_id=$1",[source]))[0].n,1);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[owner]);
 assert.equal((await q("select public.resolve_alias('project','proofs') id"))[0].id,project);
 assert.equal((await q("select public.resolve_alias('project','axioms') id"))[0].id,project);
 assert.equal((await q("select public.resolve_alias('concept','metric',$1) id",[subject]))[0].id,concept1);
 assert.equal((await q("select public.resolve_alias('concept','metric',$1) id",[subject2]))[0].id,concept2);
 await assert.rejects(q("select public.resolve_alias('concept','metric')"),/Ambiguous alias/);
 assert.equal((await q("select public.resolve_alias('checkpoint','CP1',$1) id",[project]))[0].id,checkpoint1);
 assert.equal((await q("select public.resolve_alias('checkpoint','CP1',$1) id",[project2]))[0].id,checkpoint2);
 await assert.rejects(q("select public.resolve_alias('checkpoint','CP1')"),/Ambiguous alias/);
 await assert.rejects(q("insert into public.record_aliases(user_id,kind,old_value,target_id) values($1,'project','forged',$2)",[owner,project]),/permission denied|row.level security/i);
 await q("select set_config('test.uid',$1,false)",[other]);
 assert.equal((await q("select public.resolve_alias('project','proofs') id"))[0].id,null);
 assert.equal((await q("select count(*)::int n from public.source_revisions"))[0].n,0);
 await db.exec('reset role');
 console.log('PASS N93 alias/rename and source/page version snapshot owner isolation');
}finally{await db.close()}
