// N170: item registration through save_progress, assumptions, aliases, privileges, undo, and the down script (up → down → up).
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const U=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [subject,project,cp,sess,cA,cB]=[1,2,3,4,5,6].map(U);
const root=async()=>{await db.exec('reset role');await q("select set_config('test.uid','',false)")};
const as=async who=>{await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[who]);await db.exec('set role authenticated')};
const progress=async payload=>{await root();return (await q('select public.save_progress($1,$2,$3,$4::jsonb) r',[owner,project,sess,JSON.stringify(payload)]))[0].r};
const shape=async()=>q(`select 'col' k,table_name||'.'||column_name x from information_schema.columns where table_schema='public'
  union all select 'fn',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all select 'tbl',tablename from pg_tables where schemaname='public' order by 1,2`);
try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions; create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 const mine=names.filter(n=>n.startsWith('20261217')&&n.includes('_n170_'));
 assert.equal(mine.length,2);
 for(const n of names.filter(x=>!mine.includes(x)))await db.exec(await readFile(new URL(n,dir),'utf8'));
 const before=await shape();
 await q('insert into auth.users(id) values($1)',[owner]);
 await q("insert into public.settings(user_id,connector_secret,flags) values($1,$2,'{\"recheck_v2\":true,\"items\":true}')",[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'topo','T','G')",[project,owner,subject]);
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'compactness','Compactness'),($4,$2,$3,'hausdorff','Hausdorff')",[cA,owner,subject,cB]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,$3,'CP1',1,'T','O','C','[\"a\"]')",[cp,owner,project]);
 await q("insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values($1,$2,$3)",[owner,cp,cA]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'g','s',$4)",[sess,owner,project,cp]);
 const dataBefore=await shape();
 for(const n of mine)await db.exec(await readFile(new URL(n,dir),'utf8'));
 const up=await shape();
 // --- a posed item is registered once per fingerprint and linked to its evidence
 await progress({events:[{kind:'attempt',text:'tried',outcome:'failed',concept:'compactness',item:'Prove that [0,1] is compact.',fp:'1f-abc123'}]});
 await progress({events:[{kind:'attempt',text:'again',outcome:'demonstrated',concept:'compactness',item:'Prove that [0,1] is compact.',fp:'1f-abc123'}]});
 const items=await q('select * from public.items');
 assert.equal(items.length,1,'the same question is one item');
 assert.deepEqual([items[0].origin,items[0].created_by,items[0].status,items[0].holdout,items[0].b,items[0].b_n],['tutor_generated','tutor','active',false,0,0]);
 assert.deepEqual(items[0].concept_tags,[{concept_id:cA,level:'use',role:'primary'}]);
 const ev=await q('select item_id,ctx from public.evidence order by id');
 assert.deepEqual(ev.map(e=>e.item_id),[items[0].id,items[0].id]);assert.equal(ev[0].ctx.fp,'1f-abc123');
 await progress({events:[{kind:'attempt',text:'no item',outcome:'demonstrated',concept:'compactness'}]});
 assert.equal((await q('select count(*)::int n from public.items'))[0].n,1,'an event without an item registers none');
 await progress({events:[{kind:'attempt',text:'bad fp',outcome:'demonstrated',concept:'compactness',item:'x',fp:'a'}]});
 assert.equal((await q('select count(*)::int n from public.items'))[0].n,1,'a malformed fingerprint registers none');
 await q("update public.settings set flags='{\"recheck_v2\":true}'");
 await progress({events:[{kind:'attempt',text:'flag off',outcome:'demonstrated',concept:'compactness',item:'Other question',fp:'ff-zzz999'}]});
 assert.equal((await q('select count(*)::int n from public.items'))[0].n,1,'with the items flag off nothing is registered');
 // --- the item journal is undoable
 await q("update public.settings set flags='{\"recheck_v2\":true,\"items\":true}'");
 await progress({events:[{kind:'attempt',text:'new q',outcome:'demonstrated',concept:'compactness',item:'A brand new question',fp:'2a-new001'}]});
 const act=Number((await q('select max(no) n from public.actions'))[0].n);
 await as(owner);await q('select public.undo_action($1,$2,false)',[owner,act]);await root();
 assert.equal((await q('select count(*)::int n from public.items'))[0].n,1,'undo removes the item with its evidence');
 // --- constraints and privileges
 await root();
 await assert.rejects(q("insert into public.concept_aliases(user_id,concept_a,concept_b) values($1,$2,$3)",[owner,cB,cA]),/concept_aliases_ordered|violates/);
 await q("insert into public.concept_aliases(user_id,concept_a,concept_b) values($1,$2,$3)",[owner,cA<cB?cA:cB,cA<cB?cB:cA]);
 await q("insert into public.assumptions(user_id,concept_id,level) values($1,$2,'recall')",[owner,cA]);
 await assert.rejects(q("insert into public.assumptions(user_id,concept_id,level) values($1,$2,'recall')",[owner,cA]),/assumptions_one_active|unique/);
 await q("update public.assumptions set revoked_at=now()");
 await q("insert into public.assumptions(user_id,concept_id,level) values($1,$2,'recall')",[owner,cA]);                   // a revoked one no longer blocks a new one
 await assert.rejects(q("insert into public.items(user_id,origin,text,fingerprint,status) values($1,'template','t','fp1','weird')",[owner]),/items_status_valid/);
 await assert.rejects(q("update public.projects set learning_profile='[1]'::jsonb"),/learning_profile_object/);
 await as(owner);
 for(const t of ['items','assumptions','concept_aliases','worker_runs'])
  assert.deepEqual((await q("select has_table_privilege('authenticated',$1,'INSERT') i,has_table_privilege('authenticated',$1,'UPDATE') u,has_table_privilege('authenticated',$1,'DELETE') d,has_table_privilege('authenticated',$1,'TRUNCATE') t,has_table_privilege('anon',$1,'INSERT') ai",['public.'+t]))[0],{i:false,u:false,d:false,t:false,ai:false},t);
 await root();
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name in ('items','assumptions','concept_aliases')"))[0].n,3);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='worker_runs'"))[0].n,0,'telemetry is a log, not a fact');
 // --- down script: removes exactly N170 and restores the N169 save_progress
 await q("delete from public.concept_aliases");await q("delete from public.assumptions");
 await db.exec(await readFile(new URL('../../../supabase/rollback/N170.down.sql',import.meta.url),'utf8'));
 const after=await shape();
 const gone=up.filter(x=>!after.some(y=>y.k===x.k&&y.x===x.x)).map(x=>x.x);
 assert.ok(gone.some(x=>x.startsWith('items.')),'items removed');assert.ok(!after.some(x=>x.x==='projects.learning_profile'));
 assert.deepEqual(after.filter(x=>!before.some(y=>y.k===x.k&&y.x===x.x)),[],'nothing of N170 is left');assert.deepEqual(before.filter(x=>!after.some(y=>y.k===x.k&&y.x===x.x)),[],'nothing of N169 was removed');
 for(const n of mine)await db.exec(await readFile(new URL(n,dir),'utf8'));
 assert.deepEqual(await shape(),up,'up → down → up gives the same schema');
 console.log('PASS N170 items, assumptions, aliases, privileges, undo and rollback');
}finally{await db.close()}
