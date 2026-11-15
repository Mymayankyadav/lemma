// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {createLiveStudyApi} from '../../../src/data/study/live';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';
import {planReviewNodes} from '../../../src/features/plan-proposal/nodes';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/pdf/ingest',()=>({ingest:vi.fn()}));

let db:any;
const owner='11111111-1111-4111-8111-111111111111';
const subject='22222222-2222-4222-8222-222222222222';
const project='33333333-3333-4333-8333-333333333333';
const session='44444444-4444-4444-8444-444444444444';
const q=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows;
let failNextBlockRead=false;
const sent:any[]=[];

beforeAll(async()=>{
 const {PGlite}=await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $auth$
 select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
 nullif(current_setting('test.uid',true),'')::uuid) $auth$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort())
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1)',[owner]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','amber')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proofs','Proofs','Practice')",[project,owner,subject]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,client) values($1,$2,$3,1,'Proofs','socratic','chatgpt')",[session,owner,project]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');

 const fake={
  auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
  from(table:string){
   if(!/^[a-z_]+$/.test(table))throw Error('Invalid fixture table');
   const where:string[]=[],args:unknown[]=[],orders:string[]=[];
   let nested=false,offset=0,limit:number|undefined,update:Record<string,unknown>|undefined;
   const add=(field:string,operator:string,value:unknown)=>{args.push(value);where.push('e.'+field+operator+'$'+args.length);};
   const query:any={
    select(fields:string){nested=fields.includes('study_intervals(');return query;},
    eq(field:string,value:unknown){add(field,'=',value);return query;},
    neq(field:string,value:unknown){add(field,'<>',value);return query;},
    in(field:string,values:unknown[]){
     if(!values.length)where.push('false');
     else {const placeholders=values.map(value=>{args.push(value);return '$'+args.length;});where.push('e.'+field+' in ('+placeholders.join(',')+')');}
     return query;
    },
    lt(field:string,value:unknown){add(field,'<',value);return query;},
    gt(field:string,value:unknown){add(field,'>',value);return query;},
    or(value:string){
     if(!value.startsWith('ended_at.is.null,ended_at.gt.'))throw Error('Unexpected fixture OR '+value);
     args.push(value.slice('ended_at.is.null,ended_at.gt.'.length));
     where.push('(e.ended_at is null or e.ended_at>$'+args.length+')');return query;
    },
    range(start:number,end:number){offset=start;limit=end-start+1;return query;},
    limit(n:number){limit=n;return query;},
    order(field:string,options:{ascending:boolean}){orders.push('e.'+field+(options.ascending?' asc':' desc'));return query;},
    update(value:Record<string,unknown>){update=value;return query;},
    async execute(single=false){
     if(failNextBlockRead&&table==='calendar_blocks'&&single){failNextBlockRead=false;return {data:null,error:{message:'Network request failed'}};}
     let data;
     if(update){
      const sets=Object.entries(update).map(([key,value])=>{args.push(value);return key+'=$'+args.length;});
      data=await q('update public.'+table+' e set '+sets.join(',')+(where.length?' where '+where.join(' and '):'')+' returning to_jsonb(e) as data',args);
     }else{
      const expression=nested?"to_jsonb(e)||jsonb_build_object('study_intervals',coalesce((select jsonb_agg(to_jsonb(i)) from public.study_intervals i where i.entry_id=e.id),'[]'::jsonb))":"to_jsonb(e)";
      data=await q('select '+expression+' as data from public.'+table+' e'+(where.length?' where '+where.join(' and '):'')+(orders.length?' order by '+orders.join(','):'')+(limit===undefined?'':' limit '+limit)+' offset '+offset,args);
     }
     const rows=data.map((r:any)=>r.data);return {data:single?rows[0]??null:rows,error:null};
    },
    maybeSingle(){return query.execute(true);},single(){return query.execute(true);},
    then(resolve:any,reject:any){return query.execute().then(resolve,reject);},
   };
   return query;
  },
  async rpc(name:string,args:any){
   const {p}=args;
   if(name==='undo_action'){try{return {data:(await q('select public.undo_action($1,$2) r',[args.p_user,args.p_no]))[0].r,error:null};}catch(e){return {data:null,error:{message:(e as Error).message}};}}
   if(name!=='study_command')throw Error('Unexpected fixture RPC '+name);
   sent.push(p);
   try{return {data:(await q('select public.study_command($1::jsonb) as data',[JSON.stringify(p)]))[0].data,error:null};}
   catch(e){return {data:null,error:{message:(e as Error).message}};}
  },
 };
 vi.mocked(liveClient).mockReturnValue(fake as never);
},60000);
afterAll(async()=>{await db?.close();});

it('omits a withdrawn proposal from the pending Inbox',async()=>{
 const row=(await q("insert into public.proposals(user_id,project_id,session_id,kind,payload,origin) values($1,$2,$3,'plan_change','{\"ops\":[]}'::jsonb,'chatgpt') returning id",[owner,project,session]))[0];
 await q('select public.withdraw_proposal($1)',[row.id]);
 const items=await new LiveAdapter().listProposals();
 expect(items.map(p=>p.id)).not.toContain(row.id);
});

