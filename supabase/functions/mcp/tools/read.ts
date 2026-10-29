import { Context, scoped, all } from '../db.ts';
import { project, checkpoints, checkpoint, session, source } from '../resolve.ts';
import { settings, packet } from '../packet.ts';
import { day, ui, display } from '../derive.ts';
import { cut, capped, date, pageRange, number } from '../text.ts';

export async function get(c: Context, a:any):Promise<string>{
  if(a.what==='projects')return packet(c,{});
  const p=await project(c,a.project);
  const limit=Math.min(a.limit||20,50), pcs=await checkpoints(c,p);
  const ids=new Map(pcs.map((x:any)=>[x.id,x]));
  const prereqs=(await all(c,'checkpoint_prereqs')).filter((x:any)=>ids.has(x.checkpoint_id));
  const s=await settings(c);
  const status=(cp:any)=>ui(cp,prereqs.filter((x:any)=>x.checkpoint_id===cp.id).map((x:any)=>x.prereq_id),ids,day(s));
  if(a.what==='plan'){
    const done=pcs.filter((x:any)=>x.status==='demonstrated').length;
    const lines=['PLAN '+p.slug+' '+done+'/'+pcs.length+' done'];
    for(const cp of pcs){const needs=prereqs.filter((x:any)=>x.checkpoint_id===cp.id).map((x:any)=>ids.get(x.prereq_id)?.code).filter(Boolean);
      lines.push(cp.code+' '+status(cp)+(status(cp)==='now'?' step '+cp.current_step+'/'+(cp.steps||[]).length:'')+' '+cp.title+(status(cp)==='locked'?' (needs '+needs.join(', ')+')':''))}
    const planned=(await scoped(c,'proposals').eq('project_id',p.id).eq('kind','plan_change').eq('status','pending')).data||[];
    for(const x of planned)for(const op of (x.payload?.ops||[]))if(op.op==='add')lines.push((op.code||'CP?')+' proposed '+op.title);
    return capped(lines.join('\n'),2000);
  }
  if(a.what==='checkpoint'){
    const cp=await checkpoint(c,p,a.id);
    if(!cp)throw new Error('No checkpoints yet; propose_plan first');
    const pre=prereqs.filter((x:any)=>x.checkpoint_id===cp.id).map((x:any)=>ids.get(x.prereq_id)?.code).filter(Boolean);
    const links=(await scoped(c,'checkpoint_concepts').eq('checkpoint_id',cp.id)).data||[];
    const concepts=(await all(c,'concepts')).filter((x:any)=>links.some((z:any)=>z.concept_id===x.id)).map((x:any)=>x.slug);
    const src=cp.source_id?(await scoped(c,'sources').eq('id',cp.source_id).maybeSingle()).data:null;
    const events=(await scoped(c,'session_events').eq('checkpoint_id',cp.id).order('created_at',{ascending:false}).limit(8)).data||[];
    const ss=(await all(c,'sessions')).filter((x:any)=>x.project_id===p.id);
    const lines=[cp.code+' '+cp.title+' ['+status(cp)+', step '+cp.current_step+'/'+cp.steps.length+']','OBJ '+cp.objective,'CRIT '+cp.criterion,'STEPS '+cp.steps.map((x:string,i:number)=>(i+1)+' '+x+(i+1<cp.current_step?' ✓':i+1===cp.current_step?' ←':'')).join(' | ') ];
    if(cp.pages)lines.push('PAGES '+(src?.short||'book')+' '+cp.pages);
    if(pre.length)lines.push('NEEDS '+pre.join(', '));if(concepts.length)lines.push('IDEAS '+concepts.join(', '));
    if(cp.recheck_due)lines.push('RECHECK due '+cp.recheck_due+': '+(cp.recheck_prompt||''));
    for(const e of events.reverse()){const ssn=ss.find((x:any)=>x.id===e.session_id);lines.push('S'+(ssn?.number||'?')+' '+e.kind+(e.hint_level?' L'+e.hint_level:'')+': '+cut(e.body,140))}
    return capped(lines.join('\n'),2000);
  }
  if(a.what==='session'){
    if(!a.id)throw new Error('Provide session id, e.g. S7');
    const x=await session(c,p,a.id);
    const ev=(await scoped(c,'session_events').eq('session_id',x.id).order('id',{ascending:true}).limit(100)).data||[];
    const lines=['S'+x.number+' '+display(x)+' '+date(x.last_activity_at)+' '+(x.minutes||0)+'m goal '+(x.goal_met||'pending'),'GOAL '+x.goal,'SUMMARY '+(x.summary||x.resume_note||'')];
    for(const e of ev.slice(-15))lines.push(e.kind+(e.hint_level?' L'+e.hint_level:'')+': '+cut(e.body,125));
    return capped(lines.join('\n'),2000);
  }
  if(a.what==='outline'){
    const src=await source(c,p,a.id);
    return capped([src.short+' outline',...(src.outline||[]).slice(0,80).map((x:any)=>'  '.repeat(Math.min(5,x.level||0))+'p.'+x.page+' '+x.title)].join('\n'),2000);
  }
  if(a.what==='cards'){
    let q=scoped(c,'notes','id,no,front,checkpoint_id,session_id').eq('project_id',p.id).eq('status','active').order('no',{ascending:false}).limit(300);
    const {data,error}=await q;if(error)throw new Error(error.message);
    let notes=data||[];
    if(a.id?.toUpperCase().startsWith('CP')){const cp=await checkpoint(c,p,a.id);notes=notes.filter((x:any)=>x.checkpoint_id===cp.id)}
    if(a.id?.toUpperCase().startsWith('S')){const sess=await session(c,p,a.id);notes=notes.filter((x:any)=>x.session_id===sess.id)}
    return capped(notes.slice(0,Math.min(limit,30)).map((x:any)=>'N'+x.no+' '+cut(x.front.replace(/[$]/g,''),140)).join('\n')+(notes.length>limit?'\n+'+(notes.length-limit)+' more':''),2000);
  }
  if(a.what==='feedback'){
    const notes=(await scoped(c,'notes','id,no,front,back').eq('project_id',p.id)).data||[];
    const map=new Map(notes.map((x:any)=>[x.id,x]));
    const comments=(await scoped(c,'card_comments').eq('status','open').order('created_at').limit(100)).data||[];
    return capped(comments.filter((x:any)=>map.has(x.note_id)).slice(0,10).map((x:any)=>{const n:any=map.get(x.note_id);return '#'+x.no+' on N'+n.no+': '+x.body+'\n  FRONT '+cut(n.front,160)+'\n  BACK '+cut(n.back,160)}).join('\n'),2000);
  }
  if(a.what==='concepts'){
    const subject=p.subject_id;
    const concepts=(await scoped(c,'concepts').eq('subject_id',subject).limit(60)).data||[];
    const links=(await all(c,'checkpoint_concepts')).filter((x:any)=>pcs.some((cp:any)=>cp.id===x.checkpoint_id));
    return capped(concepts.map((x:any)=>x.name+' — '+(links.some((l:any)=>l.concept_id===x.id)?'in plan':'not started')).join('\n'),2000);
  }
  throw new Error('Unknown get what');
}

