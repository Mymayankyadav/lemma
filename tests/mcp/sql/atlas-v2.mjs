process.on('uncaughtException',error=>{console.error(error.message);if(error.where)console.error(error.where);process.exit(1);});
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create table auth.users(id uuid primary key)');
 await db.exec("create function auth.uid() returns uuid language sql as $$select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort(),mine=names.filter(n=>n.includes('_n172_')||n.includes('_n173_')||n.includes('_n175_')||n.includes('_n178_'));
 for(const n of names.filter(n=>!mine.includes(n))){try{await db.exec(await readFile(new URL(n,dir),'utf8'));}catch(e){throw Error(n+': '+e.message);}}
 for(const n of mine){try{await db.exec(await readFile(new URL(n,dir),'utf8'));}catch(e){throw Error(n+': '+e.message);}}
 const schema=async()=>q("select table_name,column_name,data_type from information_schema.columns where table_schema='public' order by 1,2"),up=await schema();
 await q('insert into auth.users values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[id(1),owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'atlas','Atlas','Understand')",[id(2),owner,id(1)]);
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'compactness','Compactness')",[id(3),owner,id(1)]);
 for(let j=0;j<7;j++)await q("insert into public.sessions(id,user_id,project_id,number,goal,style) values($1,$2,$3,$4,'Learn','socratic')",[id(4+j),owner,id(2),j+1]);
 // 146 source rows: 12 exact duplicates, 24 unresolved, seven pretest/instruction pairs.
 for(let i=0;i<134;i++)await q("insert into public.evidence(user_id,occurred_at,session_id,project_id,concept_id,level,outcome,kind,origin) values($1,$2,$3,$4,$5,$6,$7,$8,'migration')",[owner,new Date(Date.UTC(2026,10,1,10,0,i)).toISOString(),id(4+i%7),id(2),i>=110?null:id(3),'use',i%3===0?'partial':'pass',i<7?'pretest':'attempt']);
 await q('insert into public.evidence(user_id,occurred_at,session_id,project_id,concept_id,level,outcome,kind,origin) select user_id,occurred_at,session_id,project_id,concept_id,level,outcome,kind,origin from public.evidence order by id limit 12');
 const before=(await q('select count(*)::int n from public.actions'))[0].n;
 await q("select set_config('test.uid',$1,false)",[owner]);
 await q("select set_config('role','service_role',false)");
 const dry=(await q('select public.atlas_v2_migrate($1::jsonb) r',[JSON.stringify({owner})]))[0].r;
 assert.deepEqual([dry.source,dry.attempts,dry.merged,dry.untagged],[146,134,12,24]);
 assert.equal((await q('select count(*)::int n from public.attempts'))[0].n,0,'dry run writes no attempts');
 assert.equal((await q('select count(*)::int n from public.actions'))[0].n,before,'dry run does not journal');
 await q('select public.atlas_v2_migrate($1::jsonb)',[JSON.stringify({owner,dry_run:false})]);
 await q('select public.atlas_v2_migrate($1::jsonb)',[JSON.stringify({owner,dry_run:false})]);
 assert.equal((await q('select count(*)::int n from public.attempts'))[0].n,134,'real migration is idempotent');
 assert.equal((await q('select count(*)::int n from public.attempt_tags'))[0].n,110);
 assert.equal((await q('select count(*)::int n from public.instruction_events'))[0].n,7);
 assert.equal((await q('select atlas_migrated_at from public.settings'))[0].atlas_migrated_at,null,'preparation never activates cutover');
 await assert.rejects(q('select public.atlas_v2_activate($1::jsonb)',[JSON.stringify({owner,approved_diff_hash:dry.diff_hash})]),/Model fit|Release gate/);
 // Exercise the post-cutover writer only on this disposable fixture.
 await db.exec('reset role');await q('update public.settings set atlas_migrated_at=now() where user_id=$1',[owner]);await q("select set_config('role','service_role',false)");
 const payload={events:[{kind:'attempt',text:'A structured attempt',attempt:{kind:'practice',cued:[],confidence_before:.6,stages:[{stage:'E',result:'ok',hint:0,tags:[{concept:id(3),facet:'use',role:'target'}]}]}}]};
 payload.events.push(payload.events[0]);
 await q('select public.save_progress($1,$2,$3,$4::jsonb)',[owner,id(2),id(4),JSON.stringify(payload)]);
 assert.equal((await q('select count(*)::int n from public.attempts'))[0].n,135,'same-save duplicate attempts merge');
 assert.equal((await q('select count(*)::int n from public.evidence'))[0].n,146,'cutover writer never writes legacy evidence');
 await assert.rejects(q('update public.attempts set weight=.1'),/append-only/);
 await db.exec('reset role');
 await assert.rejects(q("insert into public.evidence(user_id,level,outcome,origin) values($1,'use','pass','tutor')",[owner]),/frozen/);
 await q("select set_config('role','service_role',false)");
 const beforeBad=(await q('select count(*)::int n from public.session_events'))[0].n;
 const bad=structuredClone(payload);bad.events[1].attempt.stages[0].tags[0].concept=id(999);
 await assert.rejects(q('select public.save_progress($1,$2,$3,$4::jsonb)',[owner,id(2),id(4),JSON.stringify(bad)]),/Unknown attempt concept/);
 assert.equal((await q('select count(*)::int n from public.session_events'))[0].n,beforeBad,'invalid later tags roll back every earlier event');
 // review fix 10: events written after cutover mean what they meant before it
 {
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Other','O','cyan')",[id(520),owner]);
  await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'shared','Shared'),($4,$2,$5,'shared','Shared elsewhere')",[id(521),owner,id(1),id(522),id(520)]);
  const save=async events=>q('select public.save_progress($1,$2,$3,$4::jsonb) r',[owner,id(2),id(4),JSON.stringify({events})]);
  const last=async()=>(await q('select a.item_kind,a.legacy_outcome,t.facet,t.concept_id,t.role from public.attempts a left join public.attempt_tags t on t.attempt_id=a.id order by a.id desc limit 1'))[0];
  const count=async()=>(await q('select count(*)::int n from public.attempts'))[0].n;
  let n=await count();
  await save([{kind:'attempt',text:'recalled the definition',outcome:'demonstrated',recall:true,concept:'compactness'}]);
  assert.deepEqual([(await last()).item_kind,(await last()).facet],['recall','recall'],'recall:true is a recall attempt at the recall facet');
  await save([{kind:'explanation',text:'explained and was checked',outcome:'partial',concept:'compactness'}]);
  assert.equal(await count(),n+2,'a graded explanation is evidence');assert.equal((await last()).facet,'understand');
  await assert.rejects(save([{kind:'attempt',text:'x',outcome:'failed',concept:'no-such-concept'}]),/Unknown concept: no-such-concept/,'an unknown concept is refused, never silently untagged');
  await save([{kind:'attempt',text:'x',outcome:'demonstrated',concept:'shared'}]);
  assert.equal((await last()).concept_id,id(521),'a slug resolves inside the project\'s own subject first');
  n=await count();
  await save([1,2,3].map(i=>({kind:'attempt',text:'Question '+i,outcome:'demonstrated',recall:true,concept:'compactness'})));
  assert.equal(await count(),n+3,'three different questions on one concept are three attempts');
  n=await count();const same={kind:'attempt',text:'Same question',outcome:'demonstrated',recall:true,concept:'compactness'};
  await save([same,same]);assert.equal(await count(),n+1,'the same event repeated in one save is one attempt');
 }
 for(const table of ['attempts','attempt_tags','instruction_events','atlas_links','model_fits'])assert.equal((await q("select has_table_privilege('authenticated',$1,'INSERT') v",['public.'+table]))[0].v,false,table+' browser writes revoked');
 // review fix 2: the new tables never block a delete, and the evidence freeze lets a cascade through while direct writes stay frozen
 await db.exec('reset role');
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'doomed-project','Doomed','G')",[id(500),owner,id(1)]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style) values($1,$2,$3,1,'g','s')",[id(501),owner,id(500)]);
 const doomed=(await q("insert into public.attempts(user_id,project_id,session_id,item_kind) values($1,$2,$3,'practice') returning id",[owner,id(500),id(501)]))[0].id;
 await q("insert into public.attempt_tags(user_id,attempt_id,concept_id,facet) values($1,$2,$3,'use')",[owner,doomed,id(3)]);
 await q("insert into public.instruction_events(user_id,session_id,concept_id) values($1,$2,$3)",[owner,id(501),id(3)]);
 await q('delete from public.sessions where id=$1',[id(501)]);
 assert.equal((await q('select session_id from public.attempts where id=$1',[doomed]))[0].session_id,null,'deleting a session clears the link, not the attempt');
 await q('delete from public.projects where id=$1',[id(500)]);
 assert.equal((await q('select count(*)::int n from public.attempts where id=$1',[doomed]))[0].n,0,'deleting a project removes its attempts');
 await assert.rejects(q('delete from public.evidence where project_id=$1',[id(2)]),/frozen/,'a direct evidence delete stays frozen after cutover');
 assert.ok((await q('select count(*)::int n from public.evidence where project_id=$1',[id(2)]))[0].n>0);
 await q('delete from public.projects where id=$1',[id(2)]);
 assert.equal((await q('select count(*)::int n from public.evidence where project_id=$1',[id(2)]))[0].n,0,'deleting a project after cutover cascades through the frozen evidence');
 assert.equal((await q('select count(*)::int n from public.attempts where project_id=$1',[id(2)]))[0].n,0);
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'family-a','Family A'),($4,$2,$3,'family-b','Family B')",[id(510),owner,id(1),id(511)]);
 await q('update public.concepts set family_id=$1 where id=$2',[id(510),id(511)]);
 await q('delete from public.concepts where id=$1',[id(510)]);
 assert.equal((await q('select family_id from public.concepts where id=$1',[id(511)]))[0].family_id,null,'deleting a family clears the link');
 await db.exec('reset role');
 await db.exec(await readFile(new URL('../../../supabase/rollback/N172.down.sql',import.meta.url),'utf8'));
 for(const n of mine)await db.exec(await readFile(new URL(n,dir),'utf8'));
 assert.deepEqual(await schema(),up,'up → down → up reproduces schema');
 console.log('PASS Atlas schema, dry-run counts, idempotency, activation gates, browser revokes and rollback');
}finally{await db.close();}
