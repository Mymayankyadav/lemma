/* Additive only. The attached Lemma document, CSS, module archive, routes,
   navigation and existing component nodes remain intact. All additions carry
   data-carrel. __carrelIntegration.remove() unmounts the entire integration. */
(()=>{'use strict';
const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>Array.from(p.querySelectorAll(s)),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=JSON.parse($('#carrel-addition-config').textContent),v=cfg.variant;
const iconPaths={clock:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 4v5l3 2',play:'m8 5 11 7-11 7z',stop:'M6 6h12v12H6z',break:'M4 7h12v8a5 5 0 0 1-10 0V7m10 1h2a3 3 0 0 1 0 6h-2M4 21h14',focus:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',plan:'M4 5h16v16H4z M8 3v4m8-4v4M4 10h16 M8 14h2m4 0h2',plus:'M12 5v14M5 12h14',close:'M6 6l12 12M18 6 6 18',down:'m6 9 6 6 6-6',right:'m9 6 6 6-6 6',log:'M7 3h13v18H7zM3 7h8M3 12h8M3 17h8',urge:'M3 12h4l3-7 4 14 3-7h4',park:'M6 3h12v18l-6-4-6 4z',chart:'M4 20V4m0 16h17M8 16v-5m5 5V7m5 9v-8',leaf:'M4 20C2 6 10 3 20 4c1 10-3 17-13 13M5 19 15 9',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2'};
const ico=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[n]||iconPaths.clock}"/></svg>`;
const button=(text,op,cl='',attrs='')=>`<button type="button" class="cr-button ${cl}" data-cr="${op}" ${attrs}>${text}</button>`;
const ib=(ic,op,label,attrs='')=>`<button type="button" class="cr-icon" data-cr="${op}" aria-label="${E(label)}" title="${E(label)}" ${attrs}>${ico(ic)}</button>`;
let jointToastTimer=null;
let disabled=false,observer=null,themeObserver=null,tab='time',expanded=true,marginClosed=false,rootObserverQueued=false;
let S=window.__lemmaNotebook.getState();
const sessionStore=window.__lemmaSessionStore;
S.timer=sessionStore.init(S.timer);
const path=()=>location.hash.slice(1).split('?')[0]||'/';
const home=()=>path()==='/';
// Store elapsed seconds plus a wall-clock anchor: intervals are display-only and
// the stopwatch survives tab suspension or a reopened file.
const elapsed=()=>Math.max(0,(Number(S.timer.elapsed)||0)+(S.timer.running?Math.max(0,Date.now()-(Number(S.timer.stamp)||Date.now()))/1000:0));
const limit=()=>60*(Number(S.timer.phase==='break'?(S.timer.breakLength||S.timer.short):S.timer.focus)||50);
const completed=()=>S.timer.mode==='pomo'&&elapsed()>=limit();
const clock=()=>{const x=S.timer.mode==='pomo'?Math.max(0,Math.ceil(limit()-elapsed())):Math.max(0,Math.floor(elapsed()));return String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0')};
const timerStatus=()=>completed()?(S.timer.phase==='break'?'Break finished':'Focus interval complete'):S.timer.paused?'Paused':!S.timer.running?'Ready to start':S.timer.phase==='break'?'On a break':'In focus';

const total=()=>S.entries.reduce((n,e)=>n+e.min,0),dur=m=>m>=60?`${Math.floor(m/60)}h${m%60?' '+Math.round(m%60)+'m':''}`:Math.round(m)+'m';
const make=(tag,cls,html)=>{const el=document.createElement(tag);el.dataset.carrel='addition';el.className='cr '+cls;if(html!=null)el.innerHTML=html;return el};
const progress=()=>`<div class="cr-progress" aria-label="Current focus interval"><i data-cr-progress style="width:${Math.min(100,elapsed()/(S.timer.focus*60)*100)}%"></i></div>`;
// Only Lemma's integrated routes and inline timer controls are exposed.
function saveState(){S=window.__lemmaNotebook.commit(S,'shell');}
function notifyState(){saveState();refresh();postCalendar({stateSync:S});window.dispatchEvent(new Event('lemma:integrationchange'));}
function dateKey(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function crCloseShellStudySpan(t,at=Date.now()){
 if(t.phase!=='study'||!t.running)return;
 if(!Array.isArray(t.studyIntervals))t.studyIntervals=[];
 const start=Number(t.activeStudyStart)||Number(t.stamp)||0;
 if(start&&at>start&&!t.studyIntervals.some(x=>x.start===start&&x.end===at))
  t.studyIntervals.push({start,end:at});
 t.activeStudyStart=null;
}
function recordEffort(t,seconds,now=Date.now()){
 if(!Number.isFinite(seconds)||seconds<=0)return false;
 if(t.mode==='pomo')seconds=Math.min(seconds,Math.max(1,Number(t.focus)||50)*60);
 const identity=t.sessionId||('legacy-'+String(t.startedAt||t.stamp||t.rev||'unknown')+'-'+String(t.activity||''));
 const id='focus:'+identity;
 // Calendar and shell write the same local record identity. Repeated Finish
 // and cross-entry-point saves must not append a second item.
 if(S.entries.some(x=>x.id===id))return false;
 if(t.phase==='study'&&t.running)crCloseShellStudySpan(t,now);
 const segments=(Array.isArray(t.studyIntervals)?t.studyIntervals:[])
  .filter(x=>Number.isFinite(Number(x.start))&&Number.isFinite(Number(x.end))&&+x.end>+x.start)
  .map(x=>({start:+x.start,end:+x.end}));
 const approximate=!segments.length;
 if(approximate){
  // Prior/demo timers have no anchor. Retain their elapsed effort honestly.
  const end=t.phase==='break'?now-Math.max(0,Number(t.elapsed)||0)*1000:now;
  segments.push({start:end-seconds*1000,end});
 }
 const actualSeconds=approximate?seconds:segments.reduce((n,x)=>n+(x.end-x.start)/1000,0);
 const startMs=Math.min(...segments.map(x=>x.start)),endMs=Math.max(...segments.map(x=>x.end));
 const start=new Date(startMs),end=new Date(endMs),time=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
 S.entries.push({id,sessionId:identity,date:dateKey(start),subject:t.activity||'Study',
  title:t.intent||t.activity||'Study session',min:Math.max(1,Math.round(actualSeconds/60)),
  start:time(start),end:time(end),startInstant:start.toISOString(),endInstant:end.toISOString(),
  intervals:segments.map(x=>({start:new Date(x.start).toISOString(),end:new Date(x.end).toISOString()})),
  committedAt:new Date(now).toISOString(),timeApproximate:approximate,
  focus:'Unrated',note:'',projectId:t.projectId||U?.links?.[t.activity]||null,
  checkpointId:t.checkpointId||null,kind:t.kind||'proof'});
 return true;
}
function changeTimer(action,data={}){
 S=window.__lemmaNotebook.getState();S.timer=sessionStore.get();
 const plannedBlock=action==='start-block'?S.blocks.find(block=>block.id===data.blockId):null;
 if(action==='start-block'&&(!plannedBlock||plannedBlock.actual||plannedBlock.busy||plannedBlock.futureLog)){jointToast('This study block is no longer available to start.');return false}
 const t=S.timer,now=Date.now(),e=elapsed(),baseRev=Number(t.rev)||0,entriesAtStart=S.entries.length,beforeLogged=window.__lemmaEffortMetrics.allTime(S.entries,now).committedMinutes;let finishNotice=null;
 if(!t.sessionId)t.sessionId='legacy-'+String(t.startedAt||t.stamp||t.rev||'unknown')+'-'+String(t.activity||'');
 if(action==='focus'){openFocus();return;}
 if(action==='focus-close'){closeFocus();return;}
 if(action==='finish'||action==='discard'){
  const studySec=t.phase==='break'?(Number(t.studyElapsed)||0):e;
  if(!(t.running||t.paused)){jointToast('There is no active session to save.');return;}
  if(action==='finish'){
    if('minutes' in data&&(!Number.isFinite(Number(data.minutes))||Number(data.minutes)<1||Number(data.minutes)>1440)){jointToast('Enter a duration from 1 to 1,440 minutes.');return}
    const identity=t.sessionId;recordEffort(t,studySec||Number(data.minutes)*60,now);const record=S.entries.find(entry=>entry.sessionId===identity);
    if(record){record.focus=data.rating||'Unrated';record.note=data.note||'';const requested=Number(data.minutes);
      if(Number.isFinite(requested)&&requested>=1&&Math.abs(requested-Math.round(studySec/60))>.1){const end=now,start=end-requested*60000;record.min=requested;record.date=dateKey(new Date(start));record.start=new Date(start).toTimeString().slice(0,5);record.end=new Date(end).toTimeString().slice(0,5);record.intervals=[{start:new Date(start).toISOString(),end:new Date(end).toISOString()}];record.timeApproximate=true;record.editedTimeRange=true;}
      S.lastLogged={minutes:record.min,subject:record.subject,checkpointId:record.checkpointId,at:now};
      const added=Math.max(0,window.__lemmaEffortMetrics.allTime(S.entries,now).committedMinutes-beforeLogged),overlap=Math.max(0,Number(record.min)-added);
      S.lastLogged.addedMinutes=added;S.lastLogged.overlapMinutes=overlap;
      finishNotice=Math.round(record.min)+' min saved'+(overlap>=.5?' · '+Math.round(overlap)+' min overlapped existing records.':' to '+(t.activity||'Study')+'.');
    }
  }
  Object.assign(t,{elapsed:0,stamp:now,running:false,paused:false,phase:'study',studyElapsed:0,studyIntervals:[],activeStudyStart:null,sessionId:null,startedAt:null});if(action==='discard')jointToast('Session discarded without logging.');
 }else if(action==='pause'){
  if(!t.running)return;
  crCloseShellStudySpan(t,now);Object.assign(t,{elapsed:e,stamp:now,running:false,paused:true});
 }else if(action==='resume'){
  if(!t.paused||completed())return;
  Object.assign(t,{stamp:now,activeStudyStart:now,running:true,paused:false});
 }else if(action==='break'){
  if(t.phase==='break'){
   const nextFocus=t.mode==='pomo'&&(t.studyElapsed||0)>=t.focus*60;
   if(nextFocus)recordEffort(t,Number(t.studyElapsed)||0,now);
   Object.assign(t,{phase:'study',elapsed:nextFocus?0:(Number(t.studyElapsed)||0),studyElapsed:0,stamp:now,activeStudyStart:now,studyIntervals:nextFocus?[]:(t.studyIntervals||[]),sessionId:nextFocus?crypto.randomUUID():t.sessionId,startedAt:nextFocus?now:t.startedAt,running:true,paused:false,cycle:(Number(t.cycle)||1)+(nextFocus?1:0)});
  }else if(t.running||t.paused){
   crCloseShellStudySpan(t,now);Object.assign(t,{studyElapsed:t.mode==='pomo'?Math.min(e,t.focus*60):e,breakLength:(Number(t.cycle)||1)%(Number(t.every)||4)===0?(Number(t.long)||20):(Number(t.short)||10),phase:'break',elapsed:0,stamp:now,activeStudyStart:null,running:true,paused:false});
  }else{changeTimer('start',data);return;}
 }else if(action==='start'||action==='start-review-block'||action==='subject-start'||action==='start-block'){
  const nextCycle=action==='start'&&t.mode==='pomo'&&e>=limit();
  if((t.running||t.paused)&&e>0){recordEffort(t,t.phase==='break'?(t.studyElapsed||0):e,now);jointToast('Previous study time saved. New session started.');}
   Object.assign(t,{elapsed:0,studyElapsed:0,stamp:now,activeStudyStart:now,studyIntervals:[],sessionId:crypto.randomUUID(),startedAt:now,running:true,paused:false,phase:'study',blockId:plannedBlock?.id||null});if(nextCycle)t.cycle=(Number(t.cycle)||1)+1;
   const project=data.jointProject;
   if(project){Object.assign(t,{activity:project.name,project:project.name,projectId:project.id,checkpointId:project.cp||null,checkpoint:project.cp?project.cp+' · '+project.checkpoint:'Project-level work',intent:project.cp?'Work on '+project.cp+' · '+project.checkpoint:'Study '+project.name,kind:'proof',focus:rhythm().defaultFocus,short:rhythm().defaultShort,long:rhythm().defaultLong,every:rhythm().defaultEvery,mode:rhythm().defaultMode,cycle:1});}
   else if(data.id){const id=data.id,name=id==='linear-algebra'?'Linear Algebra':id==='real-analysis'?'Real Analysis':id==='topology'?'Topology':id;Object.assign(t,{activity:name,project:name,projectId:U.links[name]||null,checkpointId:null,checkpoint:'Project-level work',intent:'Study '+name,kind:'proof',focus:rhythm().defaultFocus,cycle:1});} 

  if(plannedBlock){const defaults=rhythm(),project=window.__lemmaNotebook.getProjects().find(p=>p.id===plannedBlock.projectId||p.slug===plannedBlock.projectId),preset=/^(\d+)\/(\d+)$/.exec(plannedBlock.pomo||'');
   Object.assign(t,{activity:plannedBlock.subject||'Study',project:project?.title||plannedBlock.subject||'Study',projectId:plannedBlock.projectId||U.links[plannedBlock.subject]||null,checkpointId:plannedBlock.checkpointId||null,checkpoint:plannedBlock.checkpointId||'Planned study',intent:plannedBlock.title,kind:plannedBlock.kind||'proof',focus:preset?Number(preset[1]):Math.min(180,Math.max(1,Number(plannedBlock.min)||defaults.defaultFocus)),short:preset?Number(preset[2]):defaults.defaultShort,long:defaults.defaultLong,every:defaults.defaultEvery,mode:plannedBlock.pomo==='Off'||Number(plannedBlock.min)>180?'open':defaults.defaultMode,cycle:1,blockId:plannedBlock.id});
  }
  if(action==='start-review-block'||data.reviewSession){t.activity='Recall & review';t.mode='pomo';t.kind='review';t.cycle=1;t.project='Mixed decks';t.projectId=null;t.checkpointId=null;t.checkpoint='Today’s review';t.intent='Recall and grade today’s cards';t.focus=data.minutes||90}
 }else if(action==='noticed'){S.notices=(S.notices||0)+1;jointToast('Distraction noted. Return when you’re ready.')}
 else if(action==='drift'){S.drift=(S.drift||0)+1}
 else if(action==='park'){
  const idea=String(data.text||'').trim();
  if(idea&&idea.length<=180){S.parked.unshift({id:'p-'+crypto.randomUUID(),text:idea,subject:t.activity,sessionId:t.sessionId,createdAt:new Date(now).toISOString(),done:false});jointToast('Thought parked for later.');}
  else if(!idea){window.dispatchEvent(new Event('lemma:park-request'));return;}
  else{jointToast('Keep the thought to 180 characters.');return false;}
 }else return;
 const staged=S;const result=sessionStore.commit(t,'shell',baseRev);
 S={...staged,timer:result.timer,notebookRevision:window.__lemmaNotebook.getState().notebookRevision};
 if(!result.accepted){
  // Never persist a saved effort row from a rejected, stale timer mutation.
  if(S.entries.length>entriesAtStart)S.entries.splice(entriesAtStart);
  jointToast('Session changed in another tab. Nothing was logged; review current focus.');
  window.dispatchEvent(new Event('lemma:integrationchange'));
  return;
 }
 notifyState();if(finishNotice)jointToast(finishNotice,S.lastLogged.overlapMinutes>=.5?{action:{label:'Check study log',onClick:()=>openTools('log')}}:{});if(action==='start-block')openFocus();return true;
}
/* v11: Focus is an accessible React dialog in the application's root.
   This bridge only signals open/close; it never generates or mutates markup. */
function openFocus(){window.dispatchEvent(new Event('lemma:focus-open'))}
function closeFocus(){window.dispatchEvent(new Event('lemma:focus-close'))}

function theme(){
 if(disabled)return;const cal=nativeCalendar();if(!cal)return;
 const cs=getComputedStyle(document.documentElement),vars={};
 for(const [k,source] of Object.entries({'--cx-bg':'--bg','--cx-paper':'--paper','--cx-raised':'--paper-2','--cx-ink':'--ink','--cx-sub':'--ink-2','--cx-muted':'--ink-3','--cx-line':'--edge','--cx-accent':'--accent','--cx-green':'--early','--cx-blue':'--link','--cx-gold':'--late','--cx-pink':'--danger','--font-ui':'--font-ui','--font-display':'--font-display','--font-num':'--font-num'})){
  const value=cs.getPropertyValue(source).trim();if(value)vars[k]=value;
 }
 cal.theme(document.documentElement.dataset.theme||'graph-night',vars);
}
function send(message){ // For integrated calendar synchronisation only.
 if(disabled)return;
 if(message?.integrated){queuedCalendarCommand={integrated:message.integrated};return;}
 postCalendar(message);
}
function openTools(screen='plan',action=null,data={}){
 if(disabled)return;
 if(screen==='settings'||screen==='more'||screen==='android'){goLemma('/settings');return;}
 if(screen==='log'){queuedCalendarCommand={screen:'log'};goLemma('/calendar');activateCalendar();return;}
 if(screen==='insights'){goLemma('/insights');return;}
 if(screen==='distractions'&&(!action||action==='view')){queuedCalendarCommand={screen:'distractions'};goLemma('/calendar');activateCalendar();return;}
 if(screen==='plan'&&action==='new-task'){window.dispatchEvent(new Event('lemma:quick-task'));return;}
 if(screen==='plan'){queuedCalendarCommand={screen,action,...data};goLemma('/calendar');activateCalendar();return;}
 if(screen==='subjects'){goLemma('/');return;}
 if(screen==='timer'||screen==='distractions'){
  if(action==='park'&&!data.text){openFocus();window.dispatchEvent(new Event('lemma:park-request'));return;}
  if(action==='finish'&&!data.commit){openFocus();window.dispatchEvent(new Event('lemma:finish-request'));return;}
  if(action==='subject-start'||action==='start-review-block'||data.prepare==='start'||data.reviewSession){changeTimer(action||'start',data);return;}
  if(action)return changeTimer(action,data);
  else openFocus();
 }
}
/* v10: Today time, session dock and desk margin are now owned by React.
   Calendar owns planning data; the session store owns the timer. */
/* Settings and Insights share a study context with the Day Margin. */
const JOINT_KEY='lemma.carrel.unified.ui.v1';
const jointDefault={links:{Topology:'topology',Algebra:'linear-algebra','Linear Algebra':'linear-algebra',Analysis:'real-analysis','Real Analysis':'real-analysis','Complex analysis':'',Reading:''},goals:{topology:6,'linear-algebra':8,'real-analysis':10},autoLink:true,reserveReviews:true,reviewMinutes:90,linkRecall:true,reviewOffer:true,dayMargin:true,memory:{target:90,newCards:20},insightTab:'focus'};
let U;try{U=JSON.parse(localStorage.getItem(JOINT_KEY)||'null')}catch{}U={...jointDefault,...(U||{}),links:{...jointDefault.links,...(U?.links||{})},goals:{...jointDefault.goals,...(U?.goals||{})}};
const rhythm=()=>({...{daily:240,gap:10,minDay:25,dayStart:'06:00',planStart:'09:00',planEnd:'23:00',guard:4,flow:true,recall:true,energy:false,urge:true,pulse:false,drift:false,notification:true,defaultFocus:50,defaultShort:10,defaultLong:20,defaultEvery:4,defaultMode:'pomo'},...(S.settings||{})});
function persistJoint(){try{localStorage.setItem(JOINT_KEY,JSON.stringify(U))}catch{}}
function commitJoint(){persistJoint();saveState();send({integrated:{links:U.links,goals:U.goals,autoLink:U.autoLink,reserveReviews:U.reserveReviews,reviewMinutes:U.reviewMinutes,linkRecall:U.linkRecall,settings:S.settings||{}}});refresh();window.dispatchEvent(new Event('lemma:integrationchange'))}
function jointToast(text,options={}){return window.__lemmaFeedback.show(text,options);}
function goLemma(to){const hash=to.startsWith('#')?to:'#'+to;const link=$$('#root a[href]').find(a=>a.getAttribute('href')===hash);if(link){link.click();return}if(location.hash!==hash)location.hash=hash;setTimeout(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:history.state})),80)}
function jointDialog(title,body,action){let d=$('#cr-joint-dialog');if(!d){d=make('dialog','cr-joint-dialog','');d.id='cr-joint-dialog';d.setAttribute('aria-labelledby','cr-joint-dialog-title');document.body.append(d)}d.innerHTML=`<div class="cr-row"><h2 id="cr-joint-dialog-title">${title}</h2>${ib('close','joint-close-dialog','Close')}</div>${body}<div class="cr-settings-save"><span class="cr-settings-status" id="cr-dialog-status"></span>${button('Save','joint-dialog-save','primary',`data-action="${action}"`)}</div>`;d.showModal()}
function value(id){return $('#'+id)?.value||''}
function decorateDeep(main){}
function jointAction(el){
 const a=el.dataset.cr||'';
 if(a==='joint-settings'){goLemma('/settings');return true}
 if(a==='joint-insights'){goLemma('/insights');return true}
 if(a==='joint-reserve-review'){openTools('plan',null,{reviewBlock:true,minutes:90});return true}
 if(a==='joint-start-review'){openTools('timer',null,{reviewSession:true,minutes:90});return true}
 if(a==='joint-attention'){openTools('distractions');return true}
 if(a==='joint-android'){openTools('android');return true}
 if(a==='joint-calendar-settings'){openTools('plan','calendar-settings');return true}
 return false;
}
function addOnce(parent,selector,node,position='append'){if($(selector,parent))return;if(position==='after')parent.after(node);else if(position==='before')parent.before(node);else parent.append(node)}
// Calendar is a native application route; the planner content has no modal shell.
let queuedCalendarCommand=null,calendarActivatedWindow=null;
const calendarHost=()=>$('#cr-calendar-native-host');
const nativeCalendar=()=>calendarHost()?.nativeApi||null;
function postCalendar(command){const cal=nativeCalendar();if(cal){cal.command({kind:'carrel:command',...command});return true}queuedCalendarCommand=command;return false}
function activateCalendar(){
 if(disabled||path()!=='/calendar')return;
 const cal=nativeCalendar();if(!cal)return;
 if(calendarActivatedWindow!==cal){
  calendarActivatedWindow=cal;theme();
  cal.command({kind:'carrel:command',integrated:{links:U.links,goals:U.goals,autoLink:U.autoLink,reserveReviews:U.reserveReviews,reviewMinutes:U.reviewMinutes,linkRecall:U.linkRecall}});
  const cmd=queuedCalendarCommand||{screen:'plan'};queuedCalendarCommand=null;postCalendar(cmd);
 }else if(queuedCalendarCommand){const cmd=queuedCalendarCommand;queuedCalendarCommand=null;postCalendar(cmd)}
}
sessionStore.subscribe(({timer,source})=>{if(disabled||!timer)return;S=window.__lemmaNotebook.getState();refresh();window.dispatchEvent(new Event('lemma:integrationchange'));if(source!=='calendar')postCalendar({stateSync:{timer}})});
window.__lemmaNativeCalendarMessage=(data,host)=>{
 if(disabled)return;
 if(data?.kind==='carrel:ready'){activateCalendar();theme()}
 if(data?.kind==='carrel:state'&&data.state?.timer){
  const incoming=data.state;
  // Calendar owns its planner records; the shared service owns the timer.
  S=window.__lemmaNotebook.getState();
  saveState();refresh();window.dispatchEvent(new Event('lemma:integrationchange'));
  if(Number(incoming.timer.rev||0)<Number(S.timer.rev||0))postCalendar({stateSync:{timer:S.timer}});
 }
 if(data?.kind==='carrel:lemma'&&typeof data.hash==='string')goLemma(data.hash);
};
function refresh(){/* React subscribes to lemma:integrationchange and lemma:sessionchange. */}
function onAction(el){
 const a=el.dataset.cr;
 if(jointAction(el))return;
 const map={start:['timer','start'],pause:['timer','pause'],resume:['timer','resume'],focus:['timer','focus'],
   'focus-close':['timer','focus-close'],finish:['timer','finish'],break:['timer','break'],
   noticed:['timer','noticed'],park:['timer','park'],drift:['timer','drift']};
 if(map[a])openTools(map[a][0],map[a][1],{});
}
function remove(){disabled=true;window.__carrelDisabled=true;themeObserver?.disconnect();closeFocus();delete window.__carrelIntegration;window.dispatchEvent(new Event('lemma:integrationchange'));goLemma('/');$('#cr-joint-toast')?.remove();}
function boot(){document.addEventListener('click',e=>{if(disabled)return;const el=e.target.closest('[data-cr]');if(!el||!el.closest('[data-carrel]'))return;e.preventDefault();e.stopPropagation();onAction(el)},true);

 // No root MutationObserver or DOM scraping. Calendar announces readiness
 // through __lemmaNativeCalendarMessage and routes announce navigation.
 themeObserver=new MutationObserver(()=>{theme()});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});window.addEventListener('hashchange',()=>{if(disabled)return;setTimeout(activateCalendar,60)});window.__carrelIntegration={
 remove,open:openTools,
 getState:()=>window.__lemmaNotebook.getState(),
 getPreferences:()=>JSON.parse(JSON.stringify(U)),
 getCalendarSettings:()=>({...rhythm()}),
 updatePreferences(patch){
  if(!patch||typeof patch!=='object')return false;
  const allowed=['autoLink','reserveReviews','reviewMinutes','reviewOffer','linkRecall','dayMargin','links','goals'];
  const next={...U};
  for(const key of allowed)if(Object.prototype.hasOwnProperty.call(patch,key)){
   if(key==='links'||key==='goals')next[key]={...next[key],...patch[key]};
   else next[key]=patch[key];
  }
  if(!Number.isFinite(Number(next.reviewMinutes))||Number(next.reviewMinutes)<5||Number(next.reviewMinutes)>120)return false;
  U=next;commitJoint();return true;
 },
 updateCalendarSettings(patch){
  if(!patch||typeof patch!=='object')return false;
  const allowed=['daily','minDay','gap','dayStart','planStart','planEnd','defaultMode','defaultFocus','defaultShort','defaultLong','defaultEvery','guard','flow','recall','energy','pulse','urge','drift','clock','week'];
  const next={...rhythm()};for(const key of allowed)if(Object.prototype.hasOwnProperty.call(patch,key))next[key]=patch[key];
  const inRange=(key,min,max)=>Number.isFinite(Number(next[key]))&&Number(next[key])>=min&&Number(next[key])<=max;
  for(const [key,min,max] of [['daily',25,960],['minDay',5,120],['gap',0,60],['defaultFocus',1,180],['defaultShort',1,60],['defaultLong',1,90],['defaultEvery',2,8],['guard',1,12]])if(!inRange(key,min,max))return false;
  if(!['pomo','open','flow'].includes(next.defaultMode))return false;
  if(![next.dayStart,next.planStart,next.planEnd].every(x=>/^\d{2}:\d{2}$/.test(x)))return false;
  S.settings=next;commitJoint();return true;
 },
 setMemoryContext(target,newCards){
  const t=Number(target),n=Number(newCards);
  if(!Number.isFinite(t)||!Number.isFinite(n))return;
  if(U.memory.target===t&&U.memory.newCards===n)return;
  U.memory={target:t,newCards:n};persistJoint();window.dispatchEvent(new Event('lemma:integrationchange'));
 },
 setRhythmTab(tab){if(['focus','planning','attention'].includes(tab)){U.insightTab=tab;persistJoint();window.dispatchEvent(new Event('lemma:integrationchange'))}},variant:v};activateCalendar();setTimeout(activateCalendar,400)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
