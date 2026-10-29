import { Context, scoped, insert, update, rpc, all } from '../db.ts';
import { project, checkpoint, checkpoints, session, source } from '../resolve.ts';
import { day, ladder } from '../derive.ts';
import { settings } from '../packet.ts';
import { slug, cut, normalizedFront, number } from '../text.ts';

async function origin(c:Context,sess?:any):Promise<string>{
  return sess?.client||(await settings(c)).connector_last_client||'other';
}
async function addProposal(c:Context,p:any,kind:string,payload:any,reason?:string,sess?:any){
  return insert(c,'proposals',{project_id:p.id,session_id:sess?.id||null,kind,payload,reason:reason||null,origin:await origin(c,sess)});
}
export async function startSession(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project),cp=await checkpoint(c,p,a.checkpoint);
  const now=Date.now();
  const {data,error}=await scoped(c,'sessions').eq('project_id',p.id).eq('state','open').order('last_activity_at',{ascending:false});
  if(error)throw new Error(error.message);
  const found=(data||[]).find((x:any)=>x.checkpoint_id===(cp?.id||null)&&now-new Date(x.last_activity_at).getTime()<3*3600000);
  if(found)return 'continuing S'+found.number;
  for(const x of data||[])if(now-new Date(x.last_activity_at).getTime()>3*3600000)await update(c,'sessions',x.id,{state:'ended',ended_at:new Date().toISOString(),summary:'Interrupted',goal_met:null});
  // Optimistic compare-and-set avoids assigning the same project-local number twice.
  const {data:changed,error:casError}=await c.db.from('projects').update({next_session_number:p.next_session_number+1}).eq('user_id',c.userId).eq('id',p.id).eq('next_session_number',p.next_session_number).select('id');
  if(casError)throw new Error(casError.message);
  if(!changed?.length)throw new Error('Another session started. Retry start_session.');
  const s=await insert(c,'sessions',{project_id:p.id,number:p.next_session_number,goal:a.goal,style:a.style||p.style,checkpoint_id:cp?.id||null,client:a.client});
  if(cp && cp.status==='not_started')await update(c,'checkpoints',cp.id,{status:'in_progress',current_step:1});
  return 'started S'+s.number+(cp?' on '+cp.code+' (step '+(cp.current_step||1)+'/'+cp.steps.length+')':'');
}
export async function saveProgress(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project),s=await session(c,p,a.session);
  if(s.state!=='open')throw new Error('Session S'+s.number+' is already ended');
  const allowed=await checkpoints(c,p),byCode=new Map(allowed.map((x:any)=>[x.code.toUpperCase(),x]));
  let cp=allowed.find((x:any)=>x.id===s.checkpoint_id);
  const today=day(await settings(c));let saved=0;
  // Every table write below is owner-scoped; validation completes before any mutation.
  const events:(any[])=(a.events||[]).map((e:any)=>{
    const target=e.checkpoint?byCode.get(e.checkpoint.toUpperCase()):cp;
    if(e.checkpoint&&!target)throw new Error('Unknown checkpoint '+e.checkpoint);
    return {kind:e.kind,body:e.text,outcome:e.outcome||null,hint_level:e.hint_level||null,checkpoint_id:target?.id||null,target};
  });
  if(a.step!==undefined && (!cp||a.step>cp.steps.length))throw new Error('Step exceeds the checkpoint steps');
  for(const e of events){
    await insert(c,'session_events',{session_id:s.id,checkpoint_id:e.checkpoint_id,kind:e.kind,body:e.body,outcome:e.outcome,hint_level:e.hint_level});
    saved++;
    if(e.target&&e.kind==='evidence'&&e.outcome==='demonstrated'){
      const next=new Date(Date.parse(today+'T12:00:00Z')+3*86400000).toISOString().slice(0,10);
      await update(c,'checkpoints',e.target.id,{status:'demonstrated',demonstrated_at:new Date().toISOString(),current_step:e.target.steps.length,recheck_level:0,recheck_due:next,needs_revisit:false});
    }
    if(e.target&&e.kind==='recheck'&&e.outcome)await update(c,'checkpoints',e.target.id,ladder(e.target,e.outcome,today));
  }
  if(a.misconception){
    await insert(c,'session_events',{session_id:s.id,checkpoint_id:cp?.id||null,kind:'misconception',body:a.misconception});
    saved++;
    const {data:old,error}=await scoped(c,'misconceptions').eq('project_id',p.id).ilike('label',a.misconception).maybeSingle();
    if(error)throw new Error(error.message);
    if(old)await update(c,'misconceptions',old.id,{times:old.times+1,last_seen_at:new Date().toISOString(),resolved_at:null});
    else await insert(c,'misconceptions',{project_id:p.id,label:a.misconception});
  }
  if(a.resolved){
    const {data:x,error}=await scoped(c,'misconceptions').eq('project_id',p.id).ilike('label',a.resolved).maybeSingle();
    if(error)throw new Error(error.message);
    if(x)await update(c,'misconceptions',x.id,{resolved_at:new Date().toISOString()});
  }
  const patch:any={last_activity_at:new Date().toISOString()};
  if(a.step!==undefined){patch.resume_step=a.step; if(cp)await update(c,'checkpoints',cp.id,{current_step:a.step})}
  if(a.next_question!==undefined)patch.resume_question=a.next_question;
  await update(c,'sessions',s.id,patch);
  return 'saved S'+s.number+': step '+(a.step??s.resume_step??cp?.current_step??0)+', '+saved+' events';
}
export async function endSession(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project),s=await session(c,p,a.session);
  if(s.state!=='open')throw new Error('Session already ended');
  const mins=Math.min(600,Math.max(0,Math.round((Date.now()-Date.parse(s.started_at))/60000)));
  await update(c,'sessions',s.id,{state:'ended',summary:a.summary,goal_met:a.goal_met,ended_at:new Date().toISOString(),minutes:mins,last_activity_at:new Date().toISOString()});
  if(a.recheck_prompt&&s.checkpoint_id)await update(c,'checkpoints',s.checkpoint_id,{recheck_prompt:a.recheck_prompt});
  const {data,error}=await scoped(c,'proposals','id').eq('project_id',p.id).eq('status','pending');
  if(error)throw new Error(error.message);
  return 'closed S'+s.number+' ('+mins+' min). '+(data?.length??0)+' proposals wait in Lemma.';
}
export async function proposeCards(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project),s=a.session?await session(c,p,a.session):null;
  const notes=(await scoped(c,'notes','front').eq('project_id',p.id).eq('status','active').limit(1000)).data||[];
  const existing=new Set(notes.map((x:any)=>normalizedFront(x.front)));
  const cps=await checkpoints(c,p);let added=0,skipped=0;
  for(const card of a.cards){
    const front=normalizedFront(card.front);
    if(existing.has(front)){skipped++;continue}
    existing.add(front);
    if(card.checkpoint&&!cps.some((x:any)=>x.code.toLowerCase()===card.checkpoint.toLowerCase()))throw new Error('Unknown checkpoint '+card.checkpoint);
    const payload={front:card.front,back:card.back||'',type:card.type||'basic',kind:card.kind||'other',checkpoint:card.checkpoint,concept:card.concept,page:card.page,direct:!!a.direct};
    const row=await addProposal(c,p,'card',payload,card.reason,s);
    if(a.direct)await rpc(c,'approve_proposal',{p_id:row.id});
    added++;
  }
  return (a.direct?added+' cards added':added+' cards wait for approval in Lemma')+(skipped?'; skipped '+skipped+' duplicate':'');
}
export async function proposeCardEdits(c:Context,a:any):Promise<string>{
  const notes=await all(c,'notes','id,no,project_id');
  const comments=await all(c,'card_comments','no,note_id,status');
  let n=0;
  for(const x of a.edits){
    const no=number(x.card.toUpperCase(),'N');
    const note=notes.find((v:any)=>v.no===no);
    if(!note)throw new Error('Card N'+no+' not found');
    if((x.resolves||[]).some((id:number)=>!comments.some((cm:any)=>cm.no===id&&cm.note_id===note.id&&cm.status==='open')))throw new Error('Unrecognized comment on N'+no);
    const p={id:note.project_id};
    await addProposal(c,p,'card_edit',{note_no:no,front:x.front,back:x.back,type:x.type,resolves:x.resolves||[]},x.reason);
    n++;
  }
  return n+' card fixes wait for approval';
}
export async function proposePlan(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project);
  if(p.status!=='planning'||(await checkpoints(c,p)).length)throw new Error('This project already has a plan; propose changes instead');
  const converted=a.checkpoints.map((x:any,i:number)=>{
    if(/^(read|review)\b/i.test(x.criterion.trim()))throw new Error('Criterion must be work the student produces');
    if((x.prereqs||[]).some((n:number)=>n<1||n>i))throw new Error('Prerequisites must be earlier checkpoint indexes');
    return {code:'CP'+(i+1),title:x.title,objective:x.objective,criterion:x.criterion,steps:x.steps,pages:x.pages,prereqs:(x.prereqs||[]).map((n:number)=>'CP'+n),concepts:x.concepts||[],recheck_prompt:x.recheck_prompt};
  });
  await addProposal(c,p,'plan',{checkpoints:converted,concepts:a.concepts||[]},a.reason);
  return 'plan with '+converted.length+' checkpoints waits for approval in Lemma';
}
export async function proposePlanChange(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project);
  if(!(await checkpoints(c,p)).length)throw new Error('No plan yet; use propose_plan');
  const valid=['add','update','remove','move','prereq_add','prereq_remove'];
  if(a.ops.some((x:any)=>!valid.includes(x.op)))throw new Error('Unknown plan operation');
  await addProposal(c,p,'plan_change',{ops:a.ops},a.reason);
  return 'plan change ('+a.ops.length+' ops) waits for approval';
}
export async function createProject(c:Context,a:any):Promise<string>{
  const {data:found,error}=await scoped(c,'subjects').ilike('name',a.subject).maybeSingle();
  if(error)throw new Error(error.message);
  const subject=found||await insert(c,'subjects',{name:a.subject,glyph:a.glyph||a.subject.slice(0,1),hue:'amber'});
  const existing=await all(c,'projects','slug');
  let base=slug(a.title);if(base.length<2)base='study';
  let unique=base;for(let i=2;existing.some((p:any)=>p.slug===unique);i++)unique=base.slice(0,35)+'-'+i;
  const st=await settings(c);
  const p=await insert(c,'projects',{subject_id:subject.id,title:a.title,slug:unique,goal:a.goal,status:'planning',style:a.style||st.default_style||'socratic'});
  if(a.book){
    const src=slug(a.book_short||a.book).slice(0,20)||'book';
    await insert(c,'sources',{project_id:p.id,title:a.book,short:src,filename:src+'.pdf',page_count:0,has_text:false,status:'ready'});
  }
  return 'created '+unique+' (planning). Next: propose_plan.';
}
export async function proposals(c:Context,a:any):Promise<string>{
  const p=a.project?await project(c,a.project):null;
  let q=scoped(c,'proposals').eq('status','pending').order('no').limit(100);
  if(p)q=q.eq('project_id',p.id);
  const {data,error}=await q;if(error)throw new Error(error.message);
  const projects=await all(c,'projects','id,slug'),ses=await all(c,'sessions','id,number');
  const lines=(data||[]).map((x:any)=>{
    const pr=projects.find((z:any)=>z.id===x.project_id),sn=ses.find((z:any)=>z.id===x.session_id),b=x.payload||{};
    const prefix='P'+x.no+' ';
    if(x.kind==='card')return prefix+'card '+(b.checkpoint||'')+' '+(sn?'S'+sn.number:'')+': '+cut(b.front,120)+' → '+cut(b.back,80);
    if(x.kind==='card_edit')return prefix+'fix N'+b.note_no+': '+cut(Object.keys(b).filter(k=>k!=='note_no').join(', '),130);
    if(x.kind==='plan')return prefix+'plan '+pr?.slug+': '+b.checkpoints?.length+' checkpoints: '+cut((b.checkpoints||[]).map((z:any)=>z.code+' '+z.title).join('; '),200);
    return prefix+'change: '+cut((b.ops||[]).map((z:any)=>z.op+' '+(z.code||z.title||'')).join('; '),200);
  });
  return cut(lines.join('\n')||'No pending proposals.',2000);
}
export async function decide(c:Context,a:any):Promise<string>{
  const overlap=(a.approve||[]).filter((n:number)=>(a.reject||[]).includes(n));
  if(overlap.length)throw new Error('Cannot both approve and reject P'+overlap[0]);
  const out:string[]=[];
  for(const [kind,nums] of [['approve',a.approve||[]],['reject',a.reject||[]]] as const){
    for(const no of nums){
      const {data:p,error}=await scoped(c,'proposals','id,no,status').eq('no',no).maybeSingle();
      if(error)throw new Error(error.message);
      if(!p||p.status!=='pending'){out.push('P'+no+' not pending');continue}
      try{await rpc(c,kind==='approve'?'approve_proposal':'reject_proposal',{p_id:p.id});out.push((kind==='approve'?'approved ':'rejected ')+'P'+no)}
      catch(e){out.push('P'+no+' failed: '+cut(e instanceof Error?e.message:String(e),100))}
    }
  }
  return cut(out.join('; ')||'No proposals selected',160);
}