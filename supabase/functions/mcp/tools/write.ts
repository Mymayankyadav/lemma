import { planningFields } from '../planning.ts';
import { reuseSubject } from '../v3.ts';
import { Context, scoped, insert, update, rpc, all } from '../db.ts';
import { project, checkpoint, checkpoints, session, source } from '../resolve.ts';
import { day, ladder } from '../derive.ts';
import { settings } from '../packet.ts';
import { slug, cut, capped, normalizedFront, number } from '../text.ts';

async function origin(c:Context,sess?:any):Promise<string>{
  return sess?.client||(await settings(c)).connector_last_client||'other';
}
async function addProposal(c:Context,p:any,kind:string,payload:any,reason?:string,sess?:any){
  return insert(c,'proposals',{project_id:p.id,session_id:sess?.id||null,kind,payload,reason:reason||null,origin:await origin(c,sess)});
}
export async function startSession(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project),cp=await checkpoint(c,p,a.checkpoint);
  if(!cp)throw new Error('No unlocked checkpoint. Approve a plan or finish its prerequisites first.');
  const now=Date.now();
  const {data,error}=await scoped(c,'sessions').eq('project_id',p.id).eq('state','open').order('last_activity_at',{ascending:false});
  if(error)throw new Error(error.message);
  const found=(data||[]).find((x:any)=>x.checkpoint_id===(cp?.id||null)&&now-new Date(x.last_activity_at).getTime()<3*3600000);
  if(found)return 'continuing S'+found.number;
  for(const x of data||[])if(now-new Date(x.last_activity_at).getTime()>3*3600000)await update(c,'sessions',x.id,{state:'ended',ended_at:new Date().toISOString(),summary:'Interrupted',goal_met:null});
  // Optimistic compare-and-set avoids assigning the same project-local number twice.
  if(c.batch)c.batch.push({op:'update',table:'projects',where:{id:p.id},expected:{next_session_number:p.next_session_number},values:{next_session_number:p.next_session_number+1}});
  else await update(c,'projects',p.id,{next_session_number:p.next_session_number+1});
  const s=await insert(c,'sessions',{project_id:p.id,number:p.next_session_number,goal:a.goal,style:a.style||p.style,checkpoint_id:cp?.id||null,client:a.client});
  if(cp && cp.status==='not_started')await update(c,'checkpoints',cp.id,{status:'in_progress',current_step:1});
  return 'started S'+s.number+(cp?' on '+cp.code+' (step '+(cp.current_step||1)+'/'+cp.steps.length+')':'');
}
export async function saveProgress(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project);
  const s=await session(c,p,a.session);
  // DB-1 CONTRACT #220 provides an owner-, project-, session-, and checkpoint-scoped
  // Postgres transaction. Never split events and checkpoint updates across REST calls.
  const payload:Record<string,unknown>={};
  for(const key of ['step','events','misconception','resolved','next_question','diagnostics']){
    if(a[key]!==undefined)payload[key]=a[key];
  }
  const result=await rpc(c,'save_progress',{
    p_user_id:c.userId,p_project_id:p.id,p_session_id:s.id,p_payload:payload
  });
  return 'saved S'+s.number+': step '+(result?.step??s.resume_step??0)+', '+(result?.events??0)+' events';
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
  const {data:sources,error:sourceError}=await scoped(c,'sources','short').eq('project_id',p.id).order('created_at').limit(1);
  if(sourceError)throw new Error(sourceError.message);
  const book=sources?.[0]?.short;
  for(const card of a.cards){
    const front=normalizedFront(card.front);
    if(existing.has(front)){skipped++;continue}
    existing.add(front);
    if(card.checkpoint&&!cps.some((x:any)=>x.code.toLowerCase()===card.checkpoint.toLowerCase()))throw new Error('Unknown checkpoint '+card.checkpoint);
    const payload={front:card.front,back:card.back||'',type:card.type||'basic',kind:card.kind||'other',checkpoint:card.checkpoint,concept:card.concept,page:card.page,...(card.page&&book?{source:book}:{}),direct:!!a.direct};
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
  const {data:sources,error:sourceError}=await scoped(c,'sources','short').eq('project_id',p.id).order('created_at').limit(1);
  if(sourceError)throw new Error(sourceError.message);
  const book=sources?.[0]?.short;
  for(const idea of a.concepts||[])planningFields(idea);
  const converted=a.checkpoints.map((x:any,i:number)=>{
    if(/^(read|review)\b/i.test(x.criterion.trim()))throw new Error('Criterion must be work the student produces');
    if((x.prereqs||[]).some((n:number)=>n<1||n>i))throw new Error('Prerequisites must be earlier checkpoint indexes');
    planningFields(x);
    return {...(x.stage!==undefined?{stage:x.stage}:{}),code:'CP'+(i+1),title:x.title,objective:x.objective,criterion:x.criterion,steps:x.steps,pages:x.pages,...(x.pages&&book?{source:book}:{}),prereqs:(x.prereqs||[]).map((n:number)=>'CP'+n),concepts:x.concepts||[],recheck_prompt:x.recheck_prompt};
  });
  await addProposal(c,p,'plan',{checkpoints:converted,concepts:a.concepts||[]},a.reason);
  return 'plan with '+converted.length+' checkpoints waits for approval in Lemma';
}
export async function proposePlanChange(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project);
  if(!(await checkpoints(c,p)).length)throw new Error('No plan yet; use propose_plan');
  const valid=['add','update','remove','move','prereq_add','prereq_remove'];
  if(a.ops.some((x:any)=>!valid.includes(x.op)))throw new Error('Unknown plan operation');
  for(const op of a.ops)planningFields(op);
  await addProposal(c,p,'plan_change',{ops:a.ops,diagnostics:a.diagnostics||[],...(a.book?{book:a.book}:{})},a.reason);
  return 'plan change ('+a.ops.length+' ops) waits for approval';
}
export async function createProject(c:Context,a:any):Promise<string>{
  planningFields(a);
  const st=await settings(c);
  const styles=await all(c,'styles','key');
  const chosen=a.style ?? st.default_style ?? 'socratic';
  if(!styles.some((x:any)=>x.key===chosen))throw new Error('Unknown style key. Available: '+styles.map((x:any)=>x.key).join(', '));
  const existingSubjects=a.subject?await all(c,'subjects','id,name'):[];
  const found=a.subject?reuseSubject(existingSubjects,a.subject):null;
  const subject=a.subject?(found||await insert(c,'subjects',{name:a.subject,glyph:a.glyph||a.subject.slice(0,1),hue:'amber'})):null;
  const existing=await all(c,'projects','slug');
  let base=slug(a.title);if(base.length<2)base='study';
  let unique=base;for(let i=2;existing.some((p:any)=>p.slug===unique);i++)unique=base.slice(0,35)+'-'+i;
  const p=await insert(c,'projects',{subject_id:subject?.id||null,title:a.title,slug:unique,goal:a.goal||null,status:'planning',style:chosen,target_date:a.target_date??null,target_label:a.target_label??null});
  let attached=0;
  if(a.book){
    const src=slug(a.book_short||a.book).slice(0,20)||'book';
    await insert(c,'sources',{project_id:p.id,title:a.book,short:src,filename:src+'.pdf',page_count:0,has_text:false,status:'ready'});
    attached++;
  }
  const seen=new Set<string>();
  for(const book of a.books||[]){
    if(book.sha256&&seen.has(book.sha256))continue;
    if(book.sha256)seen.add(book.sha256);
    await insert(c,'sources',{project_id:p.id,title:book.title,filename:book.filename,
      ...(book.kind?{kind:book.kind}:{}),...(book.sha256?{sha256:book.sha256}:{}),
      page_count:0,has_text:false,status:'uploading'});
    attached++;
  }
  return 'created '+unique+' (planning)'+(subject?' in '+subject.name+(found?' (reused existing subject)':' (new subject)'):'; subject pending')+
    (attached?' with '+attached+' source record(s); upload PDF bytes in Lemma':'')+'. Tutor can now propose a plan for student approval.';
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
  return capped(lines.join('\n')||'No pending proposals.',2000);
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