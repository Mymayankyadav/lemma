// Isolated PostgreSQL integration harness. Install @electric-sql/pglite@0.5.13
// outside the repo and set PGLITE_MODULE to its absolute entry point to run.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const project='33333333-3333-3333-3333-333333333333';
const q=async(sql)=>(await db.query(sql)).rows;
const last=async()=>(await q('select max(no) n from public.actions'))[0].n;
const undo=async(n,force=false)=>(await q(`select public.undo_action('${owner}',${n},${force}) r`))[0].r;
const note=async()=>{const r=(await q(`insert into public.notes(user_id,project_id,front) values ('${owner}','${project}','Original') returning id`))[0];return {id:r.id,action:await last()};};
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create schema extensions; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 for(const file of ['20261029164215_lemma_tables.sql','20261029164314_lemma_triggers.sql','20261029164323_lemma_rls.sql','20261029164341_lemma_functions.sql','20261029165642_lemma_atomic_progress.sql','20261029183249_action_log.sql','20261030031945_initial_plan_source_coverage.sql','20261101060000_history_owner_view.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`select set_config('test.uid','${owner}',false); insert into auth.users values ('${owner}'),('${other}')`);
 await db.exec(`insert into public.subjects(id,user_id,name,glyph,hue) values ('22222222-2222-2222-2222-222222222222','${owner}','Analysis','A','amber')`);
 await db.exec(`insert into public.projects(id,user_id,slug,subject_id,title,goal) values ('${project}','${owner}','analysis','22222222-2222-2222-2222-222222222222','Analysis','Study')`);
 let n=await note(),r=await undo(n.action);
 assert.equal((await q(`select count(*) n from public.notes where id='${n.id}'`))[0].n,0);
 await undo(r.as);assert.equal((await q(`select front from public.notes where id='${n.id}'`))[0].front,'Original');
 assert.equal((await q(`select undone_by from public.actions where no=${n.action}`))[0].undone_by,null);
 await db.exec(`update public.notes set front='Changed' where id='${n.id}'`);await undo(await last());
 assert.equal((await q(`select front from public.notes where id='${n.id}'`))[0].front,'Original');
 await db.exec(`delete from public.notes where id='${n.id}'`);await undo(await last());
 assert.equal((await q(`select front from public.notes where id='${n.id}'`))[0].front,'Original');
 console.log('PASS insert/update/delete undo and redo');
 n=await note();await db.exec(`update public.notes set back='Later' where id='${n.id}'`);
 await assert.rejects(undo(n.action),/Undo A\d+ first/);
 assert.equal((await q(`select back from public.notes where id='${n.id}'`))[0].back,'Later');
 console.log('PASS conflicts roll back');
 n=await note();await db.exec(`insert into public.cards(user_id,note_id,ord) values ('${owner}','${n.id}',1)`);
 await assert.rejects(undo(n.action),/Undo would also remove: cards 1/);
 assert.equal((await q(`select count(*) n from public.cards where note_id='${n.id}'`))[0].n,1);
 r=await undo(n.action,true);await undo(r.as);
 assert.equal((await q(`select count(*) n from public.cards where note_id='${n.id}'`))[0].n,1);
 console.log('PASS cascade guard, forced cascade and redo');
 await db.exec(`delete from public.notes where id='${n.id}'`);await undo(await last());
 assert.equal((await q(`select count(*) n from public.cards where note_id='${n.id}'`))[0].n,1);
 console.log('PASS cascading delete restored');
 const before=await last();await db.exec(`update public.projects set last_activity_at=now() where id='${project}'`);assert.equal(await last(),before);
 assert.ok((await q('select summary from public.actions where no='+before))[0].summary);
 assert.equal((await q("select count(*) n from pg_constraint where contype='f' and connamespace='public'::regnamespace and not condeferrable"))[0].n,0);
 console.log('PASS timestamp suppression, summaries, deferrable foreign keys');
 n=await note();await db.exec(`set role authenticated`);
 await assert.rejects(q(`select public.undo_action('${other}',${n.action},false)`),/Not authorized/);
 await assert.rejects(db.exec('delete from public.actions'),/permission denied/);
 await assert.rejects(db.exec('insert into public.action_changes(action_no,seq,table_name,row_pk,op) values (1,99,\'notes\',\'{}\',\'delete\')'),/permission denied/);
 await db.exec(`select set_config('test.uid','${other}',false)`);
 assert.equal((await q('select count(*) n from public.actions'))[0].n,0);
 assert.equal((await q('select count(*) n from public.action_changes'))[0].n,0);
 await assert.rejects(q(`select public.undo_action('${other}',${n.action},false)`),/is not yours/);
 await db.exec('reset role');
 console.log('PASS journal permissions and cross-owner isolation');
 await db.exec(`select set_config('test.uid','${owner}',false)`);
 await db.exec(`update public.projects set status='archived' where id='${project}'`);
 const archive=await last(); await db.exec('set role authenticated');
 for(const t of ['projects','notes','cards'])assert.equal((await q('select count(*) n from public.'+t))[0].n,0);
 await undo(archive);
 assert.equal((await q('select count(*) n from public.projects'))[0].n,1);
 await db.exec('reset role'); console.log('PASS archive hides descendants; undo restores visibility');
 const planProject=(await q(`insert into public.projects(user_id,slug,subject_id,title,goal) values ('${owner}','source-coverage','22222222-2222-2222-2222-222222222222','Coverage','Study') returning id`))[0].id;
 const firstSource=(await q(`insert into public.sources(user_id,project_id,title,short) values ('${owner}','${planProject}','First','first') returning id`))[0].id;
 const initialPlan=(await q(`insert into public.proposals(user_id,project_id,kind,origin,payload) values ('${owner}','${planProject}','plan','other','{"checkpoints":[{"code":"CP1","title":"Start","objective":"Learn","criterion":"Explain","steps":["Try"]}]}') returning id`))[0].id;
 const laterSource=(await q(`insert into public.sources(user_id,project_id,title,short,created_at) select '${owner}','${planProject}','Later','later',created_at+interval '1 second' from public.proposals where id='${initialPlan}' returning id`))[0].id;
 await db.exec(`select public.approve_proposal('${initialPlan}')`); const planApproval=await last();
 assert.ok((await q(`select plan_checked_at from public.sources where id='${firstSource}'`))[0].plan_checked_at);
 assert.equal((await q(`select plan_checked_at from public.sources where id='${laterSource}'`))[0].plan_checked_at,null);
 await undo(planApproval);
 assert.equal((await q(`select plan_checked_at from public.sources where id='${firstSource}'`))[0].plan_checked_at,null);
 console.log('PASS initial plan marks only preexisting sources and undo restores them');
 await db.exec(`delete from public.projects where id='${planProject}'`);
 await db.exec(`insert into public.sources(user_id,project_id,title,short) values ('${owner}','${project}','Book','book')`);
 const diagnostic=(await q(`insert into public.diagnostics(user_id,project_id,kind,topic,evidence) values ('${owner}','${project}','material','New chapter','Attached') returning no`))[0].no;
 const prop=(await q(`insert into public.proposals(user_id,project_id,kind,origin,payload) values ('${owner}','${project}','plan_change','other','{"ops":[],"diagnostics":["D${diagnostic}"],"book":"book"}') returning id`))[0].id;
 assert.equal((await q('select status from public.diagnostics'))[0].status,'planned');
 await db.exec(`select public.reject_proposal('${prop}')`);
 assert.equal((await q('select status from public.diagnostics'))[0].status,'confirmed');
 const prop2=(await q(`insert into public.proposals(user_id,project_id,kind,origin,payload) values ('${owner}','${project}','plan_change','other','{"ops":[],"diagnostics":["D${diagnostic}"],"book":"book"}') returning id`))[0].id;
 await db.exec(`select public.approve_proposal('${prop2}')`);const approval=await last();
 assert.equal((await q('select status from public.diagnostics'))[0].status,'resolved');
 assert.ok((await q('select plan_checked_at from public.sources'))[0].plan_checked_at);
 await undo(approval);
 assert.equal((await q('select status from public.diagnostics'))[0].status,'planned');
 assert.equal((await q('select plan_checked_at from public.sources'))[0].plan_checked_at,null);
 console.log('PASS diagnostic planning, rejection, approval, book comparison and undo');
 const gap=(await q(`insert into public.diagnostics(user_id,project_id,kind,topic,evidence) values ('${owner}','${project}','gap','Prerequisite','Could not apply it') returning no`))[0].no;
 const bridge=(await q(`insert into public.proposals(user_id,project_id,kind,origin,payload) values ('${owner}','${project}','plan_change','other','{"ops":[{"op":"add","code":"CP1","title":"Bridge","objective":"Practice","criterion":"Solve","steps":["Try"]}],"diagnostics":["D${gap}"]}') returning id`))[0].id;
 await db.exec(`select public.approve_proposal('${bridge}')`);
 await db.exec(`update public.checkpoints set status='demonstrated' where project_id='${project}' and code='CP1'`);
 assert.equal((await q(`select status from public.diagnostics where no=${gap}`))[0].status,'resolved');
 await undo(await last());
 assert.equal((await q(`select status from public.diagnostics where no=${gap}`))[0].status,'planned');
 console.log('PASS bridge demonstration resolves diagnostics and is reversible');
 const source=(await q(`insert into public.sources(user_id,project_id,title,short) values ('${owner}','${project}','Generated fields','generated') returning id`))[0].id;
 await db.exec(`insert into public.source_pages(user_id,source_id,page,body) values ('${owner}','${source}',1,'Differentiation and integration')`);
 const page=(await q(`select * from public.source_pages where source_id='${source}'`))[0];
 await db.exec(`delete from public.sources where id='${source}'`);r=await undo(await last());
 const restored=(await q(`select * from public.source_pages where source_id='${source}'`))[0];
 assert.deepEqual(restored,page);
 await undo(r.as);assert.equal((await q(`select count(*) n from public.source_pages where source_id='${source}'`))[0].n,0);
 console.log('PASS composite PK and generated-column cascade restore and redo');
 await assert.rejects(db.exec(`update public.projects set prompt=repeat('x',1001) where id='${project}'`),/check constraint/);
 await db.exec(`insert into public.settings(user_id,master_prompt) values ('${owner}','Use LaTeX')`);
 await assert.rejects(db.exec(`update public.settings set master_prompt=repeat('x',2001) where user_id='${owner}'`),/check constraint/);
 await db.exec(`update public.settings set master_prompt='Be Socratic' where user_id='${owner}'`);
 await undo(await last());assert.equal((await q('select master_prompt from public.settings'))[0].master_prompt,'Use LaTeX');
 console.log('PASS prompt limits and reversible prompt edits');
 n=await note();await db.exec(`select set_config('test.uid','${other}',false); set role service_role`);
 r=await undo(n.action);assert.equal(r.undone,n.action);
 await assert.rejects(db.exec("update public.actions set summary='forged'"),/permission denied/);
 await assert.rejects(db.exec('delete from public.action_changes'),/permission denied/);
 await db.exec(`reset role;select set_config('test.uid','${owner}',false)`);
 console.log('PASS service-role undo and journal immutability');
 // FIX #606: two owners may have identical human-facing project names/slugs.
 // Project history is bound to the action owner *inside* the SQL view, not
 // inferred from a prefiltered action-number list supplied by the caller.
 const otherSubject='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
 const otherProject='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc';
 await db.exec(`insert into public.subjects(id,user_id,name,glyph,hue)
   values ('${otherSubject}','${other}','Analysis','A','amber')`);
 await db.exec(`insert into public.projects(id,user_id,slug,subject_id,title,goal)
   values ('${otherProject}','${other}','analysis','${otherSubject}','Analysis','Study')`);
 await db.exec(`insert into public.notes(user_id,project_id,front)
   values ('${owner}','${project}','Owner-only history'),
          ('${other}','${otherProject}','Other-only history')`);
 const ownerRows=await q(`select v.action_no,v.user_id from public.v_action_changes_owner v
   where v.user_id='${owner}' and
   (v.new->>'project_id'='${project}' or v.new->>'id'='${project}')
   order by v.id limit 500 offset 0`);
 const otherRows=await q(`select v.action_no,v.user_id from public.v_action_changes_owner v
   where v.user_id='${other}' and
   (v.new->>'project_id'='${otherProject}' or v.new->>'id'='${otherProject}')
   order by v.id limit 500 offset 0`);
 assert.ok(ownerRows.length>0 && otherRows.length>0);
 assert.ok(ownerRows.every(x=>x.user_id===owner));
 assert.ok(otherRows.every(x=>x.user_id===other));
 assert.equal(ownerRows.some(x=>otherRows.some(y=>x.action_no===y.action_no)),false);
 // Model the privileged connector's RLS-bypassing service role. An explicit
 // user_id predicate is still required to protect project-history pagination.
 await db.exec('alter role service_role bypassrls; set role service_role');
 const privileged=await q(`select distinct action_no,user_id from public.v_action_changes_owner
   where user_id='${owner}' and
   (new->>'project_id'='${project}' or new->>'id'='${project}')
   order by action_no limit 500 offset 0`);
 assert.ok(privileged.length>0 && privileged.every(x=>x.user_id===owner));
 assert.ok(privileged.every(x=>!otherRows.some(y=>y.action_no===x.action_no)));
 await db.exec('reset role; set role authenticated');
 await db.exec(`select set_config('test.uid','${other}',false)`);
 assert.equal((await q(`select count(*) n from public.v_action_changes_owner where user_id='${owner}'`))[0].n,0);
 assert.ok((await q(`select count(*) n from public.v_action_changes_owner where user_id='${other}'`))[0].n>0);
 await db.exec('reset role');
 const security=(await q(`select c.relrowsecurity from pg_class c
   where c.oid in ('public.actions'::regclass,'public.action_changes'::regclass)`));
 assert.equal(security.length,2);
 assert.ok(security.every(x=>x.relrowsecurity===true));
 assert.equal((await q(`select has_table_privilege('anon','public.v_action_changes_owner','SELECT') allowed`))[0].allowed,false);
 assert.ok(String((await q(`select reloptions from pg_class where oid='public.v_action_changes_owner'::regclass`))[0].reloptions).includes('security_invoker=true'));
 await db.exec('begin; drop view public.v_action_changes_owner; rollback;');
 assert.ok((await q('select count(*) n from public.v_action_changes_owner'))[0].n>0);
 console.log('PASS owner-joined history isolation, service-role owner filter, RLS and transactional migration rollback');
} finally {await db.close();}
