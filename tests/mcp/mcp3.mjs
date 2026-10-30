// Deterministic ETA and dynamic field validation acceptance.
import assert from 'node:assert/strict';
import {goalEta} from '../../supabase/functions/mcp/derive.ts';
import {planningFields} from '../../supabase/functions/mcp/planning.ts';
const now=Date.parse('2026-10-30T12:00:00Z');
const cp=(at,status='demonstrated')=>({status,demonstrated_at:at});
assert.equal(goalEta({},[cp(null,'not_started')],now),' | finish ≈ 27 Nov');
assert.equal(goalEta({target_date:'2027-01-15',target_label:'Prelim'},[],now),' | Prelim 15 Jan');
assert.equal(goalEta({},[cp('2026-10-29'),cp('2026-10-28'),cp(null,'not_started')],now),' | finish ≈ 13 Nov');
assert.equal(goalEta({},[cp('2026-10-01'),cp('2026-10-31'),cp(null,'not_started')],now),' | finish ≈ 27 Nov');
assert.equal(goalEta({},[cp('2026-10-29')],now),' | complete');
for(const v of [{stage:'x'.repeat(41)},{topic:4},{target_label:'x'.repeat(21)},{target_date:'2027-02-29'},{target_date:'bad'}])assert.throws(()=>planningFields(v));
for(const v of [{stage:null,topic:'Topology'},{target_date:'2028-02-29'},{target_date:null,target_label:null}])planningFields(v);
console.log('PASS MCP-3 throughput boundaries, minimum pace, complete/empty plans, target and validation');

// Real approval RPCs must retain fields and remain atomic/undoable.
const {readFile,readdir}=await import('node:fs/promises');
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();const owner='11111111-1111-1111-1111-111111111111';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select '${owner}'::uuid$$;create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;insert into auth.users values('${owner}');`);
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(folder)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())await db.exec(await readFile(new URL(f,folder),'utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const sub=(await q(`insert into public.subjects(user_id,name,glyph,hue) values($1,'Metadata','M','amber') returning id`,[owner]))[0].id;
 const p=(await q(`insert into public.projects(user_id,subject_id,slug,title,goal) values($1,$2,'metadata','Metadata','Learn') returning id`,[owner,sub]))[0].id;
 const proposal=async(kind,payload)=>(await q(`insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,$3,$4,'other') returning id`,[owner,p,kind,JSON.stringify(payload)]))[0].id;
 const cp={code:'CP1',title:'Test',objective:'Think',criterion:'Prove',steps:['Prove'],stage:'Foundations'};
 const id=await proposal('plan',{checkpoints:[cp],concepts:[{name:'Cover',topic:'Topology'}]});
 assert.equal((await q('select count(*)::int n from public.checkpoints'))[0].n,0);
 await q('select public.approve_proposal($1)',[id]);
 assert.equal((await q('select stage from public.checkpoints'))[0].stage,'Foundations');
 assert.equal((await q('select topic from public.concepts'))[0].topic,'Topology');
 const change=await proposal('plan_change',{ops:[{op:'update',code:'CP1',stage:'Revised'},{...cp,op:'add',code:'CP2',stage:'Bridge'}]});
 await q('select public.approve_proposal($1)',[change]);
 assert.deepEqual((await q('select stage from public.checkpoints order by code')).map(x=>x.stage),['Revised','Bridge']);
 const action=(await q('select max(no) n from public.actions'))[0].n;
 await q('select public.undo_action($1,$2,false)',[owner,action]);
 assert.deepEqual((await q('select stage from public.checkpoints')).map(x=>x.stage),['Foundations']);
 const invalid=await proposal('plan_change',{ops:[{op:'update',code:'CP1',stage:'Changed'},{...cp,op:'add',code:'CP2',stage:'x'.repeat(41)}]});
 await assert.rejects(q('select public.approve_proposal($1)',[invalid]),/check constraint/);
 assert.equal((await q('select stage from public.checkpoints'))[0].stage,'Foundations');
 assert.equal((await q('select status from public.proposals where id=$1',[invalid]))[0].status,'pending');
 console.log('PASS MCP-3 approved stage/topic persistence, add/update, undo and atomic invalid-field rollback');
}finally{await db.close();}