it('counts pending card-edit proposals on the tutor session',async()=>{
 const note=(await q("insert into public.notes(user_id,project_id,session_id,front,back) values($1,$2,$3,'Question','Answer') returning no",[owner,project,session]))[0];
 await q("insert into public.proposals(user_id,project_id,session_id,kind,payload,origin) values($1,$2,$3,'card_edit',$4::jsonb,'chatgpt')",[owner,project,session,JSON.stringify({note_no:Number(note.no),front:'Edited question'})]);
 const detail=await new LiveAdapter().getSession('proofs',1);
 expect(detail.pendingProposals.cards).toBe(1);
});

it('retries an uncertain Calendar create without creating a second block',async()=>{
 const api=createLiveStudyApi();
 const input={kind:'study' as const,title:'Retry proof session',startsAt:'2026-11-15T09:00:00.000Z',endsAt:'2026-11-15T10:00:00.000Z',timeZone:'UTC'};
 failNextBlockRead=true;
 await expect(api.createCalendarBlock(input)).rejects.toThrow('Network request failed');
 await api.createCalendarBlock(input);
 const count=(await q("select count(*)::int n from public.calendar_blocks where title='Retry proof session'"))[0].n;
 console.info('Calendar retry operationIds',sent.filter(p=>p.operation==='create'&&p.resource==='calendar_blocks').map(p=>p.operationId));
 expect(count).toBe(1);
});

it('Calendar delete Undo restores the original study-entry association',async()=>{
 const api=createLiveStudyApi();
 const {record:prior}=await api.createCalendarBlock({kind:'study',title:'Associated block',startsAt:'2026-11-15T11:00:00.000Z',endsAt:'2026-11-15T12:00:00.000Z',timeZone:'UTC'});
 const entry=(await q("insert into public.study_entries(user_id,source,status,intent,calendar_block_id) values($1,'manual','saved','Linked proof',$2) returning id",[owner,prior.id]))[0];
 const deleted=await api.deleteCalendarBlock(prior.id,prior.version);
 // This is the exact Undo closure used by BlockSheet.remove.
 await api.undoCalendarBlockDeletion(prior.id,deleted.actionNo);
 const saved=(await q('select calendar_block_id from public.study_entries where id=$1',[entry.id]))[0];
 expect(saved.calendar_block_id).toBe(prior.id);
});

it('returns all saved study entries even when the first entry has 500 intervals',async()=>{
 const api=createLiveStudyApi(),t=Date.parse('2026-11-01T00:00:00Z');
 const spans=Array.from({length:500},(_,n)=>({kind:'focus' as const,start:new Date(t+n*120000).toISOString(),end:new Date(t+n*120000+60000).toISOString()}));
 const first=await api.createManualStudyEntry({intent:'Many intervals',intervals:spans});
 const second=await api.createManualStudyEntry({intent:'Another session',intervals:[{kind:'focus',start:'2026-11-01T20:00:00Z',end:'2026-11-01T20:30:00Z'}]});
 const entries=await api.listStudyEntries({start:'2026-11-01T00:00:00Z',end:'2026-11-02T00:00:00Z'});
 expect(entries.map(e=>e.id).sort()).toEqual([first.record.id,second.record.id].sort());
},30000);

it('approves the collision-free checkpoint codes shown by the proposal preview',async()=>{
 await q("insert into public.checkpoints(user_id,project_id,code,title,position,objective,criterion,steps) values($1,$2,'CP1','First',10,'Learn','Explain',$3::jsonb)",[owner,project,JSON.stringify(['Think'])]);
 const payload={ops:[
  {op:'add',after:'CP1',title:'Bridge',objective:'Learn',criterion:'Explain',steps:['Think']},
  {op:'add',code:'CP1a',title:'Named',objective:'Learn',criterion:'Explain',steps:['Think']},
 ]};
 const preview=planReviewNodes(null,payload as any,[{code:'CP1',title:'First',position:10,ui:'now'}] as any);
 expect(preview.map(p=>p.code)).toEqual(['CP1','CP1b','CP1a']);
 const row=(await q("insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'plan_change',$3::jsonb,'chatgpt') returning id",[owner,project,JSON.stringify(payload)]))[0];
 await expect(q('select public.approve_proposal($1)',[row.id])).resolves.toBeDefined();
});

it('persists the same generated checkpoint code that the preview shows after a suffix checkpoint',async()=>{
 await q('delete from public.checkpoints where user_id=$1 and project_id=$2',[owner,project]);
 await q("insert into public.checkpoints(user_id,project_id,code,title,position,objective,criterion,steps) values($1,$2,'CP1a','Prior bridge',20,'Learn','Explain',$3::jsonb)",[owner,project,JSON.stringify(['Think'])]);
 const payload={ops:[{op:'add',after:'CP1a',title:'Nested bridge',objective:'Learn',criterion:'Explain',steps:['Think']}]};
 const existing=[{code:'CP1',title:'First',position:10,ui:'now'},{code:'CP1a',title:'Prior bridge',position:20,ui:'next'}] as any;
 const predicted=planReviewNodes(null,payload as any,existing).find(n=>n.title==='Nested bridge')!.code;
 const row=(await q("insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'plan_change',$3::jsonb,'chatgpt') returning id",[owner,project,JSON.stringify(payload)]))[0];
 await q('select public.approve_proposal($1)',[row.id]);
 const saved=(await q("select code from public.checkpoints where project_id=$1 and title='Nested bridge'",[project]))[0];
 expect(saved.code).toBe(predicted);
});
