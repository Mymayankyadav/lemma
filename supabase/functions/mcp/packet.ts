import { Context, all, scoped } from './db.ts';
import { project, checkpoints } from './resolve.ts';
import { cut, capped, date } from './text.ts';
import { day, display, ui, goalEta } from './derive.ts';
import { STUDY, PLANNING, MIX, studyRules } from './rules.ts';
import { stateOf, flagOn, resumeBlocks, timeLine, flagLines, tokens, briefNodes } from './adaptive.ts';
import { renderQueue } from '../_shared/adaptive/queue.ts';
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
    scoped(c,'reviews','id,card_id,reviewed_at,state_before').is('undone_at',null).gte('reviewed_at',new Date(Date.now()-172800000).toISOString()).limit(1000)
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
    for(const p of ps){const cps=await checkpoints(c,p),cp=cps.find((x:any)=>x.status==='in_progress')||cps.find((x:any)=>x.status==='not_started');if(cp)fragments.push(p.slug+' '+cp.code+' '+cp.title+' step '+cp.current_step+'/'+cp.steps.length);const re=flagOn(s,'recheck_v2')?null:cps.find((x:any)=>x.recheck_due&&x.recheck_due<=day(s)&&x.recheck_prompt);if(re)warm.push(p.slug+' '+re.code+': '+re.recheck_prompt)}
    lines[1]+=' '+fragments.join(' | ');if(warm.length)lines.push('WARM '+cut(warm.join('; '),300));
    const n=await counts(c,s);lines.push('CARDS '+n.due+' due; '+n.pending+' proposals waiting');
    if(!args.brief)lines.push('RULES\n'+(s.tutor_rules||studyRules(s.flags||{}))+'\n'+MIX);
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
  const warm=flagOn(s,'recheck_v2')?[]:cps.filter((x:any)=>x.status==='demonstrated'&&(x.needs_revisit||(x.recheck_due&&x.recheck_due<=day(s)))&&x.recheck_prompt).sort((a:any,b:any)=>(a.recheck_due||'').localeCompare(b.recheck_due||'')).slice(0,2);
  const n=await counts(c,s);
  const lines=['LEMMA '+p.title+' ['+p.slug+'] style '+p.style,'GOAL '+cut(p.goal,160)+goalEta(p,cps)+scheduleHint(p,cps)];
  if(cp){const step=cp.steps?.[Math.max(0,(open?.resume_step||cp.current_step||1)-1)];lines.push('NOW '+cp.code+' '+cp.title+', step '+(open?.resume_step||cp.current_step||1)+'/'+(cp.steps||[]).length+(step?': '+cut(step,100):''));lines.push('CRIT '+cut(cp.criterion,400))}
  else lines.push('NOW all checkpoints done');
  if(latest){const last='LAST S'+latest.number+' '+date(latest.last_activity_at)+' '+display(latest)+(latest.goal_met?' goal '+latest.goal_met:'')+(latest.state==='ended'&&latest.summary?': '+cut(latest.summary,160):latest.resume_note?': '+cut(latest.resume_note,160):'')+(latest.state==='open'&&latest.resume_question?' | ask: '+cut(latest.resume_question,300):'');lines.push(last)}
  if(fix.length)lines.push('FIX '+cut(fix.map((x:any)=>x.label+' ('+x.times+'x)').join('; '),250));
  if(warm.length)lines.push('WARM '+cut(warm.map((x:any)=>x.code+': '+x.recheck_prompt).join('; '),300));
  lines.push('CARDS '+n.due+' due; '+n.pending+' proposals waiting; '+n.comments+' card notes');
  if(cp?.pages){const src=sources.find((x:any)=>x.id===cp.source_id)||sources[0];if(src)lines.push('SRC '+src.short+' "'+cut(src.title,40)+'" pp '+cp.pages+': '+(src.page_count===0?'attached in chat':'read_pages(source="'+src.short+'", from="'+cp.pages.split('-')[0]+'", to="'+(cp.pages.split('-')[1]||cp.pages)+'")'))}
  if(!args.brief){lines.push('STYLE '+(style?.name||p.style)+': '+(style?.instructions||''));lines.push('RULES\n'+(s.tutor_rules||studyRules(s.flags||{})))}
  // Shorten optional content first; never lose NOW, CRIT or the rules header.
  let result=lines.filter(Boolean).join('\n');
  if(result.length>2400){const i=lines.findIndex(x=>x.startsWith('LAST '));if(i>=0)lines[i]=cut(lines[i],180);result=lines.join('\n')}
  if(result.length>2400){for(const tag of ['FIX ','WARM ','GOAL ']){const i=lines.findIndex(x=>x.startsWith(tag));if(i>=0)lines[i]=cut(lines[i],tag==='GOAL '?90:90);result=lines.join('\n');if(result.length<=2400)break}}
  return capped(result,2400);
}
/** Resume v2 (flag time_block): OWNER, RULES, TIME, QUEUE, BRIEF, FLAGS; the server adds NEXT. Budget ≤ 1500 tokens excl. OWNER. */
const RESUME_BUDGET_CHARS=4300;
async function packetV2(c:Context,args:{project?:string;mix?:boolean;brief?:boolean},st:any,adapt?:string):Promise<string>{
  const {state,rows}=await stateOf(c);
  c.next='start_session; work the QUEUE top first, then teach';
  const rules=st.tutor_rules||studyRules(st.flags||{});
  const ps=visibleProjects(await all(c,'projects','*'));
  if(!args.project&&!args.mix){
    const lines=[timeLine(state),renderQueue(state.queue,8)];
    const f=flagLines(state);if(f.length)lines.push('FLAGS\n'+f.slice(0,8).map(x=>'- '+x).join('\n'));
    const l=await list(c,st);
    return capped([l,...lines].join('\n'),RESUME_BUDGET_CHARS);
  }
  if(args.mix){
    const active=ps.filter((x:any)=>x.status==='active');
    const now=[];
    for(const p of active){const cps=await checkpoints(c,p),cp=cps.find((x:any)=>x.status==='in_progress')||cps.find((x:any)=>x.status==='not_started'&&x.plan_state!=='deferred');if(cp)now.push(p.slug+' '+cp.code+' '+cut(cp.title,40)+' step '+(cp.current_step||1)+'/'+cp.steps.length)}
    const body=resumeBlocks(state,rows,undefined,args.brief?'(rules as in the last resume)':rules+'\n'+MIX,{now:now.length?'NOW '+now.join(' | '):undefined});
    return capped(body,RESUME_BUDGET_CHARS);
  }
  const p=await project(c,args.project);
  if(p.status==='planning')return basePacket(c,args);
  const cps=await checkpoints(c,p);
  const open=(await scoped(c,'sessions').eq('project_id',p.id).eq('state','open').order('last_activity_at',{ascending:false}).limit(1)).data?.[0];
  const latest=(await scoped(c,'sessions').eq('project_id',p.id).order('started_at',{ascending:false}).limit(1)).data?.[0];
  const finished=new Set(cps.filter((x:any)=>x.status==='demonstrated').map((x:any)=>x.id));
  const prereqs=rows.prereqs.filter((x:any)=>cps.some((z:any)=>z.id===x.checkpoint_id));
  const live=(x:any)=>(x.plan_state||'active')==='active';
  const next=cps.find((x:any)=>x.status==='not_started'&&live(x)&&prereqs.filter((e:any)=>e.checkpoint_id===x.id).every((e:any)=>finished.has(e.prereq_id)||!live(cps.find((z:any)=>z.id===e.prereq_id)||{})));
  const cp=cps.find((x:any)=>x.id===open?.checkpoint_id)||cps.find((x:any)=>x.status==='in_progress')||next;
  const fix=(await scoped(c,'misconceptions').eq('project_id',p.id).is('resolved_at',null).order('last_seen_at',{ascending:false}).limit(3)).data||[];
  const sources=(await scoped(c,'sources').eq('project_id',p.id).order('added_at',{ascending:false})).data||[];
  const step=cp?.steps?.[Math.max(0,(open?.resume_step||cp.current_step||1)-1)];
  const n=await counts(c,st);
  const src=cp?.pages?(()=>{const s=sources.find((x:any)=>x.id===cp.source_id)||sources[0];return s?'SRC '+s.short+' "'+cut(s.title,40)+'" pp '+cp.pages+': '+(s.page_count===0?'attached in chat':'read_pages(source="'+s.short+'", from="'+cp.pages.split('-')[0]+'", to="'+(cp.pages.split('-')[1]||cp.pages)+'")'):undefined})():undefined;
  const names=new Map(rows.concepts.map((x:any)=>[x.id,x.name]));
  const mandatory=state.queue.items.filter(x=>x.reason_code==='mandatory_prereq').map(x=>{
    const r=state.rechecks.rechecks.find(y=>(names.get(y.class_id)??y.class_id)+'/'+y.level===x.ref);return x.ref+': '+(r?.prompt??'')});
  const body=resumeBlocks(state,rows,p.slug,args.brief?'(rules as in the last resume)':rules,{
    now:cp?'NOW '+cp.code+' '+cut(cp.title,60)+', step '+(open?.resume_step||cp.current_step||1)+'/'+(cp.steps||[]).length+(step?': '+cut(step,100):'')+'\nCRIT '+cut(cp.criterion,300):'NOW all checkpoints done',
    last:latest?'LAST S'+latest.number+' '+date(latest.last_activity_at)+' '+display(latest)+(latest.goal_met?' goal '+latest.goal_met:'')+(latest.state==='ended'&&latest.summary?': '+cut(latest.summary,140):latest.resume_note?': '+cut(latest.resume_note,140):'')+(latest.state==='open'&&latest.resume_question?' | ask: '+cut(latest.resume_question,250):''):undefined,
    fix:fix.length?'FIX '+cut(fix.map((x:any)=>x.label+' ('+x.times+'x)').join('; '),200):undefined,
    cards:'CARDS '+n.due+' due; '+n.pending+' proposals waiting; '+n.comments+' card notes',src,adapt,mandatory:mandatory.slice(0,3),nodes:briefNodes(state,rows,cp?.id)});
  return capped(body,RESUME_BUDGET_CHARS);
}
export async function packet(c:Context,args:{project?:string;mix?:boolean;brief?:boolean}):Promise<string>{
 const st=await settings(c);const v2=flagOn(st,'time_block');const p=args.project?await project(c,args.project):null;
 const owner=(st.master_prompt||p?.prompt)?['OWNER (follow first; overrides STYLE and RULES)',st.master_prompt,p?.prompt].filter(Boolean).join('\n'):'';
 const diagnostics=await all(c,'diagnostics');const sources=await all(c,'sources');
 const ids=new Set(visibleProjects(await all(c,'projects','id,status,system')).map(x=>x.id));
 const allowed=(id:string)=>p?id===p.id:ids.has(id);
 const active=diagnostics.filter(x=>allowed(x.project_id)&&['open','confirmed'].includes(x.status)&&!(flagOn(st,'recheck_v2')&&x.kind==='pace')).sort((a,b)=>b.severity-a.severity||b.times-a.times).slice(0,3);
 const adapt=active.map(x=>'D'+x.no+' '+x.kind+' '+x.topic+' ('+x.times+'x, '+x.status+')');
 const fresh=sources.filter(x=>allowed(x.project_id)&&!x.plan_checked_at).map(x=>'NEW '+x.short);
 const {ADAPT}=await import('./rules.ts');
 // Fixture (system) projects are outside the adaptive state (visibleProjects), so v2 has no TIME or QUEUE for them:
 // they keep the legacy packet. Real projects get v2 with the same ADAPT data line the legacy packet carries.
 if(v2&&!p?.system)return [owner,await packetV2(c,args,st,adapt.length||fresh.length?'ADAPT '+cut([...adapt,...fresh].join('; '),300):undefined)].filter(Boolean).join('\n');
 let body=await basePacket(c,args);const extra=[...(adapt.length||fresh.length?['ADAPT '+cut([...adapt,...fresh].join('; '),300)]:[]),args.brief?'':ADAPT].filter(Boolean).join('\n');body=body.replace('RULES\n','RULES\n'+(args.brief?'':ADAPT+'\n'));const budget=2340;const line=adapt.length||fresh.length?'ADAPT '+cut([...adapt,...fresh].join('; '),Math.max(50,budget-body.length-1)):'';return [owner,capped(body+(line?'\n'+line:''),budget)].filter(Boolean).join('\n');
}
