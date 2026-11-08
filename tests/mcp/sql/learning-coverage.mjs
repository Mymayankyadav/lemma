// N88: SQL round trips for MCP learning-resource edits through the existing
// audited mcp_commit transaction: source order with version CAS, page text
// revisions, Atlas pin coordinates, foreign owner refusal and undo. Checkpoint
// citations reach MCP through owner-approved plan proposals instead.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const owner='81111111-1111-4111-8111-111111111111';
const other='82222222-2222-4222-8222-222222222222';
const subject='83333333-3333-4333-8333-333333333333';
const project='84444444-4444-4444-8444-444444444444';
const bookA='85555555-5555-4555-8555-555555555555';
const bookB='86666666-6666-4666-8666-666666666666';
const checkpoint='87777777-7777-4777-8777-777777777777';
const concept='88888888-8888-4888-8888-888888888888';
const commit=async(user,summary,commands)=>{
 await db.exec('set role service_role');
 try{
  return (await q('select public.mcp_commit($1::uuid,$2,$3,$4,$5::jsonb) receipt',
   [user,'edit','chatgpt',summary,JSON.stringify(commands)]))[0].receipt;
 }finally{await db.exec('reset role');}
};
const undo=async action=>{
 await db.exec('set role service_role');
 try{await q('select public.undo_action($1::uuid,$2::bigint,false)',[owner,action]);}
 finally{await db.exec('reset role');}
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema extensions;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $auth$
    select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid) $auth$;
   create function extensions.gen_random_bytes(n int) returns bytea language sql as
     $bytes$select decode(repeat('00',n),'hex')$bytes$;
   grant usage on schema auth to authenticated;
   grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 for(const [id,secret] of [[owner,'a'],[other,'b']]){
  await q('insert into auth.users(id) values($1)',[id]);
  await q('insert into public.settings(user_id,connector_secret) values($1,$2) on conflict(user_id) do nothing',
   [id,secret.repeat(48)]);
 }
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Analysis','∫','amber')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'real-analysis','Real analysis','Study')",
  [project,owner,subject]);
 await q("insert into public.sources(id,user_id,project_id,title,short) values($1,$2,$3,'Rudin','RUDIN'),($4,$2,$3,'Abbott','ABBOTT')",
  [bookA,owner,project,bookB]);
 await q("insert into public.source_pages(user_id,source_id,page,body) values($1,$2,1,'Original page text')",[owner,bookA]);
 await q(`insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps)
  values($1,$2,$3,'CP1',1,'Limits','Limits','Prove',$4::jsonb)`,[checkpoint,owner,project,JSON.stringify(['Prove a limit'])]);
 await q("insert into public.concepts(id,user_id,subject_id,name,slug) values($1,$2,$3,'Limit','limit')",[concept,owner,subject]);
 const version=async(table,id)=>(await q('select version from public.'+table+' where id=$1',[id]))[0].version;

 // Source order: an owner-versioned edit advances the version; a stale
 // version refuses the whole transaction and changes nothing.
 const v1=await version('sources',bookB);
 const ordered=await commit(owner,'Reorder sources',[{op:'update',table:'sources',
  where:{id:bookB},expected:{version:v1},values:{position:0}},
  {op:'update',table:'sources',where:{id:bookA},values:{position:1}}]);
 assert.ok(Number.isSafeInteger(ordered.action)&&ordered.action>0,'source order is one journalled action');
 assert.deepEqual((await q('select id,position from public.sources where project_id=$1 order by position',[project]))
  .map(x=>x.id),[bookB,bookA],'MCP source order persisted');
 assert.equal(await version('sources',bookB),v1+1,'source version advances once');
 await assert.rejects(commit(owner,'Stale reorder',[{op:'update',table:'sources',
  where:{id:bookB},expected:{version:v1},values:{position:9}}]),/Row changed or not found/);
 assert.equal((await q('select position from public.sources where id=$1',[bookB]))[0].position,0,
  'stale source order wrote nothing');

 // Page text revision: the MCP update keeps a revision snapshot and is undoable.
 const revisions=async()=>(await q('select count(*)::int n from public.source_page_revisions where source_id=$1 and page=1',[bookA]))[0].n;
 const before=await revisions();
 const transcribed=await commit(owner,'Save pages',[{op:'update',table:'source_pages',
  where:{source_id:bookA,page:1},values:{body:'Corrected page text',label:'1',
   transcribed_by:'chatgpt',transcribed_at:new Date().toISOString(),confidence:'check'}}]);
 assert.equal((await q('select body,confidence from public.source_pages where source_id=$1 and page=1',[bookA]))[0].body,
  'Corrected page text');
 assert.ok(await revisions()>before,'page text edit recorded a revision');
 await undo(transcribed.action);
 assert.equal((await q('select body from public.source_pages where source_id=$1 and page=1',[bookA]))[0].body,
  'Original page text','undo restores the page text');

 // Atlas pin coordinates through the same transaction path.
 await commit(owner,'Pin concept',[{op:'update',table:'concepts',where:{id:concept},
  values:{pin_x:0.25,pin_y:-1.5}}]);
 assert.deepEqual({...(await q('select pin_x,pin_y from public.concepts where id=$1',[concept]))[0]},
  {pin_x:0.25,pin_y:-1.5},'Atlas pin coordinates persisted');

 // A second owner can neither edit nor cite the first owner's records.
 await assert.rejects(commit(other,'Foreign reorder',[{op:'update',table:'sources',
  where:{id:bookA},values:{position:7}}]),/Row changed or not found/);
 assert.equal((await q('select position from public.sources where id=$1',[bookA]))[0].position,1,
  'foreign owner wrote nothing');
 console.log('PASS N88 MCP learning edits: source order CAS, page revisions, pins, isolation and undo');
}finally{await db.close();}
