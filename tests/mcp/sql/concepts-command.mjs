// N105.1 graph mutation and journal; executes the entire migration series.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const subject='33333333-3333-4333-8333-333333333333';
const otherSubject='44444444-4444-4444-8444-444444444444';
const op=i=>'aaaa0000-0000-4000-8000-'+String(i).padStart(12,'0');
let serial=0;
const req=(operation,target={},patch={},expectedVersion)=>({
 schemaVersion:1,resource:'concepts',operation,operationId:op(++serial),
 target,patch,...(expectedVersion===undefined?{}:{expectedVersion})
});
const command=async p=>(await q('select public.concepts_command($1::jsonb) result',[JSON.stringify(p)]))[0].result;
const actor=async owner=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
};
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
 "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
 "create function auth.uid() returns uuid language sql as $id$ "+
 "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $id$;"+
 "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;"+
 "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert(files.includes('20261120120000_concepts_command.sql'));
 for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[a,b]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[a,'a'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[b,'b'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,a]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Foreign','F','cyan')",[otherSubject,b]);
 await actor(a);
 const make=async(name,sub=subject)=>command(req('create',{}, {subject_id:sub,name}));
 const first=await make('First');
 assert.equal(first.status,'ok');assert(first.actionNo>0);
 const second=await make('Second');
 const third=await make('Third');
 const [one,two,three]=[first,second,third].map(x=>x.concept.id);
 const replay=req('update',{id:one},{name:'Renamed'},1);
 assert.equal((await command(replay)).status,'ok');
 const action=await command(replay);assert.equal(action.status,'ok');
 assert.equal(action.actionNo,(await command(replay)).actionNo);
 assert.equal((await command({...replay,patch:{name:'Changed payload'}})).status,'conflict');
 assert.equal((await command(req('update',{id:one},{blurb:'Older write'},1))).status,'conflict');
 await command(req('reparent',{id:two},{parent_id:one},1));
 await assert.rejects(command(req('reparent',{id:one},{parent_id:two},2)),/cycle/);
 const link=await command(req('link',{id:one},{other_id:two,kind:'prereq'},2));
 assert.equal(link.status,'ok');
 await assert.rejects(command(req('link',{id:two},{other_id:one,kind:'prereq'},2)),/cycle/);
 const project='55555555-5555-4555-8555-555555555555';
 await db.exec('reset role');
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'project-one','Research','Learn')",
  [project,a,subject]);
 const note=(await q("insert into public.notes(user_id,project_id,concept_id,front,back) values($1,$2,$3,'Graph of ideas','Explanation') returning id",
  [a,project,two]))[0].id;
 const card=(await q("insert into public.cards(user_id,note_id,ord) values($1,$2,1) returning id",
  [a,note]))[0].id;
 await actor(a);
 const view=await command(req('preview_merge',{id:two},{keep_id:three}));
 assert.equal(view.status,'ok');assert.equal(view.impact.incomingPrerequisites,1);
 const current=await q('select id,version from public.concepts where id=$1',[three]);
 const merged=await command(req('merge',{id:two},{keep_id:three,keep_version:current[0].version},2));
 assert.equal(merged.status,'ok');assert(merged.actionNo>0);
 assert.equal((await q('select count(*)::int n from public.concepts where id=$1',[two]))[0].n,0);
 const moved=await q('select count(*)::int n from public.concept_links where from_id=$1 and to_id=$2',[one,three]);
 assert.equal(moved[0].n,1);
 assert.equal((await q('select concept_id from public.notes where id=$1',[note]))[0].concept_id,three);
 assert.equal((await q('select note_id from public.cards where id=$1',[card]))[0].note_id,note);
 const undone=(await q('select public.undo_action($1,$2) result',[a,merged.actionNo]))[0].result;
 assert(undone.changes>0,'merge must undo as a single journalled action');
 assert.equal((await q('select count(*)::int n from public.concepts where id=$1',[two]))[0].n,1,
  'undo restores the original concept');
 assert.equal((await q('select concept_id from public.notes where id=$1',[note]))[0].concept_id,two,
  'undo restores notes without removing their existing cards');
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[b]);
 await db.exec('set role authenticated');
 await assert.rejects(command(req('update',{id:one},{name:'Foreign takeover'},3)),/not found for owner/);
 await assert.rejects(make('Cannot use foreign subject',subject),/foreign key|violates|permission/);
 await db.exec('reset role');
 const registry=(await q("select command_fn from public.lemma_command_resources where resource='concepts'"))[0];
 assert.equal(registry.command_fn,'concepts_command');
 // Registered MCP dispatch must use the identical owner-bound command path.
 const current=(await q('select version from public.concepts where id=$1',[three]))[0].version;
 await db.exec('set role service_role');
 const mcpReq=req('update',{id:three},{blurb:'Edited through MCP'},current);
 const mcp=(await q('select public.mcp_command($1,$2,$3::jsonb) result',
  [a,'chatgpt',JSON.stringify(mcpReq)]))[0].result;
 assert.equal(mcp.status,'ok');assert(mcp.actionNo>0);
 await db.exec('reset role');
 assert.equal((await q('select blurb from public.concepts where id=$1',[three]))[0].blurb,
  'Edited through MCP');
 const receiptCount=(await q("select count(*)::int n from public.command_receipts where resource='concepts'"))[0].n;
 assert(receiptCount>4,'each accepted mutation uses command receipt');
 console.log('PASS N105.1 owner graph create/update/reparent/link/merge/receipt/cycle and MCP registry');
}finally{await db.close()}
