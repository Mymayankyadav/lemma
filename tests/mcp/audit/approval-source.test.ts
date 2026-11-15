// @vitest-environment node
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';
import {savePages} from '../../../supabase/functions/mcp/tools/transcribe';
import {source as resolveSource,project as resolveProject} from '../../../supabase/functions/mcp/resolve';
import {counts} from '../../../supabase/functions/mcp/packet';
import {proposePlanChange} from '../../../supabase/functions/mcp/tools/write';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/pdf/ingest',()=>({ingest:vi.fn()}));
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>null}));

let db:any,owner:string,subject:string,project:string,fake:any;
let loseNoteUpdateResponse=false,deleteProjectDuringExport=false;
const q=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows;
async function as(id:string){await db.exec('reset role');await q("select set_config('request.jwt.claims','',false)");await q("select set_config('test.uid',$1,false)",[id]);await db.exec('set role authenticated');}
async function admin(){await db.exec('reset role');}
async function rpc(sql:string,args:unknown[]=[]){return (await q(sql,args))[0].r;}
const context=()=>({db:fake,userId:owner,batch:[] as any[]});
async function commit(c:ReturnType<typeof context>){
 await db.exec('set role service_role');
 try{return await rpc("select public.mcp_commit($1,'save_pages','chatgpt','Local reproduction',$2::jsonb) r",[owner,JSON.stringify(c.batch)]);}finally{await as(owner);}
}
async function note(type='basic',front='Question'){
 const n=(await q("insert into public.notes(user_id,project_id,front,back,type) values($1,$2,$3,'Answer',$4) returning *",[owner,project,front,type]))[0];
 await q('insert into public.cards(user_id,note_id,ord) values($1,$2,1)',[owner,n.id]);return n;
}

