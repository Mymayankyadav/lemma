import { Context, all, scoped } from './db.ts';
import { project, checkpoints } from './resolve.ts';
import { cut, capped, date } from './text.ts';
import { day, display, ui, goalEta } from './derive.ts';
import { STUDY, PLANNING, MIX } from './rules.ts';
import { sourceLine, visibleProjects, scheduleHint } from './v3.ts';
export async function settings(c:Context):Promise<any>{
  const {data,error}=await scoped(c,'settings').maybeSingle();
  if(error||!data)throw new Error('Owner settings not initialized; run bootstrap first');
  return data;
}
export async function counts(c:Context,s:any):Promise<{due:number;pending:number;comments:number}>{
  // Connector uses a privileged key: every owner-facing total must explicitly
  // exclude archived and system projects, not rely on app-side RLS policies.
  const visible=visibleProjects(await all(c,'projects','id,status,system'));
  const projectIds=new Set(visible.map(x=>x.id));
  const notes=(await all(c,'notes','id,project_id')).filter(x=>projectIds.has(x.project_id));
  const noteIds=new Set(notes.map(x=>x.id));
  const cards=(await all(c,'cards','id,note_id')).filter(x=>noteIds.has(x.note_id));
  const cardIds=new Set(cards.map(x=>x.id));
  const [props,comments,rows,reviews]=await Promise.all([
    scoped(c,'proposals','id,project_id').eq('status','pending'),
    scoped(c,'card_comments','id,note_id').eq('status','open'),
    scoped(c,'v_due_cards','card_id,state,due').limit(2000),
    scoped(c,'reviews','id,card_id,reviewed_at,state_before').gte('reviewed_at',new Date(Date.now()-172800000).toISOString()).limit(1000)
  ]);
  for(const x of [props,comments,rows,reviews])if(x.error)throw new Error(x.error.message);
  const today=day(s);
  const dueRows=(rows.data||[]).filter((x:any)=>cardIds.has(x.card_id));
  const reviewedToday=(reviews.data||[]).filter((x:any)=>cardIds.has(x.card_id)&&day(s,x.reviewed_at)===today);
  const newDone=reviewedToday.filter((x:any)=>x.state_before===0).length;
  const due=dueRows.filter((x:any)=>x.state!==0&&day(s,x.due)<=today).length;
  const fresh=Math.min(Math.max(0,(s.new_per_day??20)-newDone),dueRows.filter((x:any)=>x.state===0).length);
  const capacity=Math.max(0,(s.reviews_per_day??200)-reviewedToday.length);
  return {due:Math.min(capacity,due+fresh),
    pending:(props.data||[]).filter((x:any)=>projectIds.has(x.project_id)).length,
    comments:(comments.data||[]).filter((x:any)=>noteIds.has(x.note_id)).length};
}
async function list(c:Context,s:any):Promise<string>{
  const ps=visibleProjects(await all(c,'projects','id,slug,title,status,last_activity_at,system'));
  const ss=await all(c,'sessions','project_id,number,state,last_activity_at,checkpoint_id');
  const cs=await all(c,'checkpoints','id,project_id,code,title,status');
  const lines=['LEMMA projects. Ask which one, or resume with mix=true.'];
  for(const p of ps.sort((a:any,b:any)=>(b.last_activity_at||'').localeCompare(a.last_activity_at||''))){
    const open=ss.filter((x:any)=>x.project_id===p.id&&x.state==='open').sort((a:any,b:any)=>b.last_activity_at.localeCompare(a.last_activity_at))[0];
    const cp=cs.find((x:any)=>x.id===open?.checkpoint_id)||cs.find((x:any)=>x.project_id===p.id&&x.status==='in_progress');
    lines.push(p.slug+' '+p.title+': '+(p.status==='planning'?'needs plan':cp?cp.code+' '+cp.title+(open?', '+display(open):''):'no current checkpoint'));
  }
  const n=await counts(c,s);lines.push('CARDS '+n.due+' due; '+n.pending+' proposals waiting');
  return capped(lines.join('\n'),2400);
}
async function basePacket(c:Context,args:{project?:string;mix?:boolean;brief?:boolean}):Promise<string>{
  const s=await settings(c);
  if(!args.project&&!args.mix)return list(c,s);
  if(args.mix){
    const ps=visibleProjects(await all(c,'projects','*')).filter((x:any)=>x.status==='active');
    const lines=['LEMMA mix: '+ps.map((x:any)=>x.slug).join(', '),'NOW'];
    const fragments:string[]=[];const warm:string[]=[];
    for(const p of ps){const cps=await checkpoints(c,p),cp=cps.find((x:any)=>x.status==='in_progress')||cps.find((x:any)=>x.status==='not_started');if(cp)fragments.push(p.slug+' '+cp.code+' '+cp.title+' step '+cp.current_step+'/'+cp.steps.length);const re=cps.find((x:any)=>x.recheck_due&&x.recheck_due<=day(s)&&x.recheck_prompt);if(re)warm.push(p.slug+' '+re.code+': '+re.recheck_prompt)}
    lines[1]+=' '+fragments.join(' | ');if(warm.length)lines.push('WARM '+cut(warm.join('; '),300));
    const n=await counts(c,s);lines.push('CARDS '+n.due+' due; '+n.pending+' proposals waiting');
    if(!args.brief)lines.push('RULES\n'+(s.tutor_rules||STUDY)+'\n'+MIX);
    return capped(lines.join('\n'),2400);
  }
  const p=await project(c,args.project);
  const sources=(await scoped(c,'sources').eq('project_id',p.id).order('added_at',{ascending:false})).data||[];
  const style=(await scoped(c,'styles').eq('key',p.style).maybeSingle()).data;
  if(p.status==='planning'){
    const src=sources.map((x:any)=>sourceLine(x)+' outline '+(x.outline||[]).length+' entries: get(what=outline)').join('; ');
    return capped(['LEMMA '+p.title+' ['+p.slug+'] PLANNING','GOAL '+cut(p.goal,1000)+goalEta(p,[]),src?'SRC '+src:'',args.brief?'':'STYLE '+(style?.name||p.style),args.brief?'':'RULES\n'+PLANNING].filter(Boolean).join('\n'),2400);
  }
  const cps=await checkpoints(c,p);const open=(await scoped(c,'sessions').eq('project_id',p.id).eq('state','open').order('last_activity_at',{ascending:false}).limit(1)).data?.[0];
  const latest=(await scoped(c,'sessions').eq('project_id',p.id).order('started_at',{ascending:false}).limit(1)).data?.[0];
  const prereqs=(await all(c,'checkpoint_prereqs','checkpoint_id,prereq_id')).filter((x:any)=>cps.some((z:any)=>z.id===x.checkpoint_id));
  const finished=new Set(cps.filter((x:any)=>x.status==='demonstrated').map((x:any)=>x.id));
  const next=cps.find((x:any)=>x.status==='not_started'&&prereqs.filter((edge:any)=>edge.checkpoint_id===x.id).every((edge:any)=>finished.has(edge.prereq_id)));
  const cp=cps.find((x:any)=>x.id===open?.checkpoint_id)||cps.find((x:any)=>x.status==='in_progress')||next;
  const fix=(await scoped(c,'misconceptions').eq('project_id',p.id).is('resolved_at',null).order('last_seen_at',{ascending:false}).limit(3)).data||[];
  const warm=cps.filter((x:any)=>x.status==='demonstrated'&&(x.needs_revisit||(x.recheck_due&&x.recheck_due<=day(s)))&&x.recheck_prompt).sort((a:any,b:any)=>(a.recheck_due||'').localeCompare(b.recheck_due||'')).slice(0,2);
  const n=await counts(c,s);
  const lines=['LEMMA '+p.title+' ['+p.slug+'] style '+p.style,'GOAL '+cut(p.goal,160)+goalEta(p,cps)+scheduleHint(p,cps)];
  if(cp){const step=cp.steps?.[Math.max(0,(open?.resume_step||cp.current_step||1)-1)];lines.push('NOW '+cp.code+' '+cp.title+', step '+(open?.resume_step||cp.current_step||1)+'/'+(cp.steps||[]).length+(step?': '+cut(step,100):''));lines.push('CRIT '+cut(cp.criterion,400))}
  else lines.push('NOW all checkpoints done');
  if(latest){const last='LAST S'+latest.number+' '+date(latest.last_activity_at)+' '+display(latest)+(latest.goal_met?' goal '+latest.goal_met:'')+(latest.state==='ended'&&latest.summary?': '+cut(latest.summary,160):latest.resume_note?': '+cut(latest.resume_note,160):'')+(latest.state==='open'&&latest.resume_question?' | ask: '+cut(latest.resume_question,300):'');lines.push(last)}
  if(fix.length)lines.push('FIX '+cut(fix.map((x:any)=>x.label+' ('+x.times+'x)').join('; '),250));
  if(warm.length)lines.push('WARM '+cut(warm.map((x:any)=>x.code+': '+x.recheck_prompt).join('; '),300));
  lines.push('CARDS '+n.due+' due; '+n.pending+' proposals waiting; '+n.comments+' card notes');
  if(cp?.pages){const src=sources.find((x:any)=>x.id===cp.source_id)||sources[0];if(src)lines.push('SRC '+src.short+' "'+cut(src.title,40)+'" pp '+cp.pages+': '+(src.page_count===0?'attached in chat':'read_pages(source="'+src.short+'", from="'+cp.pages.split('-')[0]+'", to="'+(cp.pages.split('-')[1]||cp.pages)+'")'))}
  if(!args.brief){lines.push('STYLE '+(style?.name||p.style)+': '+(style?.instructions||''));lines.push('RULES\n'+(s.tutor_rules||STUDY))}
  // Shorten optional content first; never lose NOW, CRIT or the rules header.
  let result=lines.filter(Boolean).join('\n');
  if(result.length>2400){const i=lines.findIndex(x=>x.startsWith('LAST '));if(i>=0)lines[i]=cut(lines[i],180);result=lines.join('\n')}
  if(result.length>2400){for(const tag of ['FIX ','WARM ','GOAL ']){const i=lines.findIndex(x=>x.startsWith(tag));if(i>=0)lines[i]=cut(lines[i],tag==='GOAL '?90:90);result=lines.join('\n');if(result.length<=2400)break}}
  return capped(result,2400);
}
export async function packet(c:Context,args:{project?:string;mix?:boolean;brief?:boolean}):Promise<string>{
 const st=await settings(c);const p=args.project?await project(c,args.project):null;
 const owner=(st.master_prompt||p?.prompt)?['OWNER (follow first; overrides STYLE and RULES)',st.master_prompt,p?.prompt].filter(Boolean).join('\n'):'';
 const diagnostics=await all(c,'diagnostics');const sources=await all(c,'sources');
 const ids=new Set(visibleProjects(await all(c,'projects','id,status,system')).map(x=>x.id));
 const allowed=(id:string)=>p?id===p.id:ids.has(id);
 const active=diagnostics.filter(x=>allowed(x.project_id)&&['open','confirmed'].includes(x.status)).sort((a,b)=>b.severity-a.severity||b.times-a.times).slice(0,3);
 const adapt=active.map(x=>'D'+x.no+' '+x.kind+' '+x.topic+' ('+x.times+'x, '+x.status+')');
 const fresh=sources.filter(x=>allowed(x.project_id)&&!x.plan_checked_at).map(x=>'NEW '+x.short);
 const {ADAPT}=await import('./rules.ts');
 let body=await basePacket(c,args);const extra=[...(adapt.length||fresh.length?['ADAPT '+cut([...adapt,...fresh].join('; '),300)]:[]),args.brief?'':ADAPT].filter(Boolean).join('\n');body=body.replace('RULES\n','RULES\n'+(args.brief?'':ADAPT+'\n'));const budget=2340;const line=adapt.length||fresh.length?'ADAPT '+cut([...adapt,...fresh].join('; '),Math.max(50,budget-body.length-1)):'';return [owner,capped(body+(line?'\n'+line:''),budget)].filter(Boolean).join('\n');
}