export async function readPages(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project),src=await source(c,p,a.source);
  if(!src.has_text||src.page_count===0)return 'This PDF has no extractable text (scanned or attached in chat). Ask the user to paste the passage or read the attached PDF.';
  const labels=pageRange(a.from,a.to);
  let q=scoped(c,'source_pages').eq('source_id',src.id);
  if(a.pdf)q=q.gte('page',Number(labels[0])).lte('page',Number(labels[labels.length-1])).order('page');
  else q=q.in('label',labels).order('page');
  const {data,error}=await q;if(error)throw new Error(error.message);
  if(!data?.length)throw new Error('No pages found. Use get(what=outline) for page indexes.');
  const parts:string[]=[];
  for(const row of data.slice(0,5)){
    const head='=== p.'+(row.label||row.page)+' (pdf '+row.page+') ===\n';
    const room=12000-parts.join('\n').length-head.length-80;
    if(room<=0)break;
    parts.push(head+String(row.body||'').slice(0,room));
    if(String(row.body||'').length>room){parts.push('[cut, call again from p.'+(Number(row.page)+1)+']');break}
  }
  return parts.join('\n').slice(0,12000);
}
export async function search(c:Context,a:any):Promise<string>{
  const p=await project(c,a.project);
  const sources=(await scoped(c,'sources').eq('project_id',p.id)).data||[];
  if(!sources.length)return 'No PDFs in this project; check the book attached to chat.';
  const ids=sources.map((x:any)=>x.id);
  const q=scoped(c,'source_pages','source_id,page,label,body').in('source_id',ids).textSearch('tsv',a.query,{type:'websearch',config:'english'}).limit(Math.min(a.limit||5,8));
  const {data,error}=await q;if(error)throw new Error(error.message);
  if(!data?.length)return 'No matching pages. Try shorter search terms.';
  const lines=data.map((x:any)=>{
    const src=sources.find((y:any)=>y.id===x.source_id);
    const words=a.query.toLowerCase().split(/\s+/).filter(Boolean);
    const idx=Math.max(0,words.map((w:string)=>x.body.toLowerCase().indexOf(w)).filter((v:number)=>v>=0)[0]||0);
    return src.short+' p.'+(x.label||x.page)+' (pdf '+x.page+'): …'+cut(x.body.slice(Math.max(0,idx-60),idx+210),210)+'…';
  });
  return capped(lines.join('\n'),1500);
}