beforeAll(async()=>{
 const {PGlite}=await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $auth$
 select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
 nullif(current_setting('test.uid',true),'')::uuid) $auth$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
},60000);
beforeEach(async()=>{
 await admin();owner=randomUUID();subject=randomUUID();project=randomUUID();loseNoteUpdateResponse=false;deleteProjectDuringExport=false;
 await q('insert into auth.users(id) values($1)',[owner]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,(owner.replaceAll('-','')+'a'.repeat(48)).slice(0,48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','amber')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proofs','Proofs','Practice')",[project,owner,subject]);
 await as(owner);
 fake={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
 from(table:string){
  if(!/^[a-z_]+$/.test(table))throw Error('Invalid fixture table');
  const where:string[]=[],args:unknown[]=[],orders:string[]=[];let offset=0,limit:number|undefined,changes:any,insert:any,remove=false;
  const add=(field:string,op:string,value:unknown)=>{if(!/^[a-z_]+$/.test(field))throw Error('Invalid field');args.push(value);where.push('e.'+field+op+'$'+args.length);};
  const query:any={select(){return query;},eq(f:string,v:unknown){add(f,'=',v);return query;},neq(f:string,v:unknown){add(f,'<>',v);return query;},
   gt(f:string,v:unknown){add(f,'>',v);return query;},gte(f:string,v:unknown){add(f,'>=',v);return query;},
   is(f:string,v:unknown){if(v!==null)throw Error('Expected fixture null');where.push('e.'+f+' is null');return query;},
   in(f:string,values:unknown[]){if(!values.length)where.push('false');else{const ps=values.map(v=>{args.push(v);return '$'+args.length;});where.push('e.'+f+' in ('+ps.join(',')+')');}return query;},
   order(f:string,opts:any={}){orders.push('e.'+f+(opts.ascending===false?' desc':' asc')+(opts.nullsFirst===false?' nulls last':''));return query;},
   limit(n:number){limit=n;return query;},range(a:number,b:number){offset=a;limit=b-a+1;return query;},
   update(v:any){changes=v;return query;},insert(v:any){insert=Array.isArray(v)?v:[v];return query;},delete(){remove=true;return query;},
   async execute(single=false){
    try{
     let rows:any[];
     const predicate=where.length?' where '+where.join(' and '):'';
     if(insert){
      const keys=Object.keys(insert[0]).filter(k=>insert[0][k]!==undefined);
      const values=insert.map((row:any)=>'('+keys.map(k=>{args.push(row[k]);return '$'+args.length;}).join(',')+')').join(',');
      rows=await q('insert into public.'+table+' as e ('+keys.join(',')+') values '+values+' returning to_jsonb(e) r',args);
     }else if(changes){
      const sets=Object.entries(changes).map(([k,v])=>{args.push(v);return k+'=$'+args.length;});
      rows=await q('update public.'+table+' e set '+sets.join(',')+predicate+' returning to_jsonb(e) r',args);
      if(table==='notes'&&loseNoteUpdateResponse){loseNoteUpdateResponse=false;return {data:null,error:{message:'Network request failed after commit'}};}
     }else if(remove)rows=await q('delete from public.'+table+' e'+predicate+' returning to_jsonb(e) r',args);
     else rows=await q('select to_jsonb(e) r from public.'+table+' e'+predicate+(orders.length?' order by '+orders.join(','):'')+(limit===undefined?'':' limit '+limit)+' offset '+offset,args);
     const data=rows.map(r=>r.r);return {data:single?data[0]??null:data,error:null};
    }catch(e){return {data:null,error:{message:(e as Error).message}};}
   },single(){return query.execute(true);},maybeSingle(){return query.execute(true);},then(resolve:any,reject:any){return query.execute().then(resolve,reject);},
  };return query;
 },async rpc(name:string,args:any={}){
  try{
   if(name==='approve_proposal')return {data:await rpc('select public.approve_proposal($1,$2::jsonb) r',[args.p_id,JSON.stringify(args.p_edit)]),error:null};
   if(name==='edit_note_atomic'){
    const data=await rpc('select public.edit_note_atomic($1,$2,$3::jsonb,$4) r',[args.p_id,args.p_expected,JSON.stringify(args.p_patch),args.p_operation]);
    if(loseNoteUpdateResponse){loseNoteUpdateResponse=false;return {data:null,error:{message:'Network request failed after commit'}};}return {data,error:null};
   }
   if(name==='begin_owner_export')return {data:await rpc('select public.begin_owner_export() r'),error:null};
   if(name==='end_owner_export')return {data:await rpc('select public.end_owner_export($1) r',[args.p_snapshot]),error:null};
   if(name==='owner_export_page'){
    const data=await rpc('select public.owner_export_page($1,$2,$3,$4) r',[args.p_snapshot,args.p_table,args.p_offset,args.p_limit]);
    if(args.p_table==='notes'&&deleteProjectDuringExport){deleteProjectDuringExport=false;await q('delete from public.projects where id=$1',[project]);}
    return {data,error:null};
   }
   throw Error('Unexpected fixture RPC '+name);
  }catch(e){return {data:null,error:{message:(e as Error).message}};}
 }};vi.mocked(liveClient).mockReturnValue(fake);
});
afterAll(async()=>{await db?.close();});

it('saves the owner correction when approving a card-edit proposal',async()=>{
 const n=await note();
 const p=(await q("insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'card_edit',$3::jsonb,'chatgpt') returning id",[owner,project,JSON.stringify({note_no:Number(n.no),front:'Tutor draft',back:'Incorrect proof'})]))[0];
 await new LiveAdapter().approveProposal(p.id,{front:'Owner correction',back:'Correct proof'});
 const saved=(await q('select front,back from public.notes where id=$1',[n.id]))[0];
 console.info('approved card-edit text',saved);
 expect(saved).toEqual({front:'Owner correction',back:'Correct proof'});
});

it('keeps the new cloze cards after the note update commits but its response is lost',async()=>{
 const n=await note('cloze','{{c1::first}}');loseNoteUpdateResponse=true;
 await expect(new LiveAdapter().updateNote(Number(n.no),{front:'{{c1::first}} and {{c2::second}}'})).rejects.toThrow(/offline|Network request failed/);
 const saved=(await q('select front from public.notes where id=$1',[n.id]))[0];
 const cards=await q('select ord from public.cards where note_id=$1 order by ord',[n.id]);
 console.info('note after uncertain update',saved,cards);
 expect(cards.map(c=>c.ord)).toEqual([1,2]);
});

it('lets a newly transcribed source accept the next batch of pages',async()=>{
 const first=context();const message=await savePages(first,{project:'proofs',title:'Lecture notes',client:'chatgpt',pages:[{page:1,text:'First proof'}]});
 await commit(first);const src=(await q('select * from public.sources where project_id=$1',[project]))[0];
 console.info('first transcription result',message,'page_count',src.page_count);
 const second=context();await expect(savePages(second,{project:'proofs',source:src.short,client:'chatgpt',pages:[{page:2,text:'Second proof'}]})).resolves.toContain('saved pages');
});

it('resolves a source by its exact short name beyond the first 100 sources',async()=>{
 for(let i=0;i<101;i++)await q("insert into public.sources(user_id,project_id,title,short,status,created_at) values($1,$2,$3,$4,'ready',$5)",[owner,project,'Source '+i,'src'+i,new Date(Date.UTC(2020,0,1,0,0,i)).toISOString()]);
 await expect(resolveSource(context(),{id:project},'src100')).resolves.toMatchObject({short:'src100'});
});

it('resolves an exact old project name beyond the 100 most recently active projects',async()=>{
 await q("update public.projects set last_activity_at='2020-01-01' where id=$1",[project]);
 for(let i=0;i<100;i++)await q("insert into public.projects(user_id,subject_id,slug,title,goal,last_activity_at) values($1,$2,$3,$4,'Practice','2030-01-01')",[owner,subject,'new'+i,'New '+i]);
 await expect(resolveProject(context(),'proofs')).resolves.toMatchObject({id:project});
});

it('exports related notes and projects from a consistent snapshot during concurrent edits',async()=>{
 await note();deleteProjectDuringExport=true;
 const blob=await new LiveAdapter().exportAll();const backup=JSON.parse(await blob.text());
 const projects=new Set(backup.tables.projects.map((p:any)=>p.id));
 const orphaned=backup.tables.notes.filter((n:any)=>!projects.has(n.project_id));
 console.info('backup notes with missing projects',orphaned.map((n:any)=>n.no));
 expect(orphaned).toEqual([]);
});

it('applies concept prerequisite and related links from an approved plan change',async()=>{
 await q("insert into public.checkpoints(user_id,project_id,code,title,position,objective,criterion,steps) values($1,$2,'CP1','First',10,'Learn','Explain','[\"Think\"]')",[owner,project]);
 const payload={ops:[{op:'update',code:'CP1',title:'First revised'}],concepts:[{name:'Foundation',prereqs:[]},{name:'Advanced',prereqs:['Foundation']},{name:'Companion',related:['Foundation']}]};
 const c=context();await proposePlanChange(c,{project:'proofs',...payload,reason:'Add the two supporting ideas'});await commit(c);
 const p=(await q('select id from public.proposals where project_id=$1',[project]))[0];
 await q('select public.approve_proposal($1)',[p.id]);
 const ideas=await q('select id,name,topic from public.concepts where user_id=$1',[owner]);const edges=await q('select from_id,to_id,kind from public.concept_links where user_id=$1',[owner]);
 console.info('approved plan-change ideas/edges',ideas,edges);
 expect(edges).toHaveLength(2);
});

it('does not spend the chat review quota on an answer that was undone',async()=>{
 await q("update public.projects set status='active' where id=$1",[project]);
 const n=await note();await q('update public.settings set new_per_day=1 where user_id=$1',[owner]);
 const settings=(await q('select to_jsonb(s) s from public.settings s where user_id=$1',[owner]))[0].s;
 expect((await counts(context(),settings)).due).toBe(1);
 const card=(await q('select id from public.cards where note_id=$1',[n.id]))[0];
 const next={state:2,due:'2030-01-01T00:00:00Z',stability:5,difficulty:5,last_review:new Date().toISOString(),step:0,reps:1,lapses:0};
 const review=await rpc('select public.record_review($1,3,null,1000,$2::jsonb) r',[card.id,JSON.stringify(next)]);
 await q('select public.undo_review($1)',[review]);
 const totals=await counts(context(),settings);console.info('chat counts after grade Undo',totals);
 const actualQueue=(await q("select count(*)::int n from public.review_items('{}'::text[],null,null,true,false)"))[0].n;
 expect(actualQueue).toBe(1);
 expect(totals.due).toBe(1);
});

it('does not undo a later manual reschedule when undoing an earlier answer',async()=>{
 const n=await note();const card=(await q('select id from public.cards where note_id=$1',[n.id]))[0];
 const next={state:2,due:'2030-01-01T00:00:00Z',stability:5,difficulty:5,last_review:new Date().toISOString(),step:0,reps:1,lapses:0};
 const review=await rpc('select public.record_review($1,3,null,1000,$2::jsonb) r',[card.id,JSON.stringify(next)]);
 const later='2035-06-07T10:00:00Z';
 const reschedule={schemaVersion:1,resource:'card_schedule',operation:'reschedule',operationId:randomUUID(),target:{noteNo:Number(n.no),ord:1},patch:{due:later}};
 await q('select public.card_schedule_command($1::jsonb)',[JSON.stringify(reschedule)]);
 try{await q('select public.undo_review($1)',[review]);}catch{return;}
 const saved=(await q('select due from public.cards where id=$1',[card.id]))[0];
 console.info('manually rescheduled due after undo of older grade',saved);
 expect(new Date(saved.due).toISOString()).toBe(new Date(later).toISOString());
});

it('lets the live review UI regrade an answer after Undo instead of skipping it as changed',async()=>{
 await q("update public.projects set status='active' where id=$1",[project]);
 const n=await note();
 const envelope=(operation:string,patch:any,target:any={},expectedVersion?:number)=>({schemaVersion:1,resource:'review_runs',operationId:randomUUID(),operation,patch,target,...(expectedVersion===undefined?{}:{expectedVersion})});
 const start=envelope('start',{filters:{includeNew:true},selected_deck_ids:['project:proofs'],card_budget:5,minute_budget:5,scheduler_version:'fsrs-5',settings_version:1});
 const started=await rpc('select public.review_runs_command($1::jsonb) r',[JSON.stringify(start)]);
 expect(started.itemCount).toBe(1);
 const item=(await q('select * from public.review_run_items where run_id=$1',[started.run.id]))[0];
 const next={state:2,due:'2030-01-01T00:00:00Z',stability:5,difficulty:5,last_review:new Date().toISOString(),step:0,reps:1,lapses:0};
 const review=await rpc('select public.record_review($1,3,null,1000,$2::jsonb) r',[item.card_id,JSON.stringify(next)]);
 const advanced=await rpc('select public.review_runs_command($1::jsonb) r',[JSON.stringify(envelope('advance',{kind:'graded',item_id:item.id,review_id:String(review)},{id:started.run.id},started.run.version))]);
 const undone=await rpc('select public.review_runs_undo_last($1::jsonb) r',[JSON.stringify(envelope('undo_last',{item_id:item.id},{id:started.run.id},advanced.run.version))]);
 const card=(await q('select version from public.cards where id=$1',[item.card_id]))[0];
 console.info('Undo item expected version; current card version',undone.item.expected_card_version,card.version,'note',n.no);
 // This is the production v6/v7 grade handler's mandatory version comparison.
 expect(undone.item.expected_card_version).toBe(card.version);
});

it('serializes note and card reconciliation and refuses a stale concurrent edit',async()=>{
 const n=await note('cloze','{{c1::one}} {{c2::two}}');
 await q('insert into public.cards(user_id,note_id,ord,reps) values($1,$2,2,42)',[owner,n.id]);
 const patch={front:'{{c1::one}} {{c2::two}} {{c3::three}}'};
 const a=await rpc('select public.edit_note_atomic($1,$2,$3::jsonb,$4) r',[n.id,n.version,JSON.stringify(patch),randomUUID()]);
 const b=await rpc('select public.edit_note_atomic($1,$2,$3::jsonb,$4) r',[n.id,n.version,JSON.stringify({front:'{{c1::one}}'}),randomUUID()]);
 expect(a.status).toBe('ok');expect(b.status).toBe('conflict');
 expect((await q('select ord,reps from public.cards where note_id=$1 order by ord',[n.id])).map(x=>[x.ord,x.reps])).toEqual([[1,0],[2,42],[3,0]]);
});

it('merges independent reminder patches without undoing an opt-out or nested preference',async()=>{
 await q("select public.patch_notify_settings('{\"enabled\":false,\"quiet\":{\"start\":\"21:00\"}}')");
 await q("select public.patch_notify_settings('{\"studyTime\":\"20:00\",\"quiet\":{\"end\":\"08:00\"}}')");
 const row=(await q('select notify from public.settings where user_id=$1',[owner]))[0];
 expect(row.notify).toMatchObject({enabled:false,studyTime:'20:00',quiet:{start:'21:00',end:'08:00'}});
});

it('refuses a missing note generation rather than bypassing concurrent edit protection',async()=>{
 const n=await note();
 await expect(rpc('select public.edit_note_atomic($1,null,$2::jsonb,$3) r',[n.id,JSON.stringify({front:'Stale edit'}),randomUUID()])).rejects.toThrow('Invalid note edit');
 expect((await q('select front from public.notes where id=$1',[n.id]))[0].front).toBe('Question');
});
