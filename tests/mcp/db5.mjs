// DB-5 transcription provenance acceptance against isolated PostgreSQL.
// Never connect to the owner's Supabase project.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const subject='22222222-2222-2222-2222-222222222222';
const project='33333333-3333-3333-3333-333333333333';
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const last=async()=>Number((await q('select max(no) n from public.actions'))[0].n);
const undo=async(no)=>(await q('select public.undo_action($1,$2,false) result',[owner,no]))[0].result;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
   await db.exec(await readFile(new URL(file,dir),'utf8'));
 await db.exec(`select set_config('test.uid','${owner}',false);
 insert into auth.users(id) values ('${owner}'),('${other}');
 insert into public.subjects(id,user_id,name,glyph,hue)
 values ('${subject}','${owner}','Analysis','A','amber');
 insert into public.projects(id,user_id,subject_id,slug,title,goal)
 values ('${project}','${owner}','${subject}','analysis','Analysis','Study');`);
 const scan=(await q(`insert into public.sources(user_id,project_id,title,short,kind,status,has_text,page_count)
 values ($1,$2,'Scanned lecture','scan','notes','ready',false,40) returning id,origin`,[owner,project]))[0];
 assert.equal(scan.origin,'user','existing uploads must default to user');
 await q('insert into public.source_pages(user_id,source_id,page,label,body) values($1,$2,1,\'1\',\'\')',[owner,scan.id]);
 const initial=(await q('select transcribed_by,transcribed_at,confidence,body from public.source_pages where source_id=$1',[scan.id]))[0];
 assert.deepEqual(initial,{transcribed_by:null,transcribed_at:null,confidence:null,body:''});
 console.log('PASS DB-5 defaults preserve existing uploads and extracted pages');

 await db.exec('begin');
 await q(`select set_config('lemma.source','claude',true),set_config('lemma.tool','save_pages',true),set_config('lemma.summary','Transcribe scan page 1',true)`);
 await q(`update public.source_pages set body=$1,transcribed_by='claude',
 transcribed_at=now(),confidence='check' where source_id=$2 and page=1`,
 ['The integral of $x^2$ is $x^3/3$. [illegible]',scan.id]);
 await q('update public.sources set has_text=true where id=$1',[scan.id]);
 await db.exec('commit');
 const action=await last();
 assert.equal((await q(`select source,tool from public.actions where no=${action}`))[0].tool,'save_pages');
 assert.equal((await q(`select count(*)::int n from public.action_changes where action_no=${action}`))[0].n,2);
 assert.equal((await q('select count(*)::int n from public.source_pages where source_id=$1 and tsv @@ plainto_tsquery(\'english\',\'integral\')',[scan.id]))[0].n,1);
 assert.equal((await q('select confidence from public.source_pages where source_id=$1',[scan.id]))[0].confidence,'check');
 const undone=await undo(action);
 assert.equal((await q('select body from public.source_pages where source_id=$1',[scan.id]))[0].body,'');
 assert.equal((await q('select has_text from public.sources where id=$1',[scan.id]))[0].has_text,false);
 assert.equal((await q('select transcribed_by from public.source_pages where source_id=$1',[scan.id]))[0].transcribed_by,null);
 await undo(undone.as);
 assert.equal((await q('select transcribed_by from public.source_pages where source_id=$1',[scan.id]))[0].transcribed_by,'claude');
 assert.equal((await q('select has_text from public.sources where id=$1',[scan.id]))[0].has_text,true);
 console.log('PASS DB-5 transcribed scan searchable, action grouped, undo and redo');

 await db.exec('begin');
 await q(`select set_config('lemma.source','chatgpt',true),set_config('lemma.tool','save_pages',true),set_config('lemma.summary','New text-only source',true)`);
 const fresh=(await q(`insert into public.sources(user_id,project_id,title,short,kind,status,has_text,page_count,origin)
 values($1,$2,'Handwritten proofs','proofs','notes','ready',true,2,'chatgpt') returning id`,[owner,project]))[0].id;
 await q(`insert into public.source_pages(user_id,source_id,page,label,body,transcribed_by,transcribed_at,confidence)
 values($1,$2,1,'i','A group is a set with an operation.','chatgpt',now(),'high'),
 ($1,$2,2,'ii','[illegible]','chatgpt',now(),'check')`,[owner,fresh]);
 await db.exec('commit');
 const createAction=await last();
 assert.equal((await q('select count(*)::int n from public.source_pages where source_id=$1',[fresh]))[0].n,2);
 await undo(createAction);
 assert.equal((await q('select count(*)::int n from public.sources where id=$1',[fresh]))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.source_pages where source_id=$1',[fresh]))[0].n,0);
 console.log('PASS DB-5 text-only source and pages undone as one action');

 await assert.rejects(q(`update public.sources set origin='untrusted' where id=$1`,[scan.id]),/check constraint/);
 await assert.rejects(q(`update public.source_pages set confidence='maybe' where source_id=$1`,[scan.id]),/check constraint/);
 await assert.rejects(q(`update public.source_pages set transcribed_by='stranger' where source_id=$1`,[scan.id]),/check constraint/);
 await q('update public.source_pages set confidence=null where source_id=$1',[scan.id]);
 assert.equal((await q('select confidence from public.source_pages where source_id=$1',[scan.id]))[0].confidence,null);
 console.log('PASS DB-5 provenance constraints and checked-page state');

 await db.exec(`select set_config('test.uid','${other}',false);set role authenticated`);
 assert.equal((await q('select count(*)::int n from public.sources'))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.source_pages'))[0].n,0);
 assert.equal((await q('update public.source_pages set body=\'foreign\' where source_id=$1 returning page',[scan.id])).length,0);
 await db.exec('reset role');
 console.log('PASS DB-5 owner RLS preserved');
}finally{await db.close();}
