// DB-3 migration acceptance against an isolated PostgreSQL engine; no live data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const owner='11111111-1111-1111-1111-111111111111',other='99999999-9999-9999-9999-999999999999';
const project='33333333-3333-3333-3333-333333333333',subject='22222222-2222-2222-2222-222222222222';
const migration=await readFile(new URL('../../supabase/migrations/20261030055046_lab_planning_fields.sql',import.meta.url),'utf8');
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const file of ['20261029164215_lemma_tables.sql','20261029164314_lemma_triggers.sql','20261029164323_lemma_rls.sql','20261029164341_lemma_functions.sql','20261029165642_lemma_atomic_progress.sql','20261029183249_action_log.sql','20261029190752_mcp_transactions.sql','20261030031945_initial_plan_source_coverage.sql'])
  await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`select set_config('test.uid','${owner}',false);insert into auth.users values('${owner}'),('${other}');`);
 return db;
}
async function seed(db,recognized=true){
 await db.query(`insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Algebra','A','amber')`,[subject,owner]);
 await db.query(`insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'algebra-1','Algebra 1','Learn')`,[project,owner,subject]);
 const titles={1:'Baseline diagnostic: sets, Zorn, linear algebra',18:"Rings, ideals and the course's ring zoo",24:'Modules, bimodules, Hom and free modules',38:'Field extensions, splitting fields, finite fields'};
 for(let n=1;n<=40;n++)await db.query(`insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,$3,$4,$5,'Learn','Prove','["Study"]')`,[owner,project,'CP'+n,n,recognized?(titles[n]||'Checkpoint '+n):'Different plan '+n]);
}
const db=await setup();
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
try{
 await seed(db);
 const before=await q('select code,title,objective,criterion,steps,status,current_step from public.checkpoints order by position');
 await db.exec(migration);
 assert.deepEqual(await q('select code,title,objective,criterion,steps,status,current_step from public.checkpoints order by position'),before);
 const stages=Object.fromEntries((await q('select stage,count(*)::int n from public.checkpoints group by stage')).map(x=>[x.stage,x.n]));
 assert.deepEqual(stages,{Foundations:1,Groups:16,Rings:6,Modules:14,Fields:1,Galois:2});
 const action=(await q("select no,source from public.actions where tool='db3_stage_backfill'"))[0];
 assert.equal(action.source,'system');assert.equal((await q('select count(*)::int n from public.action_changes where action_no=$1',[action.no]))[0].n,40);
 const undo=(await q('select public.undo_action($1,$2,false) r',[owner,action.no]))[0].r;
 assert.equal((await q('select count(*)::int n from public.checkpoints where stage is not null'))[0].n,0);
 await q('select public.undo_action($1,$2,false)',[owner,undo.as]);
 assert.deepEqual(Object.fromEntries((await q('select stage,count(*)::int n from public.checkpoints group by stage')).map(x=>[x.stage,x.n])),stages);
 console.log('PASS DB-3 actual-plan stages, content preservation, logged undo and redo');
 await assert.rejects(q('update public.checkpoints set stage=$1',["s".repeat(41)]),/check constraint/);
 await assert.rejects(q('update public.projects set target_label=$1',["t".repeat(21)]),/check constraint/);
 await db.exec('select public.bootstrap()');
 await assert.rejects(q("update public.settings set ui='[]'"),/check constraint/);
 await assert.rejects(q("update public.settings set ui='42'"),/check constraint/);
 await db.query(`insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,'groups','Groups')`,[owner,subject]);
 await assert.rejects(q('update public.concepts set topic=$1',["t".repeat(41)]),/check constraint/);
 await q("update public.projects set target_date='2027-01-15',target_label='Prelim'");
 assert.equal((await q('select target_date::text as target_date from public.projects'))[0].target_date,'2027-01-15');
 await q('update public.concepts set topic=$1',['Group theory']);
 const preferences={follow:true,day:'euclid',night:'euclid-night',future:{keep:true}};
 await q('update public.settings set ui=$1',[JSON.stringify(preferences)]);
 assert.deepEqual((await q('select ui from public.settings'))[0].ui,preferences);
 const uiAction=(await q('select max(no) n from public.actions'))[0].n;
 await q('select public.undo_action($1,$2,false)',[owner,uiAction]);
 assert.equal((await q('select ui from public.settings'))[0].ui,null);
 console.log('PASS DB-3 nullable fields, length/object checks, ISO targets and reversible UI preferences');
 await db.exec(`set role authenticated;select set_config('test.uid','${other}',false)`);
 assert.equal((await q('select count(*)::int n from public.checkpoints'))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.settings'))[0].n,0);
 await db.exec('reset role');
 console.log('PASS DB-3 existing owner isolation remains enforced');
}finally{await db.close();}
for(const recognized of [null,false]){
 const isolated=await setup();
 try{
  if(recognized!==null)await seed(isolated,false);
  const before=(await isolated.query('select count(*)::int n from public.actions')).rows[0].n;
  await isolated.exec(migration);
  assert.equal((await isolated.query('select count(*)::int n from public.actions')).rows[0].n,before);
  assert.equal((await isolated.query('select count(*)::int n from public.checkpoints where stage is not null')).rows[0].n,0);
  console.log('PASS DB-3 '+(recognized===null?'empty database':'different Algebra plan')+' does not invent a backfill');
 }finally{await isolated.close();}
}
