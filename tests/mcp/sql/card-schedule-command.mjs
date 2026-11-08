// N104 full migration regression: owner, receipt retry, undo and MCP parity.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
let serial=0;
const request=(operation,noteNo,ord,patch={})=>({
 schemaVersion:1,resource:'card_schedule',operation,
 operationId:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(++serial).padStart(12,'0'),
 target:{noteNo,ord},patch});
const as=async(owner,role='authenticated')=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role '+role);
};
try{
 await db.exec([
 'create role anon;create role authenticated;create role service_role;',
 'create schema auth;create schema extensions;create table auth.users(id uuid primary key);',
 "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
 "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
 'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert(files.includes('20261120010000_card_schedule_command.sql'));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[a,b]);
 const makeOwner=async(id,label)=>{
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[id,'a'.repeat(48)]);
  const subject=(await q("insert into public.subjects(user_id,name,glyph,hue) values($1,$2,'M','cyan') returning id",[id,label]))[0].id;
  const project=(await q("insert into public.projects(user_id,subject_id,slug,title,goal) values($1,$2,$3,$4,'Study') returning id",[id,subject,label.toLowerCase(),label]))[0].id;
  const note=(await q("insert into public.notes(user_id,project_id,front,back) values($1,$2,'Q','A') returning id,no",[id,project]))[0];
  await q("insert into public.cards(user_id,note_id,ord,state,stability,difficulty,reps) values($1,$2,1,2,3,4,5)",[id,note.id]);
  await q("insert into public.cards(user_id,note_id,ord) values($1,$2,2)",[id,note.id]);
  return note.no;
 };
 const first=await makeOwner(a,'Math'),second=await makeOwner(b,'Topology');
 const card=async(no,ord)=>(await q(
  'select c.* from public.cards c join public.notes n on n.id=c.note_id where n.user_id=$1 and n.no=$2 and c.ord=$3',[a,no,ord]))[0];
 const initial=await card(first,1),sibling=await card(first,2);
 assert.equal(initial.state,2);
 await as(a);
 const act=async(p)=>(await q('select public.card_schedule_command($1::jsonb) result',[JSON.stringify(p)]))[0].result;
 const due='2026-12-01T12:30:00Z';
 const req=request('reschedule',first,1,{due});
 const res=await act(req);
 assert.equal(res.status,'ok');
 assert.ok(res.actionNo>0);
 assert.equal(new Date((await card(first,1)).due).toISOString(),'2026-12-01T12:30:00.000Z');
 assert.equal((await card(first,1)).stability,3,'reschedule preserves stability');
 assert.equal((await card(first,1)).state,2,'reschedule preserves scheduler state');
 assert.deepEqual(await act(req),res,'identical operation ID replays exact receipt');
 assert.equal((await act({...req,patch:{due:'2026-12-05T12:30:00Z'}})).status,'conflict');
 assert.deepEqual(await card(first,2),sibling,'reschedule touches exact sibling only');
 await assert.rejects(act(request('reset',second,1)),/Card not found for owner/);
 await assert.rejects(act(request('reschedule',first,1,{due:'2026-12-01T12:30:00'})),/offset-aware/);
 await assert.rejects(act(request('reset',first,1,{state:0})),/Reset does not accept/);
 const reset=await act(request('reset',first,1));
 assert.equal(reset.status,'ok');
 let row=await card(first,1);
 assert.equal(row.state,0);
 assert.equal(row.stability,0);
 assert.equal(row.difficulty,0);
 assert.equal(row.reps,0);
 assert.equal(row.lapses,0);
 assert.equal(row.last_review,null);
 const afterReset=row.due;
 assert.ok(Number.isFinite(Date.parse(afterReset)));
 await q('select public.undo_action($1,$2,false)',[a,reset.actionNo]);
 row=await card(first,1);
 assert.equal(row.state,2,'undo restores previous schedule state');
 assert.equal(row.stability,3);
 assert.equal(new Date(row.due).toISOString(),'2026-12-01T12:30:00.000Z');
 await q('select public.undo_action($1,$2,false)',[a,res.actionNo]);
 assert.equal(new Date((await card(first,1)).due).toISOString(),
  new Date(initial.due).toISOString(),'undo restores pre-reschedule due');
 // Direct authenticated caller cannot forge an operation for another owner.
 await as(b);
 await assert.rejects(act(request('reset',first,1)),/Card not found for owner/);
 assert.equal((await q('select count(*)::int n from public.cards where user_id=$1',[b]))[0].n,2);
 // The service-role MCP dispatcher invokes the same owner/receipt command.
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 const mcp=request('reschedule',first,2,{due:'2026-12-12T07:00:00Z'});
 const executed=(await q('select public.mcp_command($1,$2,$3::jsonb) result',
  [a,'chatgpt',JSON.stringify(mcp)]))[0].result;
 assert.equal(executed.status,'ok');
 assert.deepEqual((await q('select public.mcp_command($1,$2,$3::jsonb) result',
  [a,'chatgpt',JSON.stringify(mcp)]))[0].result,executed,'MCP exact retry idempotent');
 await db.exec('reset role');
 assert.equal((await q('select source from public.actions where no=$1',[executed.actionNo]))[0].source,'chatgpt');
 assert.equal(new Date((await card(first,2)).due).toISOString(),'2026-12-12T07:00:00.000Z');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='card_schedule'"))[0].n,1);
 console.log('PASS N104 owner card schedule, exact replay, sibling isolation, undo and MCP');
}finally{await db.close()}
