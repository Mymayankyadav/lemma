// N38: complete existing-table version/provenance acceptance in fresh PGlite.
// No production Supabase connection; all migrations are read from this checkout.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
const dir=new URL('../../../supabase/migrations/',import.meta.url);
const tables=['settings','subjects','projects','sources','source_pages','concepts',
 'checkpoints','styles','notes','cards','proposals','card_comments','diagnostics','misconceptions'];
const hasUpdated=['settings','projects','checkpoints','notes'];
let records=null, journalBefore=null;

const create=async(sql,args)=>(await query(sql,args))[0];
async function seedHistoricalAccount(){
 await query('insert into auth.users(id) values($1)',[owner]);
 await query('insert into public.settings(user_id) values($1)',[owner]);
 const subject=await create("insert into public.subjects(user_id,name,glyph,hue) values($1,'Algebra','∑','amber') returning id",[owner]);
 const project=await create("insert into public.projects(user_id,subject_id,slug,title,goal) values($1,$2,'proof-path','Proof path','Prove lemmas') returning id",[owner,subject.id]);
 const source=await create("insert into public.sources(user_id,project_id,title,short) values($1,$2,'Lecture notes','NOTES') returning id",[owner,project.id]);
 await query("insert into public.source_pages(user_id,source_id,page,body) values($1,$2,1,'Proof of the lemma')",[owner,source.id]);
 const concept=await create("insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,'limits','Limits') returning id",[owner,subject.id]);
 const checkpoint=await create("insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,'CP1',1,'Prove theorem','Understand','Show proof',jsonb_build_array('Read proof')) returning id",[owner,project.id]);
 await query("insert into public.styles(user_id,key,name,icon,instructions) values($1,'socratic','Socratic','?','Ask why')",[owner]);
 const note=await create("insert into public.notes(user_id,project_id,front,back) values($1,$2,'State a theorem','Proof') returning id",[owner,project.id]);
 const card=await create("insert into public.cards(user_id,note_id,ord) values($1,$2,1) returning id",[owner,note.id]);
 const proposal=await create("insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'card',$3::jsonb,'chatgpt') returning id",[owner,project.id,JSON.stringify({front:'State a theorem',back:'Proof'})]);
 const comment=await create("insert into public.card_comments(user_id,note_id,body) values($1,$2,'Please show a complete proof') returning id",[owner,note.id]);
 const diagnostic=await create("insert into public.diagnostics(user_id,project_id,kind,topic,evidence) values($1,$2,'gap','Proof step','Missing justification') returning id",[owner,project.id]);
 const misconception=await create("insert into public.misconceptions(user_id,project_id,label) values($1,$2,'Confusing implication and converse') returning id",[owner,project.id]);
 records={
  settings:{where:'user_id=$1',args:[owner]},
  subjects:{where:'id=$1',args:[subject.id]},
  projects:{where:'id=$1',args:[project.id]},
  sources:{where:'id=$1',args:[source.id]},
  source_pages:{where:'source_id=$1 and page=1',args:[source.id]},
  concepts:{where:'id=$1',args:[concept.id]},
  checkpoints:{where:'id=$1',args:[checkpoint.id]},
  styles:{where:'user_id=$1 and key=$2',args:[owner,'socratic']},
  notes:{where:'id=$1',args:[note.id]},
  cards:{where:'id=$1',args:[card.id]},
  proposals:{where:'id=$1',args:[proposal.id]},
  card_comments:{where:'id=$1',args:[comment.id]},
  diagnostics:{where:'id=$1',args:[diagnostic.id]},
  misconceptions:{where:'id=$1',args:[misconception.id]},
 };
 assert.equal(Object.keys(records).length,14);
 journalBefore=(await query('select count(*)::int n from public.action_changes'))[0].n;
}
const record=async(table)=>{
 const {where,args}=records[table];
 const rows=await query('select version,updated_source,updated_at from public.'+table+' where '+where,args);
 assert.equal(rows.length,1,'one row for '+table);
 return rows[0];
};
try {
 await db.exec([
  'create role anon; create role authenticated; create role service_role;',
  'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const files=(await readdir(dir)).filter(name=>name.endsWith('.sql')&&!name.includes('_storage')).sort();
 const versionFile='20261106201000_record_versions.sql';
 assert.ok(files.includes(versionFile),'N38 migration must be present');
 for(const file of files){
  if(file===versionFile)await seedHistoricalAccount();
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 }
 assert.ok(records&&journalBefore!==null,'historical fixture inserted before N38');
 // DDL alone creates no owner actions or writes any existing account row.
 assert.equal((await query('select count(*)::int n from public.action_changes'))[0].n,journalBefore);
 for(const table of tables){
  const row=await record(table);
  assert.equal(row.version,1,table+' historical version starts at 1');
  assert.equal(row.updated_source,null,table+' historical actor is not invented');
  assert.ok(row.updated_at,table+' timestamp exists');
 }
 const targetList=tables.map(table=>"'"+table+"'").join(',');
 const alreadyUpdatedList=hasUpdated.map(table=>"'"+table+"'").join(',');
 const columns=await query("select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ("+targetList+") and column_name in ('version','updated_source','updated_at')");
 assert.equal(columns.length,42);
 const triggers=await query("select c.relname as table_name,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ("+targetList+") and t.tgname='z_record_version'");
 assert.equal(triggers.length,14);
 const existingTouch=await query("select c.relname as table_name from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ("+alreadyUpdatedList+") and t.tgname='touch_updated_at'");
 assert.deepEqual(existingTouch.map(row=>row.table_name).sort(),[...hasUpdated].sort());

 await query("select set_config('lemma.source','chatgpt',false)");
 for(const table of tables){
  const old=await record(table);
  const {where,args}=records[table];
  // A caller's attempt to set version=999 is always replaced by OLD+1.
  await query('update public.'+table+' set version=999 where '+where,args);
  const updated=await record(table);
  assert.equal(updated.version,2,table+' increments once on UPDATE');
  assert.equal(updated.updated_source,'mcp',table+' attributes chat writes to MCP');
  assert.ok(new Date(updated.updated_at).getTime()>=new Date(old.updated_at).getTime(),
   table+' refreshes the timestamp');
 }
 // Existing actions.source allows 'system' for background writes; N38 maps
 // that unchanged journal source to the 'worker' record provenance category.
 // 'worker' is not a valid actions.source value, so using it here would
 // violate the pre-existing action journal constraint before N38 is tested.
 await query("select set_config('lemma.source','system',false)");
 await query('update public.subjects set name=name where id=$1',records.subjects.args);
 assert.deepEqual({version:(await record('subjects')).version,source:(await record('subjects')).updated_source},
  {version:3,source:'worker'});
 await query("select set_config('lemma.source','',false)");
 await query('update public.projects set title=title where id=$1',records.projects.args);
 assert.deepEqual({version:(await record('projects')).version,source:(await record('projects')).updated_source},
  {version:3,source:'app'});

 // The existing connector transaction accepts its unchanged envelope and
 // writes one higher version. The original undo RPC still works afterward.
 await db.exec('set role service_role');
 const result=(await query('select public.mcp_commit($1::uuid,$2,$3,$4,$5::jsonb) receipt',
  [owner,'study','chatgpt','Update subject',JSON.stringify([{op:'update',table:'subjects',
   where:{id:records.subjects.args[0]},values:{name:'Updated algebra'}}])]
 ))[0].receipt;
 assert.ok(Number.isSafeInteger(result.action)&&result.action>0);
 await db.exec('reset role');
 const connector=await record('subjects');
 assert.equal(connector.version,4);
 assert.equal(connector.updated_source,'mcp');
 assert.equal((await query('select name from public.subjects where id=$1',records.subjects.args))[0].name,'Updated algebra');
 // A separate transaction can undo connector changes without rewriting
 // journal or function definitions; the version still moves forward.
 await db.exec('set role service_role');
 await query('select public.undo_action($1::uuid,$2::bigint,false)',[owner,result.action]);
 await db.exec('reset role');
 assert.equal((await query('select name from public.subjects where id=$1',records.subjects.args))[0].name,'Algebra');
 assert.equal((await record('subjects')).version,5);
 console.log('PASS N38 fourteen historical records, exact updates, actor provenance, existing MCP and undo');
}finally{await db.close();}
