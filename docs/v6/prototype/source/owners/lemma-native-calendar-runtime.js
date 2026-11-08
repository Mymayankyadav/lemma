/* Lemma native calendar: same-document component with scoped styles and explicit lifecycle. */
(function(){'use strict';
 const nativeDoc=globalThis.document,nativeWin=globalThis.window;
 const calendarCSS=__LEMMA_CALENDAR_CSS__;
 const controlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 function calendarButtonMarkup(text,action,cls='',extra='',type='button'){return `<button type="${type}" class="cx-btn ${cls}" data-cx="${action}" ${extra}>${text}</button>`}
 function calendarFieldMarkup(label,id,value='',type='text',extra='',clock='24h'){
  const clockField=type==='time'&&clock==='24h';
  return `<label for="${id}">${controlEscape(label)}${clockField?' · 24-hour':''}<input id="${id}" type="${clockField?'text':type}" value="${controlEscape(value)}" ${type==='number'?'inputmode="numeric" ':clockField?'inputmode="numeric" maxlength="5" placeholder="20:00" ':''}enterkeyhint="next" aria-describedby="${id}-error" ${extra}><span class="lemma-field-error" id="${id}-error" role="alert"></span></label>`;
 }
 const calendarDialogLocks=new Set();let calendarPageOverflow=null;
 function copyCalendarTokens(host){const styles=getComputedStyle(nativeDoc.documentElement);for(const token of ['--accent','--on-accent','--bg','--paper','--paper-2','--ink','--ink-2','--ink-3','--track','--hair','--edge','--edge-2','--edge-3','--link','--early','--late','--warn','--danger','--danger-tint','--control-edge','--action-primary','--action-on-primary','--action-destructive','--status-warning','--font-ui','--font-display','--font-math','--font-num']){const value=styles.getPropertyValue(token).trim();if(value)host.style.setProperty(token,value)}}
 function calendarScrollLock(dialog,open){
  if(open){if(!calendarDialogLocks.size)calendarPageOverflow={html:nativeDoc.documentElement.style.overflow,body:nativeDoc.body.style.overflow};calendarDialogLocks.add(dialog);nativeDoc.documentElement.style.overflow='hidden';nativeDoc.body.style.overflow='hidden'}
  else{calendarDialogLocks.delete(dialog);if(!calendarDialogLocks.size&&calendarPageOverflow){nativeDoc.documentElement.style.overflow=calendarPageOverflow.html;nativeDoc.body.style.overflow=calendarPageOverflow.body;calendarPageOverflow=null}}
 }
 function runCalendar(ctx){
   const {document,window,parent,setInterval,setTimeout,clearInterval,clearTimeout}=ctx;
   /* Lemma × Carrel — one-file interactive design study. Sample data only.
 * Carrel source snapshot: 0a2509a66af6aaed1f04bd706c98deb0407c5255.
 * The attached Lemma build and all of its modules are preserved below this layer.
 */
(()=>{'use strict';
const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={today:'M3 10 12 3l9 7v10H3z M9 20v-7h6v7',paths:'M5 4v14a2 2 0 0 0 2 2h12 M5 10h7l5-6 M5 16h7l5-4',plan:'M4 5h16v16H4z M8 3v4m8-4v4M4 10h16 M8 14h2m4 0h2m-8 3h2',review:'M4 4h13v15H4z M8 8h5m-5 4h5 M17 8h3v14H8v-3',more:'M5 12h.01M12 12h.01M19 12h.01',plus:'M12 5v14M5 12h14',close:'M6 6l12 12M18 6 6 18',play:'m8 5 11 7-11 7z',stop:'M6 6h12v12H6z',break:'M4 7h12v8a5 5 0 0 1-10 0V7m10 1h2a3 3 0 0 1 0 6h-2M4 21h14',focus:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',clock:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 4v5l3 2',left:'m14 6-6 6 6 6',right:'m9 6 6 6-6 6',down:'m6 9 6 6 6-6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',atlas:'M4 6h7v6H4zM15 15h5v5h-5zM3 17h5v4H3z M8 12v3l-3 2m6-8h6v6',chart:'M4 20V4m0 16h17M8 16v-5m5 5V7m5 9v-8',book:'M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 0-4-2-9 0zM12 6v14',log:'M7 3h13v18H7zM3 7h8M3 12h8M3 17h8',check:'m5 12 4 4L19 6',park:'M6 3h12v18l-6-4-6 4z',urge:'M3 12h4l3-7 4 14 3-7h4',phone:'M7 2h10v20H7zM10 18h4',coach:'M4 4h16v12H9l-5 5zM8 8h8m-8 4h5',flag:'M5 21V3m0 1h12l-2 4 2 4H5',export:'M12 15V3m-5 5 5-5 5 5M4 14v7h16v-7',edit:'m4 16 12-12 4 4L8 20H4z',leaf:'M4 20C2 6 10 3 20 4c1 10-3 17-13 13M5 19 15 9',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',back:'M7 7H3V3m0 4a9 9 0 1 1 0 10'};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.more}"/></svg>`;
const btn=(text,action,cls='',extra='')=>calendarButtonMarkup(text,action,cls,extra);
const ib=(name,action,label,extra='')=>`<button type="button" class="cx-icon" data-cx="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(name)}</button>`;
const link=(label,to,cls='cx-btn')=>`<a class="${cls}" href="#${to}">${label}</a>`;
const duration=m=>m>=60?`${Math.floor(m/60)} h${m%60?' '+Math.round(m%60)+' min':''}`:`${Math.round(m)} min`;
const clock=s=>{s=Math.max(0,Math.floor(s));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const dkey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const DAY=864e5;
const daysUntil=(iso,now=new Date())=>{const[y,m,d]=iso.split('-').map(Number);return Math.round((Date.UTC(y,m-1,d)-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/DAY)};
const initial=nativeWin.__lemmaNotebook.getSeed();
let S=nativeWin.__lemmaNotebook.getState();
const savedCalendar=(()=>{try{return JSON.parse(sessionStorage.getItem('lemma.calendar.position')||'null')||{}}catch{return {}}})();
const savedDate=typeof savedCalendar.date==='string'?new Date(savedCalendar.date+'T12:00'):new Date();
let view=['agenda','day','week','month'].includes(savedCalendar.view)?savedCalendar.view:(innerWidth<600?'agenda':'week'),date=Number.isFinite(+savedDate)?savedDate:new Date(),fullWeek=!!savedCalendar.fullWeek,planTab='calendar',insightTab='overview',ritualStep=1,captureType='Task',undoState=null,urgeEnd=0,focusReturn=null,modalOpener=null;
// Calendar and Lemma share one timer revision; calendar edits keep their own data.
const timerSignature=t=>JSON.stringify({...t,rev:undefined});
const sharedSession=nativeWin.__lemmaSessionStore;
S.timer=sharedSession.init(S.timer);
let lastTimerSignature=timerSignature(S.timer);
const save=()=>{
 const signature=timerSignature(S.timer);
 if(signature!==lastTimerSignature){const result=sharedSession.commit(S.timer,'calendar',Number(S.timer.rev)||0);S.timer=result.timer;}
 S=nativeWin.__lemmaNotebook.commit(S,'calendar');collectUndo(pendingUndo,S);lastTimerSignature=timerSignature(S.timer);
};
const elapsed=()=>S.timer.elapsed+(S.timer.running?(Date.now()-S.timer.stamp)/1000:0);
const displayClock=()=>S.timer.mode==='pomo'?clock(Math.max(0,(S.timer.phase==='break'?(S.timer.breakLength||S.timer.short):S.timer.focus)*60-elapsed())):clock(elapsed());
const undoStack=[];let pendingUndo=null;
const snapshot=()=>{pendingUndo=JSON.parse(JSON.stringify(S))};
function collectUndo(before,after){
 if(!before)return;const delta={collections:{},fields:{}};
 for(const key of ['tasks','blocks','entries','topics','deadlines','parked']){
  const prior=new Map((before[key]||[]).filter(r=>!r.actual).map(r=>[r.id,r])),next=new Map((after[key]||[]).filter(r=>!r.actual).map(r=>[r.id,r]));
  const changes=[];for(const id of new Set([...prior.keys(),...next.keys()]))if(JSON.stringify(prior.get(id))!==JSON.stringify(next.get(id)))changes.push({id,before:prior.get(id)||null,after:next.get(id)||null});
  if(changes.length)delta.collections[key]=changes;
 }
 for(const key of ['settings','allowedOverlaps','coachAccepted','coachDismissed','ritualDone','shutdownDone','intention','tomorrowFirst','drift','driftLog','notices'])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))delta.fields[key]={before:before[key],after:after[key]};
 if(Object.keys(delta.collections).length||Object.keys(delta.fields).length){undoStack.push(delta);if(undoStack.length>20)undoStack.shift()}
 pendingUndo=null;
}
function toast(text,undo=false){
 return nativeWin.__lemmaFeedback.show(text,undo?{key:'calendarUndo',action:{label:'Undo Calendar changes',onClick:()=>action('undo')},onDismiss:()=>{undoStack.length=0;pendingUndo=null}}:{});
}
const paths=['/carrel/plan','/carrel/insights','/carrel/more','/carrel/subjects','/carrel/log','/carrel/settings','/carrel/android','/carrel/features','/carrel/coach','/carrel/distractions'];
let frameHash='#/carrel/plan';const frameLocation={get hash(){return frameHash},set hash(v){if((v==='#/carrel/plan'||v==='/carrel/plan')&&!document.body.classList.contains('cx-calendar-page')){parent.postMessage({kind:'carrel:lemma',hash:'#/calendar'},'*');return}if(v==='#/carrel/insights'||v==='/carrel/insights'||v==='#/carrel/settings'||v==='/carrel/settings'){parent.postMessage({kind:'carrel:lemma',hash:v.includes('insights')?'#/insights':'#/settings'},'*');return}frameHash=v.startsWith('#')?v:'#'+v;window.dispatchEvent(new Event('hashchange'))}};
const route=()=>frameLocation.hash.slice(1).split('?')[0]||'/';
const pageHead=(k,title,sub='',actions='')=>`<header class="cx-head"><div><p class="cx-eyebrow">${k}</p><h1>${title}</h1>${sub?`<p class="cx-sub" style="margin-top:8px">${sub}</p>`:''}</div><div class="cx-head-tools">${actions||ib('plus','capture','Quick capture')}</div></header>`;
const sectionHead=(title,extra='')=>`<div class="cx-row"><h2>${title}</h2>${extra}</div>`;
function decorate(){if(route()!=='/')return;const main=$('#root #main-content')||$('#root main');if(!main||!$('section[aria-label="Distance to your goals" data-style="role-distance-to-your-goals"], [data-goal-card], section[aria-label="Goals"]',main))return;if(!$('#cx-home',main)){const el=document.createElement('section');el.id='cx-home';el.className='cx cx-timer-home';el.setAttribute('aria-label','Study desk');el.innerHTML=homePanel();const cards=$('section[aria-label="Cards" data-style="role-cards"]',main);const v4=$('[data-lemma-v4-home]',main);if(v4) v4.before(el);else if(cards)cards.before(el);else main.append(el);}const goal=$('section[aria-label="Distance to your goals" data-style="role-distance-to-your-goals"]',main),home=$('#cx-home',main);if(goal&&home&&goal.nextElementSibling!==home)goal.after(home);const actions=$('nav[aria-label="Desk actions"]');if(actions&&!$('[data-cx="capture"]',actions)){const b=document.createElement('button');b.className='cx-icon';b.dataset.cx='capture';b.setAttribute('aria-label','Quick capture');b.innerHTML=icon('plus');actions.prepend(b)}}
function dock(){const el=$('#cx-dock'),r=route();el.innerHTML=S.timer.running&&r!=='/'?`<button data-cx="focus" aria-label="Open live focus timer"><span class="cx-dot" style="background:var(--cx-accent)"></span>${esc(S.timer.phase==='break'?'Break':S.timer.activity)} · <b data-cx-clock>${displayClock()}</b></button><div>${ib('break','break',S.timer.phase==='break'?'Resume study':'Take a break')}${ib('stop','finish','Finish session')}</div>`:'';}
function nav(){const r=route();$('#cx-nav').innerHTML=[['plan','Calendar','/carrel/plan'],['book','Topics','/carrel/subjects'],['log','Time log','/carrel/log'],['chart','Insights','/carrel/insights'],['more','More','/carrel/more']].map(([ic,label,to])=>`<a href="#${to}" ${r===to?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`).join('');}
window.addEventListener('resize',crFitCalendar);
document.addEventListener('toggle',crFitCalendar,true);
if(document.fonts)document.fonts.ready.then(crFitCalendar);
function render(){try{sessionStorage.setItem('lemma.calendar.position',JSON.stringify({view,date:dkey(date),fullWeek}))}catch{}const r=route(),custom=paths.includes(r);document.body.classList.toggle('cx-route',custom);$('#cx-app').innerHTML=custom?`<main class="cx cx-page ${['/carrel/more','/carrel/settings','/carrel/features','/carrel/subjects'].includes(r)?'cx-narrow':''}" id="cx-main">${({'/carrel/plan':plan,'/carrel/insights':insights,'/carrel/more':more,'/carrel/subjects':subjects,'/carrel/log':log,'/carrel/settings':settings,'/carrel/android':android,'/carrel/features':features,'/carrel/coach':coach,'/carrel/distractions':distractions}[r])()}</main>`:'';if(!document.body.classList.contains('cx-calendar-page')){nav();dock();}decorate();crFitCalendar();}
const crSpatialScroll=new Map((()=>{try{return JSON.parse(sessionStorage.getItem('lemma.calendar.scroll')||'[]')}catch{return []}})());let spatialSaveFrame=0;
const crClockMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const crTime=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const crStatus=b=>b.actual?'logged':b.busy?'busy':'planned';
const crStatusText=Object.freeze({logged:'Logged',planned:'Planned',busy:'Busy'});
function crLocalDay(day){
 const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day||'');
 if(!parts)return null;
 const [year,month,number]=parts.slice(1).map(Number);
 const start=new Date(year,month-1,number),end=new Date(year,month-1,number+1);
 if(dkey(start)!==day)return null;
 return {start:start.getTime(),end:end.getTime(),minutes:(end-start)/60000};
}
function crBlockInterval(block){
 const date=/^(\d{4})-(\d{2})-(\d{2})$/.exec(block?.date||'');
 const time=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(block?.at||'');
 const minutes=Number(block?.min);
 if(!date||!time||!Number.isFinite(minutes)||minutes<=0)return null;
 const [year,month,day]=date.slice(1).map(Number),hour=Number(time[1]),minute=Number(time[2]);
 const at=new Date(year,month-1,day,hour,minute),start=at.getTime();
 if(dkey(at)!==block.date)return null;
 return {start,end:start+minutes*60000,shifted:at.getHours()!==hour||at.getMinutes()!==minute};
}
const crLocalClock=(day,offset)=>{
 const bounds=crLocalDay(day);
 if(!bounds)return crTime(offset);
 const instant=new Date(bounds.start+offset*60000);
 return instant.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:S.settings.clock==='12h'});
};
function crDayWorkload(day){
 const bounds=crLocalDay(day);
 if(!bounds)return {sum:0,occupied:0,planned:0,logged:0,busy:0,conflicts:[],affected:0,dayMinutes:0,shiftedEvents:0};
 const seen=new Set(),ranges=[];let shiftedEvents=0;
 for(const b of S.blocks){
  const identity=b.id||b.date+':'+b.at+':'+b.title;
  if(seen.has(identity))continue;
  seen.add(identity);
  const interval=crBlockInterval(b);
  if(!interval||interval.start>=bounds.end||interval.end<=bounds.start)continue;
  if(interval.shifted)shiftedEvents++;
  const start=Math.max(interval.start,bounds.start),end=Math.min(interval.end,bounds.end);
  ranges.push({b,start:(start-bounds.start)/60000,end:(end-bounds.start)/60000,status:crStatus(b)});
 }
 ranges.sort((a,b)=>a.start-b.start||a.end-b.end);
 let sum=0,occupied=0,lastEnd=0,planned=0,logged=0,busy=0;
 for(const x of ranges){
  const span=x.end-x.start;
  sum+=span;
  if(x.status==='planned')planned+=span;
  else if(x.status==='logged')logged+=span;
  else busy+=span;
  occupied+=Math.max(0,x.end-Math.max(x.start,lastEnd));
  lastEnd=Math.max(lastEnd,x.end);
 }
 const conflicts=[];
 for(let i=0;i<ranges.length;i++)for(let j=i+1;j<ranges.length&&ranges[j].start<ranges[i].end;j++){
  const a=ranges[i],b=ranges[j];
  if(a.start<b.end&&b.start<a.end&&a.b.id!==b.b.id)!(S.allowedOverlaps||[]).includes([a.b.id,b.b.id].sort().join('|'))&&conflicts.push({a:a.b,b:b.b,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)});
 }
 const affected=new Set(conflicts.flatMap(x=>[x.a.id,x.b.id]));
 const distribution={logged:0,busy:0,planned:0},boundaries=[...new Set(ranges.flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b);
 for(let i=1;i<boundaries.length;i++){const start=boundaries[i-1],end=boundaries[i],status=['logged','busy','planned'].find(status=>ranges.some(r=>r.status===status&&r.start<end&&r.end>start));if(status)distribution[status]+=end-start}
 const mergeStatus=status=>nativeWin.__lemmaEffortMetrics.union(ranges.filter(r=>r.status===status).map(r=>({start:r.start,end:r.end}))).reduce((total,r)=>total+r.end-r.start,0);
 logged=nativeWin.__lemmaEffortMetrics.forDay(S.entries,S.timer,day).committedMinutes;
 return {sum,occupied,distribution,planned:mergeStatus('planned'),logged,busy:mergeStatus('busy'),conflicts,affected:affected.size,dayMinutes:bounds.minutes,shiftedEvents};
}

let crVisibleDayStartHour=6;
function blocksForDay(day,split=false){
 const bounds=crLocalDay(day);
 if(!bounds)return [];
 const results=[];
 for(const b of S.blocks){
  const span=crBlockInterval(b);
  if(!span||span.start>=bounds.end||span.end<=bounds.start)continue;
  const continued=span.start<bounds.start;
  const segmentStart=Math.max(span.start,bounds.start);
  const segmentEnd=Math.min(span.end,bounds.end);
  if(!split&&!continued){results.push({...b,endInstant:span.end});continue}
  const time=new Date(segmentStart);
  const at=String(time.getHours()).padStart(2,'0')+':'+String(time.getMinutes()).padStart(2,'0');
  results.push({...b,date:day,at,min:(segmentEnd-segmentStart)/60000,
   continued,spansMidnight:span.end>bounds.end,endInstant:split?segmentEnd:span.end,
   sourceDate:b.date,sourceAt:b.at,
   title:continued?b.title+' · continued':b.title});
 }
 return results;
}
const endLabel=b=>{
 const span=b.endInstant?{end:b.endInstant}:crBlockInterval(b);
 if(!span)return crTime(crClockMin(b.at)+Number(b.min||0));
 const last=new Date(span.end),day=dkey(last),next=day!==b.date;
 return String(last.getHours()).padStart(2,'0')+':'+String(last.getMinutes()).padStart(2,'0')+(next?' (next day)':'');
};
function crSpatialBlocks(day){
 const blocks=blocksForDay(day,true).sort((a,b)=>crClockMin(a.at)-crClockMin(b.at));let group=[],end=0,out=[];
 function flush(){if(!group.length)return;const lanes=[],groupPlacements=[];for(const b of group){let lane=lanes.findIndex(t=>t<=crClockMin(b.at));if(lane<0)lane=lanes.length;lanes[lane]=crClockMin(b.at)+Math.max(32,b.min);groupPlacements.push({block:b,lane})}out.push(...groupPlacements.map(p=>({...p,lanes:lanes.length})));group=[]}
 for(const b of blocks){const start=crClockMin(b.at);if(group.length&&start>=end)flush();group.push(b);end=Math.max(group.length===1?0:end,start+Math.max(32,b.min))}flush();
 const minimumLaneWidth=nativeDoc.documentElement.hasAttribute('data-large-text')?220:innerWidth<600?120:60;
 const maximumLanes=view==='week'&&fullWeek?1:Math.max(1,Math.floor(Math.min(320,innerWidth-96)/minimumLaneWidth));
 const groups=[];let pending=[],until=0;for(const p of out){const start=crClockMin(p.block.at);if(pending.length&&start>=until){groups.push(pending);pending=[]}pending.push(p);until=Math.max(pending.length===1?0:until,start+Math.max(32,p.block.min))}if(pending.length)groups.push(pending);
 const clusteredIds=new Set(),stacks=[];for(const group of groups)if(group.some(p=>p.lanes>maximumLanes)){
  const b=group[0].block;group.forEach(p=>clusteredIds.add(p.block.id));stacks.push('<button type="button" class="lemma-event-stack" data-cx="event-stack" data-id="'+group.map(p=>p.block.id).join('|')+'" style="top:'+((crClockMin(b.at)-crVisibleDayStartHour*60)*1.4)+'px" aria-label="Show '+group.length+' overlapping blocks at '+crClockLabel(b.at)+'">'+crClockLabel(b.at)+' · '+group.length+' blocks</button>');
 }
 return stacks.join('')+out.filter(p=>!clusteredIds.has(p.block.id)).map(({block:b,lane,lanes})=>{
const movable=b.min>=45&&!b.actual&&!b.pin&&!b.busy&&!b.continued&&!b.spansMidnight,kind=crStatus(b);return `<button type="button" class="cr-spatial-event ${kind} ${b.min<=35?'cr-short':b.min<65?'cr-medium':''} ${b.current?'current':''}" data-cx="block-details" data-id="${b.id}" data-status="${kind}" title="${esc(b.title)} · ${esc(b.subject)} · ${crClockLabel(b.at)}–${crClockLabel(endLabel(b))} · ${crStatusText[kind]}" data-movable="${movable}" style="--start:${crClockMin(b.at)-crVisibleDayStartHour*60};--minutes:${b.min};--lane:${lane};--lanes:${lanes}" aria-labelledby="block-time-${b.id}-${day} block-title-${b.id}-${day} block-meta-${b.id}-${day}" aria-description="${movable?'Use the grip to drag, Alt and arrow keys to move, or open this block to edit.':b.continued?'Continued from the previous day. Open to edit the original block.':b.spansMidnight?'Continues tomorrow. Open to edit.':b.actual?'Logged session.':'Fixed start time.'}"><span class="cr-event-top"><span id="block-time-${b.id}-${day}">${crClockLabel(b.at)}–${crClockLabel(endLabel(b))} </span><span class="cr-event-grip" aria-hidden="true"><svg viewBox="0 0 12 16" width="12" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="4" r="1"/><circle cx="8" cy="4" r="1"/><circle cx="4" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="8" cy="12" r="1"/></g></svg></span></span><strong id="block-title-${b.id}-${day}">${esc(b.title)} </strong><span class="cr-event-sub" id="block-meta-${b.id}-${day}">${kind==='logged'?'✓':kind==='busy'?'◷':'▱'} ${esc(b.subject)} · ${duration(b.min)} · ${crStatusText[kind]}${b.pin?' · fixed':''}${b.spansMidnight?' · continues tomorrow':''}</span>${movable?'<span class="cr-resize-handle" data-resize="true" aria-hidden="true"><i></i></span>':''}</button>`}).join('')
}
function crPeakLanes(day){
 const events=blocksForDay(day,true).sort((a,b)=>crClockMin(a.at)-crClockMin(b.at));
 const active=[];let peak=1;
 for(const b of events){const at=crClockMin(b.at);for(let j=active.length-1;j>=0;j--)if(active[j]<=at)active.splice(j,1);active.push(at+b.min);peak=Math.max(peak,active.length)}
 return peak;
}
function crSpatialGrid(){
 let start=new Date(date);if(view==='week')start.setDate(start.getDate()-((start.getDay()+6)%7));
 const compactWeek=view==='week'&&(Math.min(innerWidth,document.documentElement.clientWidth)-112)<7*88&&!fullWeek;
 const weekDays=Array.from({length:7},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
 const days=compactWeek?[new Date(date)]:Array.from({length:view==='day'?1:7},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
 const firstMinute=Math.min(360,Math.max(0,Number.parseInt(S.settings.dayStart||'06:00',10)*60),...days.flatMap(day=>blocksForDay(dkey(day),true).map(b=>crClockMin(b.at))));crVisibleDayStartHour=Math.max(0,Math.min(6,Math.floor(firstMinute/60)));const hourCount=24-crVisibleDayStartHour;const now=new Date(),nowMinute=now.getHours()*60+now.getMinutes();
 const weekStrip=(view==='week'&&fullWeek)?`<button class="cr-full-week-action" data-cx="full-week">Back to selected day</button>`:compactWeek?`<div class="cr-week-overview" role="group" aria-label="Select a day in this week">${weekDays.map(d=>`<button type="button" data-cx="week-select" data-id="${dkey(d)}" class="${dkey(d)===dkey(date)?'selected':''} ${dkey(d)===dkey(new Date())?'today':''}" aria-pressed="${dkey(d)===dkey(date)}" aria-label="${d.toLocaleDateString('en',{weekday:'long',day:'numeric',month:'short'})}, ${blocksForDay(dkey(d),true).length} blocks"><span>${d.toLocaleDateString('en',{weekday:'short'})}</span><b>${d.getDate()}</b><small>${blocksForDay(dkey(d),true).length}</small></button>`).join('')}<button type="button" class="cr-full-week-action" data-cx="full-week">Full week</button></div>`:'';
 return `${weekStrip}<div class="cr-grid-scroller" data-view="${view}" tabindex="0" aria-label="${view==='day'?'Day':'Week'} calendar. Scroll through time. Drag a planned block to move it."><div class="cr-time-grid ${days.length===1?'is-day':'is-week'}" style="--calendar-height:${hourCount*84}px;--days:${days.length};--day-lanes:${view==='day'?crPeakLanes(dkey(date)):1}"><div class="cr-grid-corner">${['Asia/Kolkata','Asia/Calcutta'].includes(Intl.DateTimeFormat().resolvedOptions().timeZone)?'IST':(new Intl.DateTimeFormat('en',{timeZoneName:'short'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value||'Local')}</div>${days.map(d=>`<div class="cr-grid-date ${dkey(d)===dkey(date)?'selected':''}"><span>${d.toLocaleDateString('en',{weekday:'short'})}</span><b>${d.getDate()}</b></div>`).join('')}<div class="cr-grid-hours">${Array.from({length:hourCount},(_,i)=>`<span style="top:${i*84}px">${crClockLabel(String(i+crVisibleDayStartHour).padStart(2,'0')+':00')}</span>`).join('')}</div>${days.map(d=>`<div class="cr-grid-day" data-date="${dkey(d)}">${crSpatialBlocks(dkey(d))}${dkey(d)===dkey(now)&&nowMinute>=crVisibleDayStartHour*60?`<div class="cr-now-line" aria-label="Current time ${crTime(nowMinute)}" style="top:${(nowMinute-crVisibleDayStartHour*60)*84/60}px"><span>${crTime(nowMinute)}</span></div>`:''}</div>`).join('')}</div></div>`
}

function crRefreshNowLine(){
 const line=document.querySelector('.cr-now-line');if(!line)return;
 const now=new Date(),day=line.closest('.cr-grid-day')?.dataset.date;
 const minute=now.getHours()*60+now.getMinutes();
 if(day!==dkey(now)||minute<crVisibleDayStartHour*60){line.remove();return}
 line.style.top=((minute-crVisibleDayStartHour*60)*84/60)+'px';
 line.querySelector('span').textContent=crClockLabel(crTime(minute));
 line.setAttribute('aria-label','Current time '+crClockLabel(crTime(minute)));
}
setInterval(crRefreshNowLine,30000);
function agenda(){
 const day=dkey(date),list=blocksForDay(day).sort((a,b)=>a.at.localeCompare(b.at));
 const earlier=list.filter(b=>day===dkey(new Date())&&b.actual&&crClockMin(endLabel(b))<=new Date().getHours()*60+new Date().getMinutes());
 const upcoming=list.filter(b=>!earlier.includes(b));
 const row=b=>{const status=crStatus(b);return `<button type="button" data-cx="block-details" data-id="${esc(b.id)}" data-status="${status}" class="lemma-agenda-item" aria-label="${esc(b.title)}, ${esc(b.subject)}, ${crClockLabel(b.at)} to ${crClockLabel(endLabel(b))}, ${crStatusText[status]}"><span>${crClockLabel(b.at)}–${crClockLabel(endLabel(b))}</span><strong>${esc(b.title)}</strong><small>${esc(b.subject)} · ${duration(b.min)} · ${crStatusText[status]}</small></button>`};
 return `<div class="lemma-agenda" role="region" aria-label="Study agenda">${upcoming.length?upcoming.map(row).join(''):`<p class="cx-paper">${earlier.length?'All planned blocks are complete. Add another when you’re ready.':'No blocks for this day. Add a study block to make a plan.'}</p>`}${earlier.length?`<details class="notebook-earlier"><summary>Earlier today · ${earlier.length} completed</summary>${earlier.map(row).join('')}</details>`:''}</div>`;
}
function crEventDetails(){const blocks=blocksForDay(dkey(date),true).sort((a,b)=>a.at.localeCompare(b.at));return `<details class="cr-event-details"><summary>Events for selected day · ${blocks.length}</summary><div>${blocks.map(b=>`<article class="cr-event-detail-row"><strong>${esc(b.title)}</strong><span>${crClockLabel(b.at)}–${crClockLabel(endLabel(b))} · ${crStatusText[crStatus(b)]}</span><div><button data-cx="edit-block" data-id="${b.id}">Edit</button>${!b.actual&&!b.busy&&!b.pin?`<button data-cx="block-move" data-id="${b.id}">Move</button><button data-cx="block-resize" data-id="${b.id}">Resize</button>`:''}</div></article>`).join('')}</div></details>`;}
function crPlanner(){
  const workload=crDayWorkload(dkey(date)),other=planTab!=='calendar';
  const dateLabel=date.toLocaleDateString(undefined,view==='month'?{month:'long',year:'numeric'}:{weekday:'short',month:'short',day:'numeric'});
  if(other)return `<div class="cr-planning-content"><div class="cx-row">${btn('‹ Calendar','plan-tab','', 'data-id="calendar"')}${btn('Planning tools','planner-tools')}</div>${planTab==='backlog'?backlog():planTab==='deadlines'?deadlines():planTab==='reviews'?topicList():`<div class="cr-rituals"><section class="cx-paper cx-stack"><h2>Plan my day</h2><p class="cx-sub">Choose a few tasks that fit.</p>${btn('Choose tasks','ritual','primary')}</section><section class="cx-paper cx-stack"><h2>Close my day</h2><p class="cx-sub">Review the log and choose what to carry over.</p>${btn('Review my day','shutdown')}</section></div>`}</div>`;
  const urgent=S.deadlines.filter(item=>daysUntil(item.date)>=0&&daysUntil(item.date)<=1).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const capacity=workload.dayMinutes||1440,percent=Math.min(100,workload.occupied/capacity*100);
  return `<div class="cr-planner cr-spatial-planner"><div class="cr-spatial-date">${ib('left','date-prev','Previous '+view)}<strong class="cr-selected-date">${dateLabel}</strong>${ib('right','date-next','Next '+view)}${btn('Today','date-today','text')}</div>
    <div class="lemma-calendar-toolbar"><div class="cr-view-switch" role="tablist" aria-label="Calendar view">${['agenda','day','week','month'].map(v=>`<button type="button" role="tab" data-cx="cal-view" data-id="${v}" aria-selected="${view===v}" tabindex="${view===v?0:-1}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}</div>${btn('Planning tools','planner-tools')}</div>
    ${(urgent||workload.conflicts.length)?`<div class="lemma-calendar-notices">${urgent?btn('Due '+(daysUntil(urgent.date)===0?'today: ':'tomorrow: ')+esc(urgent.title),'spatial-tool','lemma-calendar-chip','data-id="deadlines"'):''}${workload.conflicts.length?btn(workload.affected+' overlapping blocks','calendar-conflicts','lemma-calendar-chip warning'):''}</div>`:''}
    ${view==='month'?`<div class="cr-month-scroller">${monthCalendar()}</div>`:view==='agenda'?agenda():crSpatialGrid()+crEventDetails()}
    <details class="cr-grid-caption"><summary>Day details · time and capacity</summary><div class="lemma-day-metrics"><div><strong>${duration(Math.round(workload.logged))}</strong><span>Logged study</span></div><div><strong>${duration(Math.round(workload.planned))}</strong><span>Planned time</span></div><div><strong>${duration(Math.round(workload.occupied))}</strong><span>Occupied time</span></div></div><div class="lemma-capacity-bar" role="img" aria-label="Day occupancy: ${['logged','planned','busy'].map(kind=>kind+' '+duration(Math.round(workload.distribution?.[kind]||0))).join(', ')}; ${duration(Math.round(capacity-workload.occupied))} free">${['logged','planned','busy'].map(kind=>'<i data-kind="'+kind+'" style="width:'+((workload.distribution?.[kind]||0)/capacity*100)+'%" aria-hidden="true"></i>').join('')}</div><p class="cx-caption">The bar counts overlaps once: logged blocks first, then busy, then planned. Planned time is not logged study.</p>${workload.sum>capacity?`<p class="cx-form-error">Requested block durations exceed this day’s capacity. Resolve overlaps to make the plan realistic.</p>`:''}<div class="lemma-calendar-legend"><span>✓ Logged</span><span>▱ Planned</span><span>◷ Busy</span></div></details></div>`;
}
function crPlannerTools(){
  modal('Planning tools',`<div class="cr-tools-menu">${btn('New task','new-task','primary')}${btn('Preview a study plan','autoplan')}
    ${[['backlog','Backlog',S.tasks.filter(t=>!t.done).length+' open tasks'],['deadlines','Deadlines',S.deadlines.length+' dates'],['reviews','Topic practice notes','Self-assessment, separate from card review'],['rituals','Plan and close my day','Choose only what matters']].map(([id,title,sub])=>`<button type="button" data-cx="spatial-tool" data-id="${id}"><div><strong>${title}</strong><span>${sub}</span></div>${icon('right')}</button>`).join('')}
    ${btn('Edit study log','open-log')}${btn('Study preferences','day-settings')}${btn('Connected calendars','calendar-settings')}</div>`,btn('Done','close'));
}
function crFitCalendar(){
 if(!document.body.classList.contains('cx-calendar-page'))return;
 requestAnimationFrame(()=>{const scroller=$('.cr-grid-scroller');if(!scroller)return;const key=view+':'+dkey(date),saved=crSpatialScroll.get(key);if(saved){scroller.scrollTop=saved.top;scroller.scrollLeft=saved.left}else{const blocks=blocksForDay(dkey(date),true).filter(b=>!b.actual&&!b.pin).sort((a,b)=>a.at.localeCompare(b.at));const at=blocks.length?crClockMin(blocks[0].at)-60:480;scroller.scrollTop=Math.max(0,(at-360)*84/60)}scroller.addEventListener('scroll',()=>{crSpatialScroll.set(key,{top:scroller.scrollTop,left:scroller.scrollLeft});if(!spatialSaveFrame)spatialSaveFrame=requestAnimationFrame(()=>{spatialSaveFrame=0;try{sessionStorage.setItem('lemma.calendar.scroll',JSON.stringify([...crSpatialScroll].slice(-32)))}catch{}})},{passive:true})})
}

function plan(){if(document.body.classList.contains("cx-calendar-page"))return crPlanner();const dateLabel=view==='month'?date.toLocaleDateString('en',{month:'long',year:'numeric'}):date.toLocaleDateString('en',{day:'numeric',month:'long'});return pageHead('Make room for the work','A day, with intention.','Your checkpoints meet your actual time.')+`<div class="cx-chips" aria-label="Planner sections">${[['calendar','Calendar'],['backlog','Backlog · '+S.tasks.filter(x=>!x.done).length],['deadlines','Deadlines · '+S.deadlines.length],['reviews','Topic reviews'],['rituals','Daily rituals']].map(([id,l])=>`<button data-cx="plan-tab" data-id="${id}" aria-pressed="${planTab===id}">${l}</button>`).join('')}</div>`+(planTab==='calendar'?`<section class="cx-section"><div class="cx-row cx-cal-tools"><div class="cx-wrap">${ib('left','date-prev','Previous '+view)}<strong style="font-size:15px;font-weight:500">${dateLabel}</strong>${ib('right','date-next','Next '+view)}${btn('Today','date-today','text small')}</div><div class="cx-seg" aria-label="Calendar view">${['agenda','day','week','month'].map(v=>`<button data-cx="cal-view" data-id="${v}" aria-pressed="${view===v}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}</div></div><div class="cx-row"><div class="cx-wrap cx-caption"><span><span class="cx-dot" style="background:var(--cx-green)"></span>Logged</span><span><span class="cx-dot"></span>Planned</span><span><span class="cx-dot" style="background:var(--cx-muted)"></span>Busy / Google</span></div>${btn(icon('plus')+' Block','new-block','small')}</div>${view==='month'?monthCalendar():weekCalendar()}<div class="cx-row"><span class="cx-caption">${view==='week'?'Scroll horizontally on a phone · tap any block':'Tap a block to edit its details'}</span>${btn(icon('leaf')+' Auto-plan','autoplan','small')}</div></section><div class="cx-grid"><section class="cx-paper"><div class="cx-row"><h3>Your plan learns with you</h3><span class="cx-tag">×1.3</span></div><p class="cx-sub" style="margin-top:7px">Topology usually takes 30% longer. The preview allows room for that.</p><div class="cx-line"></div><div class="cx-row"><span class="cx-sub">Peak window · 20:00–22:00</span>${btn('Set day','day-settings','text small')}</div></section><section class="cx-paper"><h3>A little breathing room</h3><p class="cx-sub" style="margin-top:7px">10-minute gaps · 10% buffer · fixed commitments protected.</p><div class="cx-line"></div><div class="cx-row"><span class="cx-sub">Google Calendar · preview</span>${btn('Manage','calendar-settings','text small')}</div></section></div>`:planTab==='backlog'?backlog():planTab==='deadlines'?deadlines():planTab==='reviews'?topicList():`<div class="cx-grid"><section class="cx-paper cx-stack"><span class="cx-eyebrow">Before you begin</span><h2>Choose what matters.</h2><p class="cx-sub">Pick from backlog and reviews, make space, then set one intention.</p>${btn(S.ritualDone?'Revisit today’s intention':'Plan my day','ritual','primary')}</section><section class="cx-paper cx-stack"><span class="cx-eyebrow">When you’re done</span><h2>Close the notebook.</h2><p class="cx-sub">See planned vs done, carry leftovers forward, choose tomorrow’s first step.</p>${btn(S.shutdownDone?'Revisit shutdown':'Shut down','shutdown')}</section></div>`)}
function weekCalendar(){let start=new Date(date);if(view==='week'){start.setDate(start.getDate()-(S.settings.week==='Sunday'?start.getDay():((start.getDay()+6)%7)))}const days=Array.from({length:view==='day'?1:7},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));return `<div class="cx-calendar-wrap"><div class="cx-week ${view==='day'?'day':''}"><div class="cx-week-head">${new Intl.DateTimeFormat(undefined,{timeZoneName:'short'}).formatToParts(new Date()).find(x=>x.type==='timeZoneName')?.value||'Local'}</div>${days.map(d=>`<div class="cx-week-head ${dkey(d)===dkey(new Date())?'now':''}">${d.toLocaleDateString('en',{weekday:'short'})}<b>${d.getDate()}</b></div>`).join('')}<div class="cx-hour-axis">${Array.from({length:15},(_,n)=>`<span style="--n:${n}">${String(n+9).padStart(2,'0')}</span>`).join('')}</div>${days.map(d=>`<div class="cx-day-column" data-date="${dkey(d)}">${blocksForDay(dkey(d),true).map(b=>{const [h,m]=b.at.split(':').map(Number);return `<button class="cx-cal-event ${b.actual?'actual':''} ${b.busy?'busy':''} ${b.current?'current':''}" style="--at:${h-9+m/60};--dur:${b.min/60}" data-cx="edit-block" data-id="${b.id}" draggable="${!b.actual}" title="${esc(b.title)} · ${b.at} · ${duration(b.min)}" aria-label="${esc(b.title)}, ${b.at}, ${duration(b.min)}, ${b.actual?'logged':b.busy?'busy':'planned'}"><strong>${esc(b.title)}</strong><span>${esc(b.subject)} · ${duration(b.min)}</span></button>`}).join('')}</div>`).join('')}</div></div>`}
function monthCalendar(){
 const first=new Date(date.getFullYear(),date.getMonth(),1),offset=(first.getDay()+6)%7;
 const start=new Date(first.getFullYear(),first.getMonth(),1-offset);
 const total=Math.ceil((offset+new Date(date.getFullYear(),date.getMonth()+1,0).getDate())/7)*7;
 const marks=['logged','planned','busy'];
 return `<p class="cr-month-key">Blocks per day</p><div class="cx-month" style="--cr-month-weeks:${total/7}">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="cx-date-head">${x}</div>`).join('')}${Array.from({length:total},(_,i)=>{
  const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i),day=dkey(d);
  const bs=blocksForDay(day,true),statuses=new Set(bs.map(crStatus));
  const isToday=day===dkey(new Date()),selected=day===dkey(date),outside=d.getMonth()!==date.getMonth();
  return `<div class="cx-month-day ${isToday?'today':''} ${selected?'selected':''} ${outside?'outside-month':''}" data-today="${isToday}" data-selected="${selected}"><button type="button" data-cx="month-day" data-id="${day}" aria-label="Open ${d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}${isToday?', today':''}${selected?', selected':''}, ${bs.length} blocks"><span>${d.getDate()}</span></button>${bs.length?`<div class="cr-month-compact" title="${bs.length} blocks"><span class="cr-month-count">${bs.length}</span><span class="cr-month-markers" aria-label="${marks.filter(s=>statuses.has(s)).map(s=>crStatusText[s]).join(', ')}">${marks.filter(s=>statuses.has(s)).map(s=>`<i data-status="${s}" class="${s}" aria-hidden="true"></i>`).join('')}</span></div>`:''}</div>`;
 }).join('')}</div>`;
}
const plannerListState={tasks:{query:'',limit:20},deadlines:{query:'',limit:20},topics:{query:'',limit:20}};
function plannerRows(kind,rows){const q=plannerListState[kind].query.toLocaleLowerCase();return rows.filter(row=>!q||[row.title,row.subject,row.kind].filter(Boolean).join(' ').toLocaleLowerCase().includes(q))}
function plannerSearch(kind,total){const state=plannerListState[kind];return `<div class="cr-list-toolbar"><label for="cx-search-${kind}">Search ${kind}<input type="search" id="cx-search-${kind}" data-planner-search="${kind}" value="${esc(state.query)}" placeholder="Find by title or subject" autocomplete="off"></label><span class="cx-caption" role="status">Showing ${Math.min(state.limit,total)} of ${total}${state.query?' matches':''}</span></div>`}
function plannerMore(kind,total){const state=plannerListState[kind];return total>state.limit?`<div class="cr-list-more">${btn('Load '+Math.min(20,total-state.limit)+' more','planner-more','',`data-id="${kind}"`)}</div>`:''}
function backlog(){
  const all=plannerRows('tasks',S.tasks),open=all.filter(t=>!t.done),done=all.filter(t=>t.done),limit=plannerListState.tasks.limit;
  const row=t=>`<article class="cx-task ${t.done?'checked':''}" data-task-row="${esc(t.id)}"><label class="cr-task-check"><input type="checkbox" data-cx="task-check" data-id="${esc(t.id)}" ${t.done?'checked':''} aria-label="Mark ${esc(t.title)} ${t.done?'incomplete':'complete'}"></label><div class="cr-task-description"><strong class="cx-task-title">${esc(t.title)}</strong><p class="cx-caption">${esc(t.subject)} · ${duration(t.min)}${t.priority===1?' · high priority':''}${t.checkpointId?' · '+esc(t.checkpointId):''}</p></div><div class="cr-task-actions">${btn('Schedule','schedule-task','',`data-id="${esc(t.id)}"`)}${btn('Edit','edit-task','',`data-id="${esc(t.id)}"`)}</div></article>`;
  return `<section class="cx-paper cr-backlog"><div class="cx-row"><h2>Backlog</h2>${btn(icon('plus')+' New task','new-task')}</div>${plannerSearch('tasks',open.length)}
    ${open.slice(0,limit).map(row).join('')||'<p class="cx-sub">No open tasks match. Clear the search or add a task.</p>'}${plannerMore('tasks',open.length)}
    ${done.length?`<details class="lemma-completed-tasks"><summary>Completed · ${done.length}</summary>${done.slice(0,limit).map(row).join('')}${done.length>limit?btn('Load more completed tasks','planner-more','',`data-id="tasks"`):''}</details>`:''}
    <div class="cx-row cr-list-footer"><span class="cx-caption">${open.length} open tasks · ${duration(open.reduce((n,t)=>n+t.min,0))} estimated</span>${btn('Preview a plan','autoplan')}</div></section>`;
}
function deadlines(){
 const rows=plannerRows('deadlines',S.deadlines),limit=plannerListState.deadlines.limit;
 return `<section class="cx-section">${sectionHead('Deadlines',btn(icon('plus')+' New deadline','new-deadline','small'))}${plannerSearch('deadlines',rows.length)}${rows.slice(0,limit).map(d=>`<article class="cx-paper cr-deadline-card"><span class="cx-caption">${esc(d.subject)} · ${esc(d.kind)}</span><h3>${esc(d.title)}</h3><div class="cr-deadline-meta"><span>${new Date(d.date+'T12:00').toLocaleDateString('en',{day:'numeric',month:'long',year:'numeric'})} · ${d.hours}h remaining</span><strong>${(()=>{const n=daysUntil(d.date);return n===0?'Today':n===1?'Tomorrow':n<0?Math.abs(n)+' day'+(n===-1?'':'s')+' overdue':n+' days away'})()}</strong></div>${btn('Work backwards','backward','',`data-id="${d.id}"`)}</article>`).join('')}${!rows.length?'<p class="cx-paper cx-sub">No matching deadlines.</p>':''}${plannerMore('deadlines',rows.length)}</section>`
}
function topicList(filter){
 const topics=plannerRows('topics',S.topics.filter(t=>!filter||t.subject===filter)),limit=plannerListState.topics.limit;
 return `<section class="cx-paper"><div class="cx-row"><h2>Topic practice notes</h2>${btn(icon('plus')+' New topic','new-topic','small')}</div><p class="cx-sub" style="margin:8px 0">Practice a topic in your own words, then self-assess. This does not grade or reschedule any cards.</p>${plannerSearch('topics',topics.length)}${!topics.length?'<p class="cx-sub">No matching topics. Add one to plan a recall check.</p>':''}${topics.slice(0,limit).map(t=>`<div class="cr-topic-row"><div><h3>${esc(t.title)}</h3><p class="cx-caption">${esc(t.subject)} · ${esc(t.due)} · ${t.interval}d interval</p></div>${btn('Practice','topic-recall','small',`data-id="${t.id}"`)}</div>`).join('')}${plannerMore('topics',topics.length)}</section>`
}
function insights(){return pageHead('Time is only part of it','See what is changing.','Sample week · 26 October – 1 November',ib('left','insight-prev','Previous period')+ib('right','insight-next','Next period'))+`<div class="cx-chips" aria-label="Insight sections">${['overview','focus','estimates','patterns','streak'].map(v=>`<button data-cx="insight-tab" data-id="${v}" aria-pressed="${insightTab===v}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}</div>`+(insightTab==='overview'?`<div class="cx-grid"><section class="cx-paper"><div class="cx-row"><div><span class="cx-eyebrow">This week</span><div class="cx-metric cx-num">18h 40m</div><p class="cx-sub">of 24h · 78% of your intention</p></div><svg style="width:72px;height:72px;transform:rotate(-90deg)" viewBox="0 0 80 80" role="img" aria-label="78 percent of weekly time goal"><circle cx="40" cy="40" r="32" fill="none" stroke="var(--cx-raised)" stroke-width="4"/><circle cx="40" cy="40" r="32" fill="none" stroke="var(--cx-blue)" stroke-width="4" stroke-dasharray="157 201"/></svg></div>${bars([170,140,200,150,130,140,190],['M','T','W','T','F','S','S'])}<div class="cx-row" style="margin-top:12px"><span class="cx-caption">26 Oct – 1 Nov</span>${btn('Week / month','insight-range','text small')}</div></section><section class="cx-paper"><h2>A gentler adjustment</h2><a class="cx-menu-item" href="#/carrel/plan"><div class="cx-grow"><strong>Give algebra a little room.</strong><small>4h of 8h this week · plan two sessions</small></div>${icon('right')}</a><a class="cx-menu-item" href="#/carrel/insights" data-cx="insight-tab" data-id="focus"><div class="cx-grow"><strong>Your best work starts at 20:00.</strong><small>Average focus 2.8 / 3 · use this window</small></div>${icon('right')}</a><a class="cx-menu-item" href="#/carrel/distractions"><div class="cx-grow"><strong>You returned more quickly.</strong><small>Drift down 18 min from last week</small></div>${icon('right')}</a></section></div><div class="cx-grid3 cx-metrics"><div class="cx-paper"><div class="cx-metric">82<small>%</small></div><p class="cx-sub">Estimate accuracy</p></div><div class="cx-paper"><div class="cx-metric">46<small> min</small></div><p class="cx-sub">Typical session</p></div><div class="cx-paper"><div class="cx-metric">6<small> days</small></div><p class="cx-sub">Flexible streak</p></div></div><section class="cx-paper"><h2>Time, attached to a purpose.</h2>${[['Topology','8h 20m',83],['Algebra','4h',50],['Complex analysis','6h 20m',79]].map(([n,v,p])=>`<a class="cx-menu-item" href="#/carrel/subjects"><div class="cx-grow"><strong>${n}</strong><div class="cx-progress" style="margin-top:8px"><i style="width:${p}%"></i></div></div><span>${v}</span></a>`).join('')}</section><div class="cx-row">${link('Learning & card analytics →','/insights','cx-btn text')}${link('Coach review →','/carrel/coach','cx-btn text')}</div>`:insightTab==='focus'?`<section class="cx-paper"><h2>Focus has a rhythm.</h2><p class="cx-sub" style="margin-top:8px">Average self-reported focus · 1 scattered / 3 deep</p>${bars([2,2.1,1.9,2.3,2.5,2.8,2.9,2.6],['09','11','13','15','17','19','20','22'],3)}<div class="cx-line"></div>${[['Topology','2.8 / 3'],['Algebra','2.2 / 3'],['Complex analysis','2.6 / 3']].map(([n,v])=>`<div class="cx-log-row" style="grid-template-columns:1fr auto"><span>${n}</span><span>${v}</span></div>`).join('')}</section>`:insightTab==='estimates'?`<section class="cx-paper"><div class="cx-metric">82<small>% accuracy</small></div><p class="cx-sub" style="margin-top:8px">Planned time compared with completed sessions.</p><div class="cx-line"></div>${[['Topology','×1.3','Allow 65m for a 50m estimate'],['Algebra','×1.1','Allow 55m for a 50m estimate'],['Complex analysis','×1.0','Your estimates are close']].map(([n,v,d])=>`<div class="cx-log-row" style="grid-template-columns:1fr auto"><div><h3>${n}</h3><p class="cx-caption">${d}</p></div><span class="cx-tag">${v}</span></div>`).join('')}</section>`:insightTab==='patterns'?`<section class="cx-paper"><div class="cx-row"><h2>When the work happens</h2><span class="cx-tag">4 weeks</span></div><p class="cx-sub" style="margin:8px 0 20px">Minutes studied by weekday and hour · illustrative</p>${heat()}<div class="cx-row" style="margin-top:12px"><span class="cx-caption">09:00</span><span class="cx-caption">15:00</span><span class="cx-caption">21:00</span></div><div class="cx-line"></div><div class="cx-row"><span class="cx-sub">Typical session</span><span>46 min</span></div><p class="cx-sub" style="margin-top:10px">Evenings are your most consistent study window.</p></section>`:`<section class="cx-paper"><span class="cx-eyebrow">Return, without perfection.</span><div class="cx-metric">6 <small>days</small></div><p class="cx-sub" style="margin-top:8px">A ${S.settings.minDay}-minute minimum day. One freeze per week.</p><div class="cx-line"></div><div class="cx-wrap">${['M ✓','T ✓','W ◇','T ✓','F ✓','S ✓','S ✓'].map(t=>`<span class="cx-tag" style="padding:12px;color:${t.includes('◇')?'var(--cx-blue)':'var(--cx-green)'}">${t}</span>`).join('')}</div><p class="cx-caption" style="margin-top:12px">◇ Wednesday used this week’s freeze.</p>${btn('Set your minimum day','day-settings','text','style="margin-top:12px"')}</section>`)}
function bars(vals,labels,max){max=max||Math.max(...vals);return `<div class="cx-bars" role="img" aria-label="${esc(labels.map((l,i)=>l+': '+vals[i]).join('; '))}">${vals.map((v,i)=>`<div class="cx-bar ${i===vals.length-1?'today':''}"><b>${max<=3?v.toFixed(1):duration(v)}</b><i style="height:${Math.round(v/max*88)}px"></i><span>${labels[i]}</span></div>`).join('')}</div>`}
function heat(){return `<div class="cx-heat" role="img" aria-label="Sample study intensity: strongest evenings from 20:00">${['M','T','W','T','F','S','S'].map((l,d)=>`<span>${l}</span>${Array.from({length:12},(_,h)=>`<i style="opacity:${h>8?.35+((d+h)%4)*.18:(d*7+h*3)%5*.08+.06}"></i>`).join('')}`).join('')}</div>`}
function subjects(){return pageHead('A subject, in context','Your fields of work.','Time, topics and the next step — together.')+`<section class="cx-section">${[['Topology','8h 20m / 10h',83,'Seminar in 5d · 1 topic due'],['Algebra','4h / 8h',50,'Qualifying exam in 19d · 1 topic due'],['Complex analysis','6h 20m / 8h',79,'1 topic due tomorrow']].map(([n,v,p,sub])=>`<article class="cx-paper"><div class="cx-row"><h2 style="font-style:normal">${n}</h2>${btn('Open','subject-detail','text small',`data-id="${n}"`)}</div><p class="cx-sub" style="margin:8px 0">${sub}</p><div class="cx-progress"><i style="width:${p}%"></i></div><div class="cx-row" style="margin-top:12px"><span class="cx-caption">This week · ${v}</span>${btn('Start','subject-start','small',`data-id="${n}"`)}</div></article>`).join('')}</section>`+topicList()+`<div class="cx-provenance">${link('Open Lemma’s knowledge Atlas →','/atlas','cx-btn text')}</div>`}
let crLogShown=20;
function crLogDate(key){const date=new Date(key+'T12:00');return Number.isFinite(+date)?date.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',...(date.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})}):'Unassigned date'}
function log(){
 const records=(window.__lemmaEffortMetrics?.uniqueEntries?.(S.entries)??[...S.entries]).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.start||'').localeCompare(String(a.start||''))||String(a.id||'').localeCompare(String(b.id||'')));
 const visible=records.slice(0,crLogShown);
 const total=Math.round(window.__lemmaEffortMetrics?.allTime?.(records)?.committedMinutes??records.reduce((n,e)=>n+(Number(e.min)||0),0));
 const today=new Date(),heading=today.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
 return pageHead('Saved study time','Study log',heading+' · edit, split or add a session.',ib('plus','new-entry','Add manual entry'))+
 `<section class="cx-paper"><div class="cx-row"><h2>All-time study log</h2><span class="cx-tag" aria-label="${records.length} records, ${total} minutes logged">${duration(total)} logged</span></div>
 <p class="cx-caption" role="status">Showing ${visible.length.toLocaleString()} of ${records.length.toLocaleString()} saved records · all time. Running focus time is not included until saved.</p>
 ${visible.map(e=>`<div class="cx-log-row"><span class="cx-caption">${esc(crLogDate(e.date))}<br>${esc(e.start||'—')}</span><div><h3>${esc(e.title)}</h3><p class="cx-caption">${esc(e.subject)} · ${esc(e.focus)} · ends ${esc(e.end||'—')}${e.checkpointId?' · '+esc(e.checkpointId):''}</p>${nativeWin.__lemmaEffortMetrics.allTime([e]).futureRecords?'<p class="lemma-log-review">Future time · excluded from logged totals. Edit this record to correct it.</p>':''}${e.timeApproximate?`<p class="cx-caption" aria-label="Time is approximate">${e.editedTimeRange?'Time adjusted by hand':'Time inferred from a prior timer snapshot'}</p>`:''}${e.note?`<p class="cx-sub" style="margin-top:5px">${esc(e.note)}</p>`:''}</div><div style="text-align:right"><b style="font-weight:500">${duration(e.min||0)}</b><div>${ib('edit','edit-entry','Edit '+e.title,`data-id="${esc(e.id)}"`)}</div></div></div>`).join('')||'<p class="cx-empty">Your next session starts a new page.</p>'}
 ${visible.length<records.length?`<button type="button" data-cx="log-more" class="cx-btn" style="width:100%;min-height:44px">Load ${Math.min(20,records.length-visible.length)} more records</button>`:''}
 </section><div class="cx-row">${btn(icon('export')+' Export CSV','export-csv','text')}${btn('JSON backup','export-json','text')}</div>`;
}
function menuItem(ic,title,sub,to){return `<a class="cx-menu-item" href="#${to}">${icon(ic)}<div class="cx-grow"><strong>${title}</strong><small>${sub}</small></div>${icon('right')}</a>`}
function more(){return pageHead('One place for the whole practice','Your study desk.','A quiet home for learning and time.',ib('settings','settings','Study settings'))+`<div class="cx-grid"><section class="cx-paper">${menuItem('chart','Insights','18h 40m · time, focus, estimates & streak','/carrel/insights')}${menuItem('book','Subjects','3 fields · topics, goals & deadlines','/carrel/subjects')}${menuItem('atlas','Atlas','Your mathematical knowledge, connected','/atlas')}${menuItem('log','Time log',S.entries.length+' sessions · edit, split & export','/carrel/log')}</section><section class="cx-paper">${menuItem('coach','From your tutor','Learning proposals & daily coaching','/carrel/coach')}${menuItem('urge','Attention','Noticed, drift & parked thoughts','/carrel/distractions')}${menuItem('phone','Beyond the app','Notification, widgets & quick controls','/carrel/android')}${menuItem('settings','Settings','Timer, day, sync & preferences','/carrel/settings')}</section></div><section class="cx-paper"><div class="cx-row"><div><span class="cx-eyebrow">About this design study</span><h2>One notebook. Two kinds of progress.</h2><p class="cx-sub" style="margin-top:8px">Lemma tracks what you understand. Carrel gives that work time and space.</p></div></div><div class="cx-line"></div>${menuItem('check','Feature inventory','Explore all '+featureGroups.reduce((n,g)=>n+g.items.length,0)+' mapped Carrel capabilities','/carrel/features')}<p class="cx-caption" style="margin-top:12px">Local demo data · no account connection · Android surfaces are visual previews. Original Lemma screens remain interactive.</p></section>`}
function coach(){return pageHead('Learning & planning, in one inbox','From your tutor.','A proposal stays a proposal until you decide.')+`<section class="cx-paper"><div class="cx-row"><span class="cx-tag">Claude · daily plan</span><span class="cx-caption">Sample proposal</span></div><h2 style="margin-top:18px">A little more room for topology.</h2><p class="cx-sub" style="margin-top:10px">Use your evening focus window for the proof. Keep the review short and leave a break between them.</p><div class="cx-line"></div><div class="cx-row"><span>20:00 · Quotient topology</span><span class="cx-caption">65m</span></div><div class="cx-row" style="margin-top:12px"><span>21:15 · Retrieval practice</span><span class="cx-caption">25m</span></div><div class="cx-line"></div><div class="cx-row"><span class="cx-caption">2 blocks · review before accepting</span><div class="cx-wrap">${S.coachAccepted?'':btn(S.coachDismissed?'Dismissed ✓':'Dismiss','coach-dismiss','text small',S.coachDismissed?'disabled':'')}${btn(S.coachAccepted?'Accepted ✓':'Accept into day','coach-accept',S.coachAccepted?'':'primary',S.coachAccepted?'disabled':'')}</div></div></section><section class="cx-paper"><span class="cx-eyebrow">Weekly reflection</span><h2>Your return is getting easier.</h2><p class="cx-sub" style="margin-top:10px">Topology received the most time. Algebra needs two intentional blocks next week. Your evening sessions are consistently rated deep.</p></section><div class="cx-grid"><section class="cx-paper cx-stack"><h3>Learning plans & amendments</h3><p class="cx-sub">Use the attached Lemma’s full review workflow, checkpoint map and approval controls.</p>${link('Review Lemma proposals →','/proposals?tab=plan')}</section><section class="cx-paper cx-stack"><h3>Start with a prompt</h3><p class="cx-sub">Copy a day plan, week plan, exam plan or weekly review prompt into your own chat.</p>${btn('Copy a planning prompt','copy-prompt')}</section></div>`}
function distractions(){return pageHead('Notice. Make room. Return.','Attention, without guilt.','Small ways back to what you meant to do.')+`<div class="cx-grid3 cx-metrics"><div class="cx-paper"><div class="cx-metric">${S.notices}</div><p class="cx-sub">Noticed today</p></div><div class="cx-paper"><div class="cx-metric">${S.drift}<small> min</small></div><p class="cx-sub">Drift today</p></div><div class="cx-paper"><div class="cx-metric">−18<small> min</small></div><p class="cx-sub">Drift vs last week</p></div></div><section class="cx-paper"><h2>A moment between urge and action.</h2><p class="cx-sub" style="margin-top:8px">Wait for a minute, log time honestly, or set a thought aside.</p><div class="cx-wrap" style="margin-top:18px">${btn(icon('urge')+' Noticed','noticed','primary')}${btn('Log drift','drift')}${btn(icon('park')+' Park a thought','park')}</div></section><section class="cx-paper"><div class="cx-row"><h2>Parked for later</h2><span class="cx-tag">${S.parked.filter(p=>!p.done).length}</span></div>${S.parked.filter(p=>!p.done).map(p=>`<div class="cx-log-row" style="grid-template-columns:1fr auto"><div><span>${esc(p.text)}</span><p class="cx-caption">Saved during focus</p></div><div>${ib('plus','park-task','Move to backlog',`data-id="${p.id}"`)}${ib('close','park-dismiss','Dismiss thought',`data-id="${p.id}"`)}</div></div>`).join('')||'<p class="cx-empty">Nothing to hold in mind.</p>'}</section><section class="cx-paper"><div class="cx-row"><div><h3>Phone drift detection</h3><p class="cx-sub">Opt-in Android usage summary · design preview</p></div>${toggle('drift')}</div><div class="cx-inset" style="margin-top:15px"><span class="cx-caption">Example after a study session</span><div class="cx-row" style="margin-top:7px"><span>Instagram · 6m · 3 opens</span>${btn('Log as drift','drift','small')}</div></div></section>`}
const toggle=(key)=>`<button type="button" class="cx-toggle" role="switch" aria-checked="${!!S.settings[key]}" aria-label="${esc(key)}" data-cx="toggle" data-id="${key}"></button>`;
function settings(){return pageHead('Make this desk your own','The quiet details.','Preferences apply to this local mockup.')+`<section class="cx-paper">${menuItem('clock','Timer',`${S.timer.mode==='pomo'?'Pomodoro':S.timer.mode==='flow'?'Flowtime':'Open timer'} · ${S.timer.focus}/${S.timer.short} · ${S.settings.guard}h guard`,'/carrel/settings') .replace('href="#/carrel/settings"','href="#/carrel/settings" data-cx="start-options"')}${menuItem('plan','Daily schedule',`${S.settings.planStart}–${S.settings.planEnd} · ${S.settings.gap}m gaps · ${duration(S.settings.daily)} goal`,'/carrel/settings').replace('href="#/carrel/settings"','href="#/carrel/settings" data-cx="day-settings"')}${menuItem('book','Activities','Study, reading, break, sleep & custom labels','/carrel/settings').replace('href="#/carrel/settings"','href="#/carrel/settings" data-cx="activities"')}${menuItem('plan','Google Calendar','Busy time, permissions & mirror preview','/carrel/settings').replace('href="#/carrel/settings"','href="#/carrel/settings" data-cx="calendar-settings"')}</section><section class="cx-paper"><h2>Focus experiments</h2>${[['flow','Adaptive breaks','Suggest 5–20 minutes after focus'],['recall','Session reflection','Rate focus, tag topics, write a recall note'],['energy','Energy check-in','Optional before starting'],['urge','Urge surfing','A 60-second pause when you notice']].map(([k,t,s])=>`<div class="cx-menu-item"><div class="cx-grow"><strong>${t}</strong><small>${s}</small></div>${toggle(k)}</div>`).join('')}</section><section class="cx-paper"><h2>Local & connected</h2>${menuItem('phone','Android surfaces','Silent notification · optional end pulse','/carrel/android')}<div class="cx-menu-item"><div class="cx-grow"><strong>Sync & offline queue</strong><small>Visual preview · no account is connected</small></div>${btn('Inspect','sync-preview','text small')}</div><div class="cx-menu-item"><div class="cx-grow"><strong>Export this sample data</strong><small>Download a CSV or JSON backup</small></div>${btn('CSV','export-csv','text small')}${btn('JSON','export-json','text small')}</div><div class="cx-menu-item"><div class="cx-grow"><strong>Keyboard shortcuts</strong><small>Space: focus · B: break · N: capture</small></div>${btn('View','keys','text small')}</div></section><section class="cx-paper">${menuItem('settings','Lemma settings','Study context, sources, appearance & tutor setup','/settings')}<div class="cx-row"><span class="cx-sub">Reset mockup sample data</span>${btn('Reset','reset','text small')}</div></section>`}
function android(){return pageHead('Your work, at the periphery','Beyond the open app.','Android surface previews · controls share the demo timer.')+`<div class="cx-grid"><section class="cx-section">${sectionHead('Live notification','<span class="cx-badge">ANDROID 16 PREVIEW</span>')}<div class="cx-notification"><div class="cx-row"><span class="cx-caption">${icon('book')} Lemma · Carrel</span><span class="cx-caption">Silent</span></div><div class="cx-row" style="margin-top:17px"><div><strong>${esc(S.timer.activity)}</strong><p class="cx-caption">${esc(S.timer.intent)}</p></div><b class="cx-num" style="font-size:29px;font-weight:400" data-cx-clock>${displayClock()}</b></div><div class="cx-progress" style="margin-top:15px"><i style="width:58%;background:var(--cx-accent)"></i></div><div class="cx-wrap" style="margin-top:10px">${btn('Break','break','text small')}${btn('Noticed','noticed','text small')}${btn('Stop','finish','text small')}</div></div><p class="cx-caption">Live Update where supported; ongoing notification otherwise.</p></section><section class="cx-section">${sectionHead('Home-screen widget','<span class="cx-badge">4 × 1</span>')}<div class="cx-widget"><div class="cx-row"><span class="cx-sub"><span class="cx-dot" style="background:var(--cx-accent)"></span>${esc(S.timer.activity)}</span><span class="cx-caption">Today · 3h 10m</span></div><div class="cx-row" style="margin-top:12px"><b class="cx-num" style="font-size:36px;font-weight:400" data-cx-clock>${displayClock()}</b>${ib(S.timer.running?'stop':'play',S.timer.running?'finish':'start-options',S.timer.running?'Stop from widget':'Start from widget')}</div></div><span class="cx-caption">Compact 2 × 1 also keeps start / stop within reach.</span></section></div><div class="cx-grid"><section class="cx-paper"><h2>One quick action.</h2><div class="cx-wrap" style="margin-top:18px"><button class="cx-tile" data-cx="quick-tile">${icon('clock')}<strong style="display:block;margin-top:10px">Carrel</strong><span class="cx-caption">${S.timer.running?'Stop '+esc(S.timer.activity):'Start last session'}</span></button><span class="cx-caption">Quick Settings tile<br>Tap to start or stop</span></div></section><section class="cx-paper"><h2>Less opening. More doing.</h2><div class="cx-shortcuts" style="margin-top:18px">${crSubjects().map(n=>`<button data-cx="subject-start" data-id="${n}">${icon('play')} ${n}</button>`).join('')}${btn(icon('plus')+' Quick add','capture')}</div><div class="cx-line"></div>${btn('Preview Android share target','share-target','text')}</section></div><section class="cx-paper"><h2>Respect the quiet.</h2>${[['notification','Ongoing notification','A live timer outside the app'],['widget','Home-screen widget','Timer, today’s total, start / stop'],['pulse','Pomodoro-end pulse','Optional vibration · off by default']].map(([k,l,s])=>`<div class="cx-menu-item"><div class="cx-grow"><strong>${l}</strong><small>${s}</small></div>${toggle(k)}</div>`).join('')}<p class="cx-caption" style="margin-top:12px">No sound. Permission, exact-alarm and battery setup are shown in the integration checklist; this HTML does not request device permissions.</p></section>`}
const featureGroups=[
{title:'Time & sessions',source:'web/ui/today.js · today-sheets.js · focus.js',items:[['Live count-up timer, start / stop / resume','/','Interactive'],['Switch study and life activities','/carrel/settings','Interactive'],['Pomodoro 25/5, 50/10, 90/20 and custom cycles','/','Interactive'],['Open timer and Flowtime adaptive breaks','/','Interactive'],['Session intention and if–then plan','/','Interactive'],['Optional energy check-in','/carrel/settings','Interactive'],['Fullscreen focus desk','/','Interactive'],['Break countdown, walk / water / stretch','/','Interactive'],['Long-running timer guard / fix stop time','/carrel/log','Interactive'],['Focus rating, topic tags and recall reflection','/','Interactive']]},
{title:'Today & daily rituals',source:'web/ui/today.js · ribbon.js · rituals.js',items:[['Daily goal and next planned block','/','Interactive'],['24-hour ribbon: actual vs planned time','/','Interactive'],['Relevant context: due reviews, seminar, next work','/','Interactive'],['Morning selection, plan preview, intention','/carrel/plan','Interactive'],['Shutdown: done vs planned, carry / drop, tomorrow first','/carrel/plan','Interactive']]},
{title:'Calendar & planning',source:'web/cal.js · logic/scheduler.js · ui/plan-sheets.js',items:[['Day, week and month calendar views','/carrel/plan','Interactive'],['Previous / next dates and return to Today','/carrel/plan','Interactive'],['Create, edit, move and delete planned blocks','/carrel/plan','Interactive'],['Pinned start times and per-block Pomodoro','/carrel/plan','Interactive'],['Busy periods and repeating weekly commitments','/carrel/plan','Interactive'],['Backlog: estimates, due dates, priority and completion','/carrel/plan','Interactive'],['Find time / auto-plan confirmation preview','/carrel/plan','Interactive'],['History-adjusted estimates and peak focus windows','/carrel/insights','Illustrative data'],['Buffer, block gaps and overflow preview','/carrel/plan','Interactive'],['Deadlines and backward planning from exams','/carrel/plan','Interactive'],['Carry forward unfinished work','/carrel/plan','Interactive']]},
{title:'Subjects & revision',source:'web/ui/subjects.js · logic/spacing.js',items:[['Subject goals, time, backlog, deadlines and recent sessions','/carrel/subjects','Interactive'],['Create and edit review topics','/carrel/subjects','Interactive'],['Recall ratings: poor / okay / good','/carrel/subjects','Interactive'],['Due intervals and next-review updates','/carrel/subjects','Interactive'],['Place topic revision in the calendar','/carrel/plan','Interactive'],['Keep Lemma cards, Atlas and checkpoint plans','/review','Original Lemma']]},
{title:'Attention & distraction',source:'web/ui/today.js · logic/distraction.js',items:[['Noticed / urge counter and 60-second urge surfing','/carrel/distractions','Interactive'],['Log 1, 5, 15 or custom minutes of drift','/carrel/distractions','Interactive'],['Park a thought; move to backlog or dismiss','/carrel/distractions','Interactive'],['Weekly drift trend','/carrel/distractions','Illustrative data'],['Opt-in app usage summary and drift suggestion','/carrel/distractions','Android concept preview']]},
{title:'Logs & insights',source:'web/ui/log.js · stats.js · stats-pages.js',items:[['Manual, editable time log and session notes','/carrel/log','Interactive'],['Split an entry and correct start / stop times','/carrel/log','Interactive'],['CSV export and JSON backup','/carrel/log','Local downloads'],['Weekly / monthly totals and subject goals','/carrel/insights','Illustrative data'],['Focus by hour and subject','/carrel/insights','Illustrative data'],['Estimate multiplier and accuracy','/carrel/insights','Illustrative data'],['Patterns heatmap and typical session length','/carrel/insights','Illustrative data'],['Flexible streak, minimum day and weekly freeze','/carrel/insights','Illustrative data'],['Actionable suggestions and fresh-start ritual','/carrel/insights','Interactive navigation']]},
{title:'Capture & coaching',source:'web/ui/capture.js · coach.js · settings-pages.js',items:[['Natural-language capture with parsed preview','/carrel/more','Interactive'],['Task, deadline, block and Ask Claude capture modes','/carrel/more','Interactive'],['Coach notes, daily proposals and weekly reflection','/carrel/coach','Interactive'],['Accept or dismiss a plan before scheduling','/carrel/coach','Interactive'],['Copy day / week / exam / review prompts','/carrel/coach','Interactive'],['Lemma learning-plan review and approval','/proposals?tab=plan','Original Lemma']]},
{title:'Android & integrations',source:'android/.../live/* · web/native.js · web/gcal.js',items:[['Silent live notification and Android 16 Live Update','/carrel/android','Visual preview'],['2×1 / 4×1 home-screen widgets','/carrel/android','Visual preview'],['Quick Settings start-last / stop tile','/carrel/android','Interactive preview'],['Subject shortcuts, quick-add and share target','/carrel/android','Interactive preview'],['Optional Pomodoro-end vibration; no sound','/carrel/android','Preference preview'],['Notification, alarm and battery setup','/carrel/android','Visual preview'],['Google busy calendar / Study calendar','/carrel/settings','Visual preview'],['Realtime sync, offline queue and conflict recovery','/carrel/settings','Visual preview']]},
{title:'Preferences & utility',source:'web/ui/settings-pages.js · settings-activities.js',items:[['Daily goal, minimum day, gaps, clock and week start','/carrel/settings','Interactive'],['Custom activities and study / life roles','/carrel/settings','Interactive'],['Labs for adaptive breaks, recall, energy, urge-surf','/carrel/settings','Interactive'],['Keyboard shortcuts and undo','/carrel/settings','Interactive'],['Account, export, version and update information','/carrel/settings','Design preview']]}
];
function features(){return pageHead('Carrel, accounted for','The feature inventory.','One template · '+featureGroups.reduce((n,g)=>n+g.items.length,0)+' mapped capabilities.')+`<section class="cx-paper"><p class="cx-sub">Built on the attached Lemma v4 template, with its original bundled screens intact. Carrel capabilities are mapped from the active repository’s UI and v2 plan. This is a design prototype using sample data.</p><div class="cx-line"></div><p class="cx-caption">Interactive = local demo behaviour. Illustrative = sample analytics. Native / connected services = presentation only. The Android usage detector is a planned concept in the source plan, not a verified installed capability.</p></section><div class="cx-paper cx-feature-group">${featureGroups.map((g,i)=>`<details ${i===0?'open':''}><summary><span>${g.title}</span><span class="cx-tag">${g.items.length} features ＋</span></summary>${g.items.map(([name,to,status])=>`<div class="cx-feature"><span>✓</span><div>${name}<br><code>${status}</code></div>${link('Explore ↗',to,'')}</div>`).join('')}<p class="cx-caption" style="margin-top:14px">Source: ${g.source}</p></details>`).join('')}</div><div class="cx-provenance"><p>Source review: <a href="https://github.com/Mymayankyadav/carrel-app/tree/0a2509a66af6aaed1f04bd706c98deb0407c5255" target="_blank" rel="noopener">Carrel repository · 0a2509a</a> · README, current UI modules and PLAN-v2.</p><p style="margin-top:8px">Preserved Lemma build: 8799785. Existing project progress, sources, Atlas, card reviews and plan proposals are retained. Demo timer writes are independent of live study records.</p></div>`}
function modal(title,body,foot=''){
  const d=$('#cx-modal');
  if(d.open)d.close();
  modalOpener=document.activeElement;
  const isBlock=body.includes('id="cx-block-title"');
  const isTools=body.includes('cr-tools-menu');
  const isSettings=body.includes('id="cx-daystart"')||body.includes('id="cx-weekstart"')||title.includes('Calendar, in the margin.');
  const isEditor=isBlock||isSettings||/id="cx-(entry-title|task-title|deadline-title|topic-title|topic-edit-title|activity|capture|split-min|park|block-date|focus-intent)"/.test(body);
  const shortText=body.length<1100&&!isEditor&&!isTools&&!body.includes('<textarea')&&!body.includes('<input');
  const layout=isBlock?'block':isTools?'menu':isEditor?'sheet':shortText?'compact':'sheet';
  d.dataset.layout=layout;
  const readableTitle=isBlock?(title.startsWith('Make this')?'Edit time block':'New time block')
    :isTools?'Planning tools':({'Give this session a shape.':'Set up focus','Leave a small trace.':'Finish focus session','Edit the record.':'Edit study time','Add time you gave.':'Add study time','Two parts of one session.':'Split study time','Recall before you look.':'Practice a topic','Make room to return.':'Take a break','Wait it out.':'Pause a distraction','Give the minutes their name.':'Log a distraction','A date on the horizon.':'New deadline'}[title]||title);
  const overline=isBlock?'YOUR CALENDAR':isTools?'PLAN YOUR DAY':isSettings?'PREFERENCES':'';
  const heading=`<div class="cx-modal-head"><div class="cx-modal-heading">${overline?`<span class="cx-modal-eyebrow">${overline}</span>`:''}<h2 id="cx-modal-title" tabindex="-1">${esc(readableTitle)}</h2></div>${ib('close','close','Close dialog')}</div>`;
  d.innerHTML=`${heading}<div class="cx-modal-body">${body}</div>${foot?`<div class="cx-modal-foot">${foot}</div>`:''}`;
  d.showModal();calendarScrollLock(d,true);
  nativeWin.__lemmaNativeDialogOpen?.();
  if(isBlock){
    const dateField=$('#cx-block-date');
    if(dateField&&dateField.value){
      const dt=new Date(dateField.value+'T12:00:00');
      const el=d.querySelector('.cx-modal-eyebrow');
      if(el&&!isNaN(dt))el.textContent='CALENDAR · '+dt.toLocaleDateString('en',{month:'short',day:'numeric'}).toUpperCase();
    }
    d.querySelectorAll('[data-cx="block-duration"]').forEach(el=>el.classList.toggle('is-selected',el.dataset.id===$('#cx-block-min')?.value));
  }
  setTimeout(()=>{
    if(!d.open)return;
    const isPhone=matchMedia('(max-width:640px)').matches;
    const f=isPhone?d.querySelector('#cx-modal-title'):d.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,select');
    (f||d.querySelector('#cx-modal-title'))?.focus({preventScroll:true});
  },30);
}
function close(){const d=$('#cx-modal');if(d.open)d.close();calendarScrollLock(d,false);urgeEnd=0;if(modalOpener?.isConnected)modalOpener.focus()}
const val=(id)=>$('#'+id)?.value||'';
const checked=(id)=>!!$('#'+id)?.checked;
const field=(label,id,value='',type='text',extra='')=>calendarFieldMarkup(label,id,value,type,extra,S.settings.clock);
const select=(label,id,options,value)=>`<label for="${id}">${label}<select id="${id}">${options.map(o=>`<option ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
const areas=(label,id,value='',extra='')=>`<label for="${id}">${label}<textarea id="${id}" ${extra}>${esc(value)}</textarea></label>`;
const jointProjects=[{id:'topology',name:'Topology',cp:'CP2',checkpoint:'Topological spaces'},{id:'linear-algebra',name:'Linear Algebra',cp:'CP9',checkpoint:'Diagonalization'},{id:'real-analysis',name:'Real Analysis',cp:'CP4',checkpoint:'Compactness'}];
let jointPendingProject=null,jointPendingKind=null;
function jointContext(t=S.timer){const id=Object.prototype.hasOwnProperty.call(t,'projectId')?t.projectId:S.integration?.links?.[t.activity]||'',p=jointProjects.find(x=>x.id===id);return{projectId:p?.id||null,checkpointId:Object.prototype.hasOwnProperty.call(t,'checkpointId')?t.checkpointId:(S.integration?.autoLink?p?.cp:null)||null,kind:t.kind||'proof'};}
function jointFields(activity){const id=jointPendingProject?.id||((activity&&activity!==S.timer.activity)?S.integration?.links?.[activity]||'':S.timer.projectId||S.integration?.links?.[activity||S.timer.activity]||''),p=jointProjects.find(p=>p.id===id);return `<div class="cx-form-grid"><label for="cx-joint-project">Lemma project<select id="cx-joint-project"><option value="">Unlinked / general study</option>${jointProjects.map(p=>`<option value="${p.id}" ${p.id===id?'selected':''}>${p.name}</option>`).join('')}</select></label><label for="cx-joint-kind">Session kind<select id="cx-joint-kind">${[['proof','Proof practice'],['reading','Reading'],['review','Card review']].map(([v,l])=>`<option value="${v}" ${(jointPendingKind||S.timer.kind||'proof')===v?'selected':''}>${l}</option>`).join('')}</select></label></div><label for="cx-joint-checkpoint">Checkpoint context<select id="cx-joint-checkpoint">${p?`<option value="${p.cp}" ${S.integration?.autoLink!==false?'selected':''}>${p.cp} · ${p.checkpoint}</option>`:''}<option value="" ${!p||S.integration?.autoLink===false?'selected':''}>Project-level work</option></select></label><p class="cx-caption">The timer records effort. Checkpoint completion stays in Lemma.</p>`;}
function applyJointContext(){const id=val('cx-joint-project'),p=jointProjects.find(p=>p.id===id);Object.assign(S.timer,{projectId:p?.id||null,checkpointId:val('cx-joint-checkpoint')||null,kind:val('cx-joint-kind')||'proof',project:p?.name||'General study',checkpoint:p&&val('cx-joint-checkpoint')?p.cp+' · '+p.checkpoint:'Project-level work'});jointPendingProject=null;jointPendingKind=null;}

function startOptions(activity){const t={...S.timer,focus:S.settings.defaultFocus??S.timer.focus,short:S.settings.defaultShort??S.timer.short,long:S.settings.defaultLong??S.timer.long,every:S.settings.defaultEvery??S.timer.every,mode:S.settings.defaultMode??S.timer.mode};modal('Start focus session',`<div class="cx-form">${select('Activity','cx-activity',[...new Set(['Topology','Linear Algebra','Real Analysis','Algebra','Complex analysis','Reading','Card review','Break','Sleep',...(S.customActivities||[]),t.activity])],activity||t.activity)}${jointFields(activity)}${field('Intention · what will you finish?','cx-intent',t.intent,'text','maxlength="80"')}<div class="cx-form-grid">${field('If…','cx-if',t.ifText||'I reach for my phone')}${field('Then…','cx-then',t.thenText||'I notice and return')}</div>${select('Timer mode','cx-mode',['Pomodoro','Open timer','Flowtime'],t.mode==='pomo'?'Pomodoro':t.mode==='flow'?'Flowtime':'Open timer')}<div class="cx-wrap">${[25,50,90].map(n=>btn(n+'/'+(n===25?5:n===50?10:20),'pomo-preset','small',`data-id="${n}"`)).join('')}<span class="cx-caption">or customise below</span></div><div class="cx-form-grid">${field('Focus · min','cx-focus-min',t.focus,'number','min="1" max="180"')}${field('Short break · min','cx-short',t.short,'number','min="1" max="60"')}${field('Long break · min','cx-long',t.long,'number','min="1" max="90"')}${field('Long break every','cx-every',t.every,'number','min="2" max="8"')}</div>${S.settings.energy?select('Energy right now','cx-energy',['Low','Steady','High'],'Steady'):''}<p class="cx-caption">Starting a new session saves your current study time first.</p></div>`,btn('Cancel','close')+btn(t.running?'Save current & start':'Start session','session-start','primary'))}
function crSessionIdentity(t){return t.sessionId||('legacy-'+String(t.startedAt||t.stamp||t.rev||'unknown')+'-'+String(t.activity||''));}
function crCommitTimerSession(rating='Unrated',note='',topics=[]){
 const t=S.timer,now=Date.now();
 const seconds=Math.max(0,t.phase==='break'?Number(t.studyElapsed||0):elapsed());
 if(!Number.isFinite(seconds)||seconds<=0)return null;
 const id='focus:'+crSessionIdentity(t);
 const existing=S.entries.find(e=>e.id===id);
 if(existing)return existing;
 const intervals=Array.isArray(t.studyIntervals)?t.studyIntervals.map(x=>({...x})).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start):[];
 const covered=intervals.reduce((sum,x)=>sum+(x.end-x.start)/1000,0);
 const pending=Math.max(0,seconds-covered);
 let approximate=false;
 if(t.phase==='study'&&pending>0.5){
  // A paused clock does not advance during the pause. Use the end of its last
  // running segment, not the later moment at which the user opens Finish.
  const stopAt=t.running?now:Math.min(now,(Number(t.stamp)||now)+Math.max(0,(Number(t.elapsed)||0)-(Number(t.studyElapsed)||0))*1000);
  const anchor=Number(t.activeStudyStart)||Number(t.startedAt)||0;
  const supported=anchor>0&&Math.abs((stopAt-anchor)/1000-pending)<2;
  if(!supported)approximate=true;
  const since=supported?anchor:stopAt-pending*1000;
  if(since<stopAt)intervals.push({start:since,end:stopAt});
 }
 // Old timer snapshots may preserve a duration without usable segment anchors.
 if(!intervals.length){approximate=true;intervals.push({start:now-seconds*1000,end:now});}
 const startEpoch=Math.min(...intervals.map(x=>x.start));
 const start=new Date(startEpoch),finish=new Date(Math.max(...intervals.map(x=>x.end)));
 const hhmm=x=>String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0');
 const entry={id,sessionId:crSessionIdentity(t),subject:t.activity,
  title:t.intent||t.activity,date:dkey(start),start:hhmm(start),end:hhmm(finish),
  min:Math.max(1,Math.round(seconds/60)),focus:rating,note,
  startInstant:start.toISOString(),endInstant:finish.toISOString(),committedAt:new Date(now).toISOString(),
  intervals:intervals.map(x=>({start:new Date(x.start).toISOString(),end:new Date(x.end).toISOString()})),
  timeApproximate:approximate,...jointContext(t),topics};
 S.entries.push(entry);
 return entry;
}
function finish(){close();nativeWin.__carrelIntegration?.open('timer','finish')}
function stopSession(skip=false){
 const rating=val('cx-rating');
 if(!skip&&rating==='Choose a rating'){$('#cx-form-error').textContent='Choose a focus rating before saving.';return}
 if(!S.timer.running&&!S.timer.paused){close();toast('This session was already saved.');return}
 snapshot();
 const entry=crCommitTimerSession(skip?'Unrated':rating,skip?'':val('cx-recall'),$$('input[name="cx-topic-tag"]:checked').map(x=>x.value));
 const t=S.timer;t.running=false;t.paused=false;t.elapsed=0;t.studyElapsed=0;t.phase='study';t.activeStudyStart=null;
 save();close();updateHome();render();
 toast(entry?'Session saved once to this demo notebook.':'Nothing to log yet.',true);
}
function takeBreak(){if(!S.timer.running){startOptions();return}snapshot();const t=S.timer;if(t.phase==='break'){t.phase='study';t.elapsed=t.studyElapsed||0;t.activeStudyStart=Date.now();t.stamp=t.activeStudyStart;t.cycle=(t.cycle||1)+1;save();updateHome();render();toast('Back to '+t.activity);return}t.studyElapsed=elapsed();t.breakLength=(t.cycle||1)%t.every===0?t.long:t.short;if(!Array.isArray(t.studyIntervals))t.studyIntervals=[];
 const crEnd=Date.now(),crStart=t.activeStudyStart||crEnd-Math.max(0,t.studyElapsed-(t.lastStudyElapsed||0))*1000;
 if(crEnd>crStart)t.studyIntervals.push({start:crStart,end:crEnd});
 t.lastStudyElapsed=t.studyElapsed;t.activeStudyStart=null;
 t.phase='break';t.elapsed=0;t.stamp=crEnd;if(t.mode==='flow')t.short=Math.max(5,Math.min(20,Math.round(t.studyElapsed/300))),t.breakLength=t.short;save();updateHome();render();modal('Make room to return.',`<p class="cx-sub">A ${t.breakLength||t.short}-minute break. Leave the proof where you can find it.</p><div class="cx-wrap" style="margin-top:20px">${['Walk','Water','Stretch'].map(n=>btn(n,'break-choice','',`data-id="${n}"`)).join('')}</div>`,btn('Keep resting','close')+btn('Back to study','break','primary'))}
function entryEditor(id){const e=S.entries.find(x=>x.id===id)||{id:'',subject:S.timer.activity,title:'',date:dkey(new Date()),start:'09:00',end:'10:00',focus:'Deep',note:''};modal(e.id?'Edit the record.':'Add time you gave.',`<div class="cx-form" data-entry-id="${e.id}">${field('Session title','cx-entry-title',e.title)}${select('Activity','cx-entry-subject',crSubjects(e.subject),e.subject)}${field('Date','cx-entry-date',e.date,'date')}<div class="cx-form-grid">${field('Start','cx-entry-start',e.start,'time')}${field('End','cx-entry-end',e.end,'time')}</div>${select('Focus','cx-entry-focus',['Unrated','Scattered','Okay','Deep'],e.focus)}${areas('Note','cx-entry-note',e.note)}<p class="cx-caption">For overnight sessions, an earlier end time means the following day. Editing the time of a logged focus session replaces its detailed focus/break intervals; changing its title, subject or note preserves them.</p><p id="cx-form-error" role="alert" class="cx-sub"></p></div>`,(e.id?btn('Split','split-entry','',`data-id="${e.id}"`)+btn('Delete entry','entry-delete','destructive',`data-id="${e.id}"`):'')+btn('Save entry','entry-save','primary'))}
function blockEditor(id,preset={}){
 const b=S.blocks.find(x=>x.id===id)||{id:'',title:'',subject:S.timer.activity,date:dkey(date),at:'20:00',min:50,...preset};
 if(b.actual||b.futureLog){const entry=S.entries.find(e=>e.id===b.entryId)||S.entries.find(e=>e.title===b.title&&e.date===b.date);if(entry)entryEditor(entry.id);else toast('This sample logged block has no editable source entry.');return}
 const length=Number(b.min)||50;
 const titleField=field('What will you work on?','cx-block-title',b.title,'text','maxlength="120" placeholder="e.g. Quotient topology proof" autocomplete="off"');
 const subjectField=select('Activity','cx-block-subject',crSubjects(b.subject),b.subject);
 const sched=`<div class="cx-block-schedule"><div class="cx-form-grid">${field('Date','cx-block-date',b.date,'date')}${field('Starts at','cx-block-at',b.at,'time')}</div><div class="cx-block-duration"><label for="cx-block-min"><span class="cx-duration-label">Duration <span class="cx-small-unit">· minutes</span></span><input id="cx-block-min" type="number" value="${length}" min="5" max="720" step="5" inputmode="numeric"></label><div class="cx-duration-presets" role="group" aria-label="Quick duration">${[25,50,90].map(n=>`<button type="button" data-cx="block-duration" data-id="${n}" aria-label="Set duration to ${n} minutes" class="${length===n?'is-selected':''}">${n}m</button>`).join('')}</div></div></div>`;
 const options=`<details class="cx-block-more" ${b.id&&(b.busy||b.pomo&&b.pomo!=='Default'||b.pin||b.repeat)?'open':''}><summary><span>More options</span><span class="cx-more-info">Pomodoro · repeat · fixed time</span>${icon('down')}</summary><div class="cx-block-extra">${select('Block type','cx-block-kind',['Study block','Busy commitment'],b.busy?'Busy commitment':'Study block')}${select('Pomodoro override','cx-block-pomo',['Default','Off','25/5','50/10','90/20'],b.pomo||'Default')}<label class="cx-toggle-line"><input type="checkbox" id="cx-pin" ${b.pin?'checked':''}>Fixed start time</label><label class="cx-toggle-line"><input type="checkbox" id="cx-repeat" ${b.repeat?'checked':''}>Repeat weekly for 4 weeks</label></div></details>`;
 modal(b.id?'Make this block fit.':'Make space for the work.',`<div class="cx-form cx-block-form" data-block-id="${b.id}"><input id="cx-block-task" type="hidden" value="${b.task||''}"><input id="cx-block-project" type="hidden" value="${b.projectId||''}"><input id="cx-block-checkpoint" type="hidden" value="${b.checkpointId||''}"><p class="cx-block-hint">Give the work a place in your day. You can drag it in the calendar later.</p>${titleField}${subjectField}${sched}${options}<p id="cx-form-error" role="alert" class="cx-sub cx-form-error"></p></div>`,(b.id?btn('Delete','block-delete','destructive',`data-id="${b.id}"`):'')+btn(b.id?'Save changes':'Add to calendar','block-save','primary'));
}
function crPlanningAlternatives(){const conflicts=crDayWorkload(dkey(date)).conflicts.length;return '<div class="lemma-planning-alternatives"><h3>Make another plan</h3><div class="cx-wrap">'+btn('Try next day','plan-next-day')+(conflicts?btn('Review '+conflicts+' overlaps','calendar-conflicts'):'')+btn('Adjust daily intention','plan-review-intention')+'</div><p class="cx-caption">Estimates and existing blocks stay as entered.</p></div>'}
function autoPlan(){
  const preview=crPlanningPreview();
  modal('Preview study plan',`<div class="cx-form"><p>${date.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})}</p>
    <h3>${preview.placed.length} tasks fit · ${duration(preview.used)}</h3><p class="cx-sub">${preview.left} ${preview.left===1?'task stays':'tasks stay'} in the backlog. Existing blocks and ${S.settings.gap} min breaks are preserved.</p>
    ${preview.placed.length?`<details><summary>Review ${preview.placed.length} proposed blocks</summary>${preview.placed.map(b=>`<div class="lemma-plan-row"><strong>${esc(b.title)}</strong><span>${crClockLabel(b.at)} · ${duration(b.min)}</span></div>`).join('')}</details>`:'<p class="cx-sub">There is no room within your daily intention and free time.</p>'+crPlanningAlternatives()}
    <p class="cx-caption">Your estimates are used as entered. Tasks are never silently shortened.</p></div>`,btn('Keep editing','close')+btn('Add '+preview.placed.length+' blocks','autoplan-save','primary',preview.placed.length?'':'disabled'));
}
// W01/W13: Calendar-only civil-date helpers. Date fields remain local dates, not UTC-midnight instants.
function crAddCalendarDays(base,n){return new Date(base.getFullYear(),base.getMonth(),base.getDate()+n,12)}
function crCivilDistance(endKey,startKey){
 const parse=key=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN};
 return Math.round((parse(endKey)-parse(startKey))/86400000);
}
function crNextAvailableStudyDate(now=new Date()){
 // A generated 18:00 block must never be inserted earlier than the time of acceptance.
 return crAddCalendarDays(now,(now.getHours()>18||now.getHours()===18&&now.getMinutes()>0)?1:0);
}
function crClockLabel(text){
 const m=/^([01]\d|2[0-3]):([0-5]\d)(.*)$/.exec(String(text));
 if(!m||S.settings.clock!=='12h')return String(text);
 const h=+m[1];return String(h%12||12)+':'+m[2]+' '+(h<12?'AM':'PM')+m[3];
}
function parseCapture(text){const s=text.toLowerCase();const subject=s.includes('algebra')?'Algebra':s.includes('complex')||s.includes('residue')?'Complex analysis':s.includes('topology')?'Topology':S.timer.activity;const hm=s.match(/(\d+)h\s*(\d+)?m?/),mm=s.match(/(\d+)\s*m(?:in)?\b/);const min=hm?+hm[1]*60+(+hm[2]||0):mm?+mm[1]:30;const time=s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);const d=s.includes('tmr')||s.includes('tomorrow')?dkey(crAddCalendarDays(new Date(),1)):dkey(new Date());return{subject,min:Math.max(5,Math.min(720,min)),date:d,time:time?time[0]:'20:00',priority:s.includes('!')?1:2,title:text.trim(),kind:/exam|test|quiz/.test(s)?'Exam':'Due'}}
function capture(text=''){modal('Quick capture',`<div class="cx-form">${areas('Quick capture','cx-capture',text,'placeholder="topology problems tmr 20:00 50m !" maxlength="280"')}<div class="cx-seg cx-capture-type" aria-label="Capture type">${['Task','Deadline','Block','Ask Claude'].map(t=>`<button data-cx="capture-type" data-id="${t}" aria-pressed="${captureType===t}">${t}</button>`).join('')}</div><div id="cx-parse" class="cx-wrap"></div><p class="cx-caption">Demo parser recognises subjects, h/m durations, today/tomorrow, 24-hour time and ! priority. Structured editors support exact dates and the full details.</p><p id="cx-form-error" role="alert" class="cx-sub"></p></div>`,btn('Cancel','close')+btn('Capture','capture-save','primary'));capturePreview()}
function capturePreview(){const p=parseCapture(val('cx-capture'));const target=$('#cx-parse');if(target)target.innerHTML=[p.subject,duration(p.min),p.date,p.time,p.priority===1?'High priority':captureType].map(t=>`<span class="cx-tag">${esc(t)}</span>`).join('')}
function taskEditor(id){
  const t=S.tasks.find(x=>x.id===id)||{id:'',title:'',subject:S.timer.activity,min:30,priority:2,due:''};
  modal(t.id?'Edit task':'New task',`<div class="cx-form" data-task-id="${esc(t.id)}">
    ${field('Task','cx-task-title',t.title,'text','maxlength="180" placeholder="e.g. Prove the quotient-map criterion" autocomplete="off" enterkeyhint="next"')}
    ${select('Subject','cx-task-subject',crSubjects(t.subject),t.subject)}${crProjectOptions(t.projectId||'')}
    ${field('Checkpoint · optional','cx-task-checkpoint',t.checkpointId||'','text','placeholder="e.g. CP4" maxlength="20"')}
    ${field('Estimate · minutes','cx-task-min',t.min,'number','min="5" max="720" inputmode="numeric"')}
    <div class="cx-wrap" role="group" aria-label="Task duration presets">${[25,50,90].map(n=>btn(n+' min','task-duration','',`data-id="${n}"`)).join('')}</div>
    ${field('Due date · optional','cx-task-due',t.due||'','date')}${select('Priority','cx-task-priority',['Normal','High'],t.priority===1?'High':'Normal')}
    <p id="cx-form-error" role="alert" class="cx-form-error"></p></div>`,
    (t.id?btn('Remove task','task-delete','destructive',`data-id="${esc(t.id)}"`):'')+btn('Save task','task-save','primary'));
}
function ritual(){
  const selected=new Set(S.ritualPicks||[]),suggestions=crSuggestedTasks(5);
  modal('Plan my day',`<div class="cx-form"><p class="cx-caption">Step ${ritualStep} of 3</p>${ritualStep===1?`<h3>Choose a few useful tasks.</h3><p class="cx-sub">Suggested from deadlines, priority and available time. Nothing is selected for you.</p>${suggestions.map(t=>`<label class="lemma-pick-row"><input type="checkbox" data-cx="ritual-select" name="cx-ritual-pick" value="${esc(t.id)}" data-id="${esc(t.id)}" ${selected.has(t.id)?'checked':''}><span>${esc(t.title)}<small>${duration(t.min)} · ${esc(t.subject)}</small></span></label>`).join('')||'<p>No suggestions fit today.</p>'+crPlanningAlternatives()}${btn('Add from backlog…','ritual-backlog')}<p>${selected.size} tasks selected</p>`:ritualStep===2?`<h3>Leave room between tasks.</h3><p class="cx-sub">${selected.size} tasks chosen · ${S.settings.gap} min between blocks. The preview will keep any tasks that do not fit in the backlog.</p>`:`<h3>Set one intention.</h3>${field('Today I want to…','cx-ritual-intent',S.intention||'Finish one proof with care.')}<div class="cx-form-grid">${field('If I get stuck…','cx-ritual-if','I write down the exact obstacle')}${field('Then I will…','cx-ritual-then','Try a smaller example')}</div>`}</div>`,(ritualStep>1?btn('Back','ritual-back'):'')+btn(ritualStep===3?'Save intention & preview':'Continue','ritual-next','primary'));
}
function shutdown(){
  const open=S.tasks.filter(t=>!t.done),selected=new Set(S.carryIds||[]),effort=nativeWin.__lemmaEffortMetrics.forDay(S.entries,S.timer,dkey(new Date()));
  modal('Close my day',`<div class="cx-form"><h3>${duration(Math.round(effort.committedMinutes))} logged today</h3><p class="cx-sub">${duration(S.settings.daily||240)} daily intention. ${effort.needsReview?'Some time records overlap or need correction; check your study log.':''}</p><h3>Parked thoughts</h3>${S.parked.filter(park=>!park.done).slice(0,5).map(park=>`<div class="lemma-park-row"><p>${esc(park.text)}</p><div class="cx-wrap">${btn('Make task','park-resolve-task','',`data-id="${esc(park.id)}"`)}${btn('Dismiss','park-resolve-dismiss','',`data-id="${esc(park.id)}"`)}</div></div>`).join('')||'<p>No unresolved thoughts.</p>'}<p class="cx-caption">${S.parked.filter(park=>!park.done).length} unresolved. More remain available in Attention.</p><h3>Choose what to carry to tomorrow.</h3>
    ${btn('Carry all '+open.length+' open tasks','carry-all')}${open.slice(0,20).map(t=>`<label class="lemma-pick-row"><input type="checkbox" name="cx-carry" data-cx="carry-select" data-id="${esc(t.id)}" value="${esc(t.id)}" ${selected.has(t.id)?'checked':''} aria-label="Carry ${esc(t.title)} to tomorrow"><span>${esc(t.title)}</span></label>`).join('')}
    <p>${selected.size} selected. Unselected tasks stay in the backlog.${open.length>20?' Showing the first 20; choose other tasks in Backlog.':''}</p>${field('Tomorrow’s first step','cx-tomorrow-first',S.tomorrowFirst||'Re-read the last proof.')}<label class="lemma-pick-row"><input type="checkbox" id="cx-shutdown-stop"><span>Review and finish the active focus session</span></label></div>`,btn('Save & close day','shutdown-save','primary'));
}
function noticed(){snapshot();S.notices++;save();updateHome();render();if(!S.settings.urge){drift();return}urgeEnd=Date.now()+60000;modal('Wait it out.',`<p class="cx-sub" style="text-align:center">You noticed. There is nothing to fix yet.</p><div class="cx-urge" aria-label="60-second urge-surf timer"><span id="cx-urge-time">60</span></div><p class="cx-sub" style="text-align:center">Back to: ${esc(S.timer.intent)}</p>`,btn('Log drift','drift')+btn('Back to work','close','primary'))}
function drift(){urgeEnd=0;modal('Give the minutes their name.',`<div class="cx-form"><p class="cx-sub">Drift is recorded separately in this sample notebook.</p><div class="cx-wrap">${[1,5,15].map(n=>btn(n+'m','drift-preset','',`data-id="${n}"`)).join('')}</div>${field('Minutes drifted','cx-drift-min',5,'number','min="1" max="240"')}${field('What pulled you away? · optional','cx-drift-note','','text','maxlength="140"')}</div>`,btn('Log drift','drift-save','primary'))}
function daySettings(){
  parent.postMessage({kind:'carrel:lemma',hash:'#/settings?section=study'},'*');close();
}
function exportData(type){const data=type==='json'?JSON.stringify(S,null,2):['Date,Activity,Title,Start,End,Minutes,Focus,Note',...S.entries.map(e=>[e.date,e.subject,e.title,e.start,e.end,e.min,e.focus,e.note].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:type==='json'?'application/json':'text/csv'}));a.download='Lemma_Carrel_Demo.'+type;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Downloaded '+type.toUpperCase()+' sample data.')}
function runAutoPlan(){
  const preview=crPlanningPreview();if(!preview.placed.length){toast('No tasks fit this day.');return}
  snapshot();const ids=[];for(const item of preview.placed){const id='block:'+crypto.randomUUID();S.blocks.push({...item,id});ids.push(id)}
  S.ritualSchedule=false;save();close();planTab='calendar';view='agenda';render();crRevealItem(ids[0],'block');toast(`${ids.length} blocks added. ${preview.left} tasks remain in the backlog.`,true);
}
function focus(){focusReturn=document.activeElement;$('#cx-focus').innerHTML=`<button class="cx-icon cx-focus-exit" data-cx="focus-exit" aria-label="Leave focus mode">${icon('close')}</button><div class="cx-focus-inner"><p class="cx-eyebrow">${esc(S.timer.activity)} · ${esc(S.timer.checkpoint)}</p><p class="cx-focus-context">${esc(S.timer.intent)}</p><div class="cx-clock cx-num" data-cx-clock>${displayClock()}</div><p class="cx-sub">One step in the proof. Then the next.</p><div class="cx-wrap" style="justify-content:center;margin-top:40px">${btn(icon('break')+' Break','break')}${btn(icon('urge')+' Noticed','noticed')}${btn('Finish session','finish')}</div><p class="cx-caption" style="margin-top:32px">Esc to return to your desk</p></div>`;$('#cx-focus').setAttribute('role','dialog');$('#cx-focus').setAttribute('aria-modal','true');$('#cx-focus').setAttribute('aria-label','Focus mode');$('#cx-focus button').focus();document.querySelectorAll('#root,#cx-app,#cx-nav,#cx-dock').forEach(el=>el.inert=true)}
function exitFocus(){const el=$('#cx-focus');el.replaceChildren();el.removeAttribute('role');el.removeAttribute('aria-modal');document.querySelectorAll('#root,#cx-app,#cx-nav,#cx-dock').forEach(el=>el.inert=false);focusReturn?.focus()}
function crFormErrors(items){
  $$('#cx-modal [aria-invalid]').forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby')});
  $$('#cx-modal .cx-form-error,#cx-modal .lemma-field-error').forEach(error=>error.textContent='');
  const errors=items.filter(item=>item.message);for(const error of errors){const input=$('#'+error.id),message=$('#'+error.id+'-error')||$('#cx-form-error');if(input){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',message?.id||'cx-form-error')}if(message)message.textContent=error.message}
  if(errors.length)$('#'+errors[0].id)?.focus();return errors.length>0;
}

function crSubjects(current=''){
  return [...new Set([...nativeWin.__lemmaNotebook.subjects(),current,'Independent study','Card review'])].filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function crNormalizeClock(value){
  const digits=String(value||'').trim();return /^\d{4}$/.test(digits)?digits.slice(0,2)+':'+digits.slice(2):digits;
}
function crBackwardPlan(deadline){
  const start=crNextAvailableStudyDate(),days=Math.max(0,Math.min(60,crCivilDistance(deadline.date,dkey(start)))),blocks=[];
  let remaining=Math.max(0,Number(deadline.hours)||0)*60;
  for(let index=0;index<days&&remaining>=5;index++){
    const key=dkey(crAddCalendarDays(start,index));if(S.blocks.some(b=>b.deadlineId===deadline.id&&b.date===key))continue;
    for(const size of [...new Set([Math.min(180,remaining),120,90,60,30,15])].filter(n=>n<=remaining&&n>=5)){
      const slot=crFreeSlots({min:size},key,1,blocks)[0];if(slot){blocks.push(slot);remaining-=slot.min;break}
    }
  }
  return{blocks,placed:Math.max(0,Number(deadline.hours)||0)*60-remaining,remaining};
}
function crProjectOptions(id=''){
  return `<label for="cx-task-project">Learning path · optional<select id="cx-task-project"><option value="">Independent task</option>${nativeWin.__lemmaNotebook.getProjects().filter(p=>!p.system&&p.status!=='archived').map(p=>`<option value="${esc(p.id||p.slug)}" ${(p.id===id||p.slug===id)?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label>`;
}
function crRevealItem(id,kind='task'){
  requestAnimationFrame(()=>{const element=document.querySelector(`[data-${kind}-row="${id}"]`)||document.querySelector(`[data-cx="block-details"][data-id="${id}"]`);
    if(element){element.dataset.justAdded='true';element.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});element.setAttribute('tabindex','-1');element.focus({preventScroll:true});setTimeout(()=>{delete element.dataset.justAdded},2200)}
  });
}
function crFreeSlots(task,day=dkey(date),count=3,extra=[]){
  const length=Math.ceil(Math.max(5,Number(task.min)||30)/5)*5,gap=Number(S.settings.gap)||0,result=[];
  const now=new Date(),today=dkey(now),start=crClockMin(S.settings.planStart||'09:00'),end=crClockMin(S.settings.planEnd||'23:00');
  const blocks=[...blocksForDay(day,true),...extra.filter(b=>b.date===day)];
  let cursor=Math.max(start,day===today?Math.ceil((now.getHours()*60+now.getMinutes())/5)*5:0);
  while(cursor+length<=end&&result.length<count){
    const overlap=blocks.find(b=>cursor<crClockMin(b.at)+b.min+gap&&cursor+length+gap>crClockMin(b.at));
    if(overlap){cursor=Math.ceil((crClockMin(overlap.at)+overlap.min+gap)/5)*5;continue}
    const slot={date:day,at:crTime(cursor),min:length};result.push(slot);cursor+=length+gap;
  }
  return result;
}
function crSuggestedTasks(limit=5){
  return S.tasks.filter(t=>!t.done&&!S.blocks.some(b=>b.task===t.id&&b.date===dkey(date)))
    .sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999'))||(a.priority||2)-(b.priority||2)||a.min-b.min)
    .filter(t=>crFreeSlots(t).length).slice(0,limit);
}
function crPlanningPreview(){
  const selected=S.ritualSchedule?new Set(S.ritualPicks||[]):null;
  const tasks=S.tasks.filter(t=>!t.done&&(!selected||selected.has(t.id))&&!S.blocks.some(b=>b.task===t.id&&b.date===dkey(date)))
    .sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999'))||(a.priority||2)-(b.priority||2)||a.min-b.min);
  const logged=nativeWin.__lemmaEffortMetrics.forDay(S.entries,S.timer,dkey(date)).committedMinutes;
  const budget=Math.max(0,Number(S.settings.daily||240)-(dkey(date)===dkey(new Date())?logged:0)),placed=[];
  let used=0;
  for(const task of tasks){
    if(placed.length>=20||used+Number(task.min)>budget)continue;
    const slot=crFreeSlots(task,dkey(date),1,placed)[0];if(!slot)continue;
    placed.push({...slot,title:task.title,subject:task.subject,task:task.id,projectId:task.projectId||null,checkpointId:task.checkpointId||null});used+=slot.min;
  }
  return {tasks,placed,used,left:tasks.length-placed.length,budget,revision:S.notebookRevision};
}
function scheduleTask(id){
  const task=S.tasks.find(t=>t.id===id);if(!task)return;
  const slots=[];for(let i=0;i<7&&slots.length<3;i++){const key=dkey(crAddCalendarDays(new Date(),i));if(task.due&&key>task.due)break;slots.push(...crFreeSlots(task,key,3-slots.length))}
  modal('Schedule task',`<div class="cx-form"><h3>${esc(task.title)}</h3><p>${duration(task.min)} · ${esc(task.subject)}</p>
    ${slots.length?`<p class="cx-sub">Available times that fit your estimate and planned breaks.</p>${slots.map(slot=>btn(`${new Date(slot.date+'T12:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})} · ${crClockLabel(slot.at)} · ${duration(slot.min)}`,'schedule-slot','lemma-slot',`data-id="${esc(id)}" data-date="${slot.date}" data-at="${slot.at}"`)).join('')}`:'<p class="cx-sub">No free time fits in the next seven days. Choose another date or adjust your plan.</p>'}</div>`,btn('Choose another time','schedule-custom','',`data-id="${esc(id)}"`));
}
function ritualTaskPicker(){
  const selected=new Set(S.ritualPicks||[]),rows=plannerRows('tasks',S.tasks.filter(t=>!t.done));
  modal('Choose tasks from backlog',`<div class="cx-form">${plannerSearch('tasks',rows.length).replaceAll('cx-search-tasks','cx-picker-search-tasks')}${rows.slice(0,plannerListState.tasks.limit).map(t=>`<label class="lemma-pick-row"><input type="checkbox" name="cx-ritual-pick" data-cx="ritual-select" data-id="${esc(t.id)}" value="${esc(t.id)}" ${selected.has(t.id)?'checked':''}><span>${esc(t.title)}<small>${duration(t.min)} · ${esc(t.subject)}</small></span></label>`).join('')}${plannerMore('tasks',rows.length)}</div>`,btn('Back to day plan','ritual-return','primary'));
}
function blockDetails(id){
 const recorded=S.blocks.find(block=>block.id===id);if(recorded?.futureLog){entryEditor(recorded.entryId);return}
  const b=S.blocks.find(item=>item.id===id);if(!b)return;
  modal(b.title,`<div class="cx-form"><p class="lemma-block-status">${b.actual?'✓ Logged':b.busy?'◷ Busy':'▱ Planned'} · ${esc(b.subject)}</p><p>${new Date(b.date+'T12:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})} · ${crClockLabel(b.at)}–${crClockLabel(endLabel(b))} · ${duration(b.min)}</p>${b.checkpointId?`<p>${esc(b.checkpointId)}</p>`:''}</div>`,
    (!b.actual&&!b.busy?btn('Start focus','block-start','primary',`data-id="${esc(id)}"`):'')+btn(b.actual?'Edit log entry':'Edit','edit-block','',`data-id="${esc(id)}"`)+(!b.actual?btn('Move','block-move','',`data-id="${esc(id)}"`)+btn('Delete','block-delete','destructive',`data-id="${esc(id)}"`):''));
}
function crConflicts(limit=12){
  const info=crDayWorkload(dkey(date));
  modal('Resolve overlapping blocks',`<div class="cx-form"><p>${info.affected} blocks overlap. Choose a block to move or shorten, or keep both.</p>${info.conflicts.slice(0,limit).map(c=>`<article class="lemma-conflict-pair"><strong>${esc(c.a.title)}</strong><span>${crClockLabel(c.a.at)} · ${duration(c.a.min)}</span><strong>${esc(c.b.title)}</strong><span>${crClockLabel(c.b.at)} · ${duration(c.b.min)}</span><div class="cx-wrap">${btn('Move','block-move','',`data-id="${esc(c.b.actual?c.a.id:c.b.id)}"`)}${btn('Shorten','block-resize','',`data-id="${esc(c.b.actual?c.a.id:c.b.id)}"`)}${btn('Keep both','conflict-keep','',`data-first="${esc(c.a.id)}" data-second="${esc(c.b.id)}"`)}</div></article>`).join('')}${info.conflicts.length>limit?btn('Load 12 more pairs','conflicts-more','',`data-id="${limit+12}"`):''}</div>`,btn('Done','close'));
}
function action(a,el){if(a==='shared-focus'){nativeWin.dispatchEvent(new Event('lemma:focus-open'));return;}const id=el?.dataset.id;
switch(a){
case'plan-next-day':date=crAddCalendarDays(date,1);render();autoPlan();break;
case'plan-review-intention':close();nativeWin.location.hash='#/settings?section=study';break;
case'park-resolve-task':{if(nativeWin.__lemmaNotebook.resolvePark(id,'task')){S=nativeWin.__lemmaNotebook.getState();shutdown();toast('Thought moved to backlog.')}break}
case'park-resolve-dismiss':{if(nativeWin.__lemmaNotebook.resolvePark(id,'discard')){S=nativeWin.__lemmaNotebook.getState();shutdown();toast('Thought dismissed.')}break}
case'task-duration':$('#cx-task-min').value=id;break;
case'schedule-custom':{
  const task=S.tasks.find(t=>t.id===id);if(!task)break;blockEditor(null,{title:task.title,subject:task.subject,min:task.min,projectId:task.projectId,checkpointId:task.checkpointId,task:task.id});break;
}
case'schedule-slot':{
  const task=S.tasks.find(t=>t.id===id);if(!task)break;
  const day=el.dataset.date,at=el.dataset.at;if(!crFreeSlots(task,day,100).some(slot=>slot.at===at)){toast('That time is no longer free. Choose another slot.');scheduleTask(id);break}
  snapshot();const block={id:'block:'+crypto.randomUUID(),title:task.title,subject:task.subject,date:day,at,min:task.min,task:id,projectId:task.projectId,checkpointId:task.checkpointId};S.blocks.push(block);
  date=new Date(day+'T12:00');view='agenda';planTab='calendar';save();close();render();crRevealItem(block.id,'block');toast('Task scheduled for '+crClockLabel(at)+'.',true);break;
}
case'block-details':blockDetails(id);break;
case'event-stack':{const ids=id.split('|'),blocks=S.blocks.filter(b=>ids.includes(b.id));modal('Overlapping blocks',blocks.map(b=>btn(crClockLabel(b.at)+' · '+esc(b.title)+' · '+duration(b.min),'block-details','lemma-slot',`data-id="${esc(b.id)}"`)).join(''),btn('Review conflicts','calendar-conflicts'));break;}
case'block-start':close();nativeWin.__carrelIntegration?.open('timer','start-block',{blockId:id});break;
case'conflicts-more':crConflicts(Number(id)||24);break;
case'conflict-keep':{
  const pair=[el.dataset.first,el.dataset.second].sort().join('|');snapshot();S.allowedOverlaps=[...new Set([...(S.allowedOverlaps||[]),pair])];save();crConflicts();toast('These two blocks will be kept.',true);break;
}
case'ritual-select':{
  const chosen=new Set(S.ritualPicks||[]);el.checked?chosen.add(id):chosen.delete(id);S.ritualPicks=[...chosen];break;
}
case'ritual-backlog':ritualTaskPicker();break;
case'ritual-return':ritual();break;
case'carry-select':{const chosen=new Set(S.carryIds||[]);el.checked?chosen.add(id):chosen.delete(id);S.carryIds=[...chosen];break}
case'carry-all':S.carryIds=S.tasks.filter(t=>!t.done).map(t=>t.id);shutdown();break;
case'entry-delete':snapshot();S.entries=S.entries.filter(entry=>entry.id!==id);save();close();render();toast('Study-log entry removed.',true);break;
case'close':close();break;
case'planner-more':{
  if(plannerListState[id])plannerListState[id].limit+=20;
  if($('#cx-modal')?.open&&$('#cx-modal-title')?.textContent==='Choose tasks from backlog')ritualTaskPicker();else render();break;
}
case'undo':{
 if(!undoStack.length)break;const current=nativeWin.__lemmaNotebook.getState();
 for(const delta of [...undoStack].reverse()){
  for(const [key,changes]of Object.entries(delta.collections))for(const change of changes){const index=current[key].findIndex(row=>row.id===change.id),value=index<0?null:current[key][index];if(JSON.stringify(value)!==JSON.stringify(change.after))continue;if(change.before){if(index<0)current[key].unshift(change.before);else current[key][index]=change.before}else if(index>=0)current[key].splice(index,1)}
  for(const [key,change]of Object.entries(delta.fields))if(JSON.stringify(current[key])===JSON.stringify(change.after))current[key]=change.before;
 }
 undoStack.length=0;pendingUndo=null;S=current;save();close();render();toast('Calendar changes undone.');break;
}
case'planner-tools':crPlannerTools();break;
case'spatial-tools':crPlannerTools();break;case'spatial-tool':close();planTab=id;render();break;
case'capture':capture();break;
case'capture-type':captureType=id;$$('[data-cx="capture-type"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));capturePreview();break;
case'capture-save':{const text=val('cx-capture').trim();if(!text){$('#cx-form-error').textContent='Write something to capture.';return}snapshot();const p=parseCapture(text),nid='c'+Date.now();if(captureType==='Task')S.tasks.push({id:nid,title:p.title,subject:p.subject,min:p.min,priority:p.priority,done:false,due:p.date});else if(captureType==='Deadline')S.deadlines.push({id:nid,title:p.title,subject:p.subject,date:p.date,kind:p.kind,hours:Math.max(1,p.min/60)});else if(captureType==='Block')S.blocks.push({id:nid,title:p.title,subject:p.subject,date:p.date,at:p.time,min:p.min});else{S.coachAsk=text;toast('Question saved for your next chat.')}save();close();render();updateHome();toast(captureType+' added to sample data.',true);break}
case'start-options':startOptions();break;
case'pomo-preset':$('#cx-focus-min').value=id;$('#cx-short').value=+id===25?5:+id===50?10:20;break;
case'session-start':{const f=+val('cx-focus-min'),short=+val('cx-short'),long=+val('cx-long'),every=+val('cx-every');if(!(f>=1&&f<=180&&short>=1&&short<=60&&long>=1&&long<=90&&every>=2&&every<=8)){toast('Check the timer lengths and cycle count.');return}snapshot();if((S.timer.running||S.timer.paused))crCommitTimerSession('Unrated','Saved on starting another session',[]);const mode=val('cx-mode');Object.assign(S.timer,{activity:val('cx-activity'),intent:val('cx-intent'),ifText:val('cx-if'),thenText:val('cx-then'),mode:mode==='Pomodoro'?'pomo':mode==='Flowtime'?'flow':'open',focus:f,short,long,every,cycle:1,running:true,paused:false,phase:'study',elapsed:0,stamp:Date.now(),studyElapsed:0,sessionId:crypto.randomUUID(),startedAt:Date.now(),activeStudyStart:Date.now(),studyIntervals:[],lastStudyElapsed:0});applyJointContext();save();close();updateHome();render();toast('Session started.');break}
case'finish':finish();break;
case'session-save':stopSession(false);break;
case'session-skip':stopSession(true);break;
case'break':if($('#cx-modal').open)close();takeBreak();break;
case'break-choice':S.timer.breakNote=id;save();close();toast('Break: '+id.toLowerCase()+'.');break;
case'focus':focus();break;
case'focus-exit':exitFocus();break;
case'subject-start':startOptions(id);break;
case'start-review-block':startOptions('Topology');$('#cx-intent').value='Recall deformation retracts from memory';$('#cx-focus-min').value=25;break;
case'ribbon':frameLocation.hash='#/carrel/plan';view='day';date=new Date();render();break;
case'plan-tab':planTab=id;render();break;
case'calendar-view-select':view=el.value;fullWeek=false;render();break;case'cal-view':view=id;fullWeek=false;render();break;
case'week-select':date=new Date(id+'T12:00');render();break;
case'full-week':fullWeek=!fullWeek;render();break;
case'calendar-conflicts':crConflicts();break;
case'date-prev':case'date-next':{const n=a==='date-prev'?-1:1;if(view==='month')date.setMonth(date.getMonth()+n);else date=new Date(date.getFullYear(),date.getMonth(),date.getDate()+n*(view==='week'?7:1));render();break}
case'date-today':date=new Date();render();break;
case'today-agenda':date=new Date();view='agenda';fullWeek=false;render();break;
case'month-day':date=new Date(id+'T12:00');view='day';render();break;
case'agenda-gap':blockEditor();$('#cx-block-date').value=dkey(date);$('#cx-block-at').value=el.dataset.at;$('#cx-block-min').value=el.dataset.min;break;
case'block-duration':{const n=Number(id);const f=$('#cx-block-min');if(f&&[25,50,90].includes(n)){f.value=n;document.querySelectorAll('#cx-modal [data-cx="block-duration"]').forEach(x=>x.classList.toggle('is-selected',Number(x.dataset.id)===n));}break;} case'new-block':blockEditor();$('#cx-block-date').value=dkey(date);break;
case'edit-block':blockEditor(id);break;
case'block-move':blockEditor(id);$('#cx-block-at').focus();break;
case'block-resize':blockEditor(id);$('#cx-block-min').focus();break;
case'block-save':{
  const form=$('[data-block-id]'),bid=form.dataset.blockId,title=val('cx-block-title').trim(),min=Number(val('cx-block-min')),day=val('cx-block-date'),at=crNormalizeClock(val('cx-block-at'));
  if(crFormErrors([{id:'cx-block-title',message:!title?'Enter a title for this block.':''},{id:'cx-block-date',message:!crLocalDay(day)?'Choose a valid date.':''},{id:'cx-block-at',message:!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)?'Use a start time such as 20:00.':''},{id:'cx-block-min',message:!Number.isFinite(min)||min<5||min>720?'Enter a duration from 5 to 720 minutes.':''}]))return;
  snapshot();const previous=S.blocks.find(b=>b.id===bid),block={...previous,id:bid||'block:'+crypto.randomUUID(),title,subject:val('cx-block-subject'),date:day,at,min,
    pin:checked('cx-pin'),repeat:checked('cx-repeat'),busy:val('cx-block-kind')==='Busy commitment',pomo:val('cx-block-pomo'),projectId:val('cx-block-project')||null,checkpointId:val('cx-block-checkpoint')||null,task:val('cx-block-task')||previous?.task||null};
  S.blocks=bid?S.blocks.map(b=>b.id===bid?block:b):[...S.blocks,block];
  if(block.repeat)for(let i=1;i<=3;i++)S.blocks.push({...block,id:block.id+'-r'+i,date:dkey(crAddCalendarDays(new Date(day+'T12:00'),7*i)),repeat:false});
  date=new Date(day+'T12:00');view='agenda';planTab='calendar';save();close();render();crRevealItem(block.id,'block');toast(bid?'Calendar block updated.':'Calendar block added.',true);break;
}
case'block-delete':{
  const block=S.blocks.find(b=>b.id===id);if(block?.actual){toast('Remove this saved time from the study log.');break}
  snapshot();S.blocks=S.blocks.filter(b=>b.id!==id);save();close();render();toast('Calendar block removed.',true);break;
}
case'autoplan':autoPlan();break;
case'autoplan-save':runAutoPlan();break;
case'task-check':snapshot();S.tasks=S.tasks.map(t=>t.id===id?{...t,done:el.checked}:t);save();render();toast(el.checked?'Task complete.':'Task reopened.',true);break;
case'new-task':taskEditor();break;
case'edit-task':taskEditor(id);break;
case'task-save':{
  const tid=$('[data-task-id]').dataset.taskId,title=val('cx-task-title').trim(),min=Number(val('cx-task-min')),checkpoint=val('cx-task-checkpoint').trim();
  if(crFormErrors([{id:'cx-task-title',message:!title?'Enter a short task title.':''},{id:'cx-task-min',message:!Number.isFinite(min)||min<5||min>720?'Enter an estimate from 5 to 720 minutes.':''},{id:'cx-task-checkpoint',message:checkpoint&&!/^CP\d+$/i.test(checkpoint)?'Use a checkpoint code such as CP4, or leave this blank.':''}]))return;
  snapshot();const old=S.tasks.find(t=>t.id===tid),item={...old,id:tid||'task:'+crypto.randomUUID(),title,subject:val('cx-task-subject'),min,
    due:val('cx-task-due'),priority:val('cx-task-priority')==='High'?1:2,done:old?.done||false,projectId:val('cx-task-project')||null,checkpointId:checkpoint||null,createdAt:Date.now()};
  S.tasks=tid?S.tasks.map(t=>t.id===tid?item:t):[item,...S.tasks];
  plannerListState.tasks.query='';plannerListState.tasks.limit=20;planTab='backlog';save();close();render();crRevealItem(item.id);toast(tid?'Task updated.':'Task added to the top of your backlog.',true);break;
}
case'task-delete':snapshot();S.tasks=S.tasks.filter(t=>t.id!==id);save();close();render();toast('Task removed.',true);break;
case'schedule-task':scheduleTask(id);break;
case'new-deadline':modal('A date on the horizon.',`<div class="cx-form">${field('Title','cx-deadline-title')}${select('Subject','cx-deadline-subject',crSubjects(),'Topology')}${field('Date','cx-deadline-date',dkey(crAddCalendarDays(new Date(),14)),'date')}${select('Type','cx-deadline-kind',['Exam','Seminar','Due'],'Exam')}${field('Hours of work needed','cx-deadline-hours',8,'number','min="1" max="300"')}</div>`,btn('Add deadline','deadline-save','primary'));break;
case'deadline-save':{if(!val('cx-deadline-title').trim()||!val('cx-deadline-date')){toast('Add a title and date.');return}snapshot();S.deadlines.push({id:'d'+Date.now(),title:val('cx-deadline-title'),subject:val('cx-deadline-subject'),date:val('cx-deadline-date'),kind:val('cx-deadline-kind'),hours:Math.max(1,+val('cx-deadline-hours')||1)});save();close();render();toast('Deadline added.',true);break}
case'backward':{
  const deadline=S.deadlines.find(d=>d.id===id);if(!deadline)break;
  const plan=crBackwardPlan(deadline);modal('Plan work before deadline',`<div class="cx-form"><h3>${esc(deadline.title)}</h3><p>Due ${new Date(deadline.date+'T12:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}.</p><p>${duration(deadline.hours*60)} needed · ${duration(plan.placed)} fits before the deadline.</p><p class="${plan.remaining?'cx-form-error':'cx-sub'}">${plan.remaining?duration(plan.remaining)+' still needs a place. Move a commitment, reduce the scope or extend the deadline.':'All of this work fits in the available time.'}</p><details><summary>Review ${plan.blocks.length} proposed blocks</summary>${plan.blocks.map(b=>`<p>${new Date(b.date+'T12:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})} · ${crClockLabel(b.at)} · ${duration(b.min)}</p>`).join('')}</details></div>`,btn('Cancel','close')+btn('Add '+plan.blocks.length+' practice blocks','backward-save','primary',`data-id="${id}" ${plan.blocks.length?'':'disabled'}`));break;
}
case'backward-save':{
  const deadline=S.deadlines.find(d=>d.id===id);if(!deadline)break;const plan=crBackwardPlan(deadline);if(!plan.blocks.length){toast('No work fits before this deadline.');break}
  snapshot();for(const block of plan.blocks)S.blocks.push({...block,id:'deadline:'+crypto.randomUUID(),title:deadline.title+' · practice',subject:deadline.subject,deadlineId:id});save();close();planTab='calendar';view='agenda';render();toast(plan.blocks.length+' blocks added. '+duration(plan.remaining)+' remains unplaced.',true);break;
}
case'new-topic':modal('New topic',`<div class="cx-form">${field('Topic','cx-topic-title')}${select('Subject','cx-topic-subject',crSubjects(),'Topology')}</div>`,btn('Add topic','topic-save','primary'));break;
case'topic-save':if(val('cx-topic-title').trim()){snapshot();S.topics.push({id:'r'+Date.now(),title:val('cx-topic-title').trim(),subject:val('cx-topic-subject'),due:'Tomorrow',interval:1});save();close();render();toast('Topic added.',true)}else toast('Give the topic a title.');break;
case'topic-recall':{const t=S.topics.find(x=>x.id===id);modal('Practice topic',`<h3>${esc(t.title)}</h3><p class="cx-sub" style="margin-top:10px">Write the definition, an example and the key argument from memory. Then rate your recall.</p><div class="cx-wrap" style="margin-top:20px">${[['Again · forgot',1],['Hard · recalled with effort',2],['Good · recalled',3],['Easy · fluent',4]].map(([l,v])=>btn(l,'topic-rate','',`data-id="${id}" data-rating="${v}"`)).join('')}</div>`,btn('Edit topic','topic-edit','text',`data-id="${id}"`));break}
case'topic-edit':{const t=S.topics.find(x=>x.id===id);modal('Edit the concept.',`<div class="cx-form">${field('Topic title','cx-topic-edit-title',t.title)}${select('Subject','cx-topic-edit-subject',crSubjects(),t.subject)}</div>`,btn('Save','topic-edit-save','primary',`data-id="${id}"`));break}
case'topic-edit-save':if(val('cx-topic-edit-title').trim()){const t=S.topics.find(x=>x.id===id);t.title=val('cx-topic-edit-title').trim();t.subject=val('cx-topic-edit-subject');save();close();render();toast('Topic updated.')}break;
case'topic-rate':{snapshot();const t=S.topics.find(x=>x.id===id),rating=+el.dataset.rating;t.interval=rating===1?1:Math.max(1,Math.round(t.interval*(rating===2?1.2:rating===3?1.8:2.5)));t.due=t.interval===1?'Tomorrow':'In '+t.interval+' days';save();close();render();updateHome();toast('Next review: '+t.due.toLowerCase()+'.',true);break}
case'subject-detail':{const t=S.tasks.filter(x=>x.subject===id),e=S.entries.filter(x=>x.subject===id);modal(esc(id),`<div class="cx-form"><span class="cx-caption">Time, reviews and your next actions</span>${topicList(id)}<h3>Backlog · ${t.length}</h3>${t.map(x=>`<div class="cx-row"><span>${esc(x.title)}</span><span class="cx-tag">${duration(x.min)}</span></div>`).join('')||'<p class="cx-caption">Nothing waiting.</p>'}<h3>Recent sessions</h3>${e.map(x=>`<div class="cx-row"><span>${esc(x.title)}</span><span class="cx-tag">${duration(x.min)}</span></div>`).join('')||'<p class="cx-caption">No recent sessions.</p>'}</div>`,btn('Start a session','subject-start','primary',`data-id="${id}"`));break}
case'log-more':crLogShown+=20;render();break;
case'open-log':close();frameLocation.hash='#/carrel/log';render();break;
case'new-entry':entryEditor();break;
case'edit-entry':entryEditor(id);break;
case'entry-save':{
 const eid=$('[data-entry-id]').dataset.entryId,title=val('cx-entry-title').trim(),date=val('cx-entry-date'),start=crNormalizeClock(val('cx-entry-start')),end=crNormalizeClock(val('cx-entry-end'));
 if(!title||!date||!start||!end||start===end){$('#cx-form-error').textContent='Use a title, date and two distinct times.';return}
 const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),clock=/^([01]\d|2[0-3]):([0-5]\d)$/;
 if(!crLocalDay(date)||!parts||!clock.test(start)||!clock.test(end)){$('#cx-form-error').textContent='Choose a valid local date and time.';return}
 const [,year,month,day]=parts.map(Number),[sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
 const begins=new Date(year,month-1,day,sh,sm),ends=new Date(year,month-1,day,eh,em);
 if(ends<=begins)ends.setDate(ends.getDate()+1);
 if(+ends>Date.now()){$('#cx-form-error').textContent='Study time cannot end in the future. Use a planned block for future work.';$('#cx-entry-end').focus();return}
 const previous=eid?S.entries.find(x=>x.id===eid):null;
 const timesChanged=!!previous&&(previous.date!==date||previous.start!==start||previous.end!==end);
 snapshot();
 const e={...(previous||{}),id:eid||'e'+Date.now(),title,subject:val('cx-entry-subject'),date,start,end,
  min:previous&&!timesChanged&&Array.isArray(previous.intervals)?previous.min:Math.max(1,Math.round((ends-begins)/60000)),
  focus:val('cx-entry-focus'),note:val('cx-entry-note')};
 if(previous&&timesChanged&&Array.isArray(previous.intervals)){
  // A user-adjusted time range is authoritative, but the old Pomodoro/break
  // subdivisions cannot honestly be presented as observations of that range.
  e.intervals=[{start:begins.toISOString(),end:ends.toISOString()}];
  e.startInstant=begins.toISOString();e.endInstant=ends.toISOString();
  e.timeApproximate=true;e.editedTimeRange=true;
 }
 if(eid)S.entries=S.entries.map(x=>x.id===eid?e:x);else S.entries.push(e);
 save();close();render();toast('Time log updated.',true);break}
case'split-entry':{const e=S.entries.find(x=>x.id===id);modal('Two parts of one session.',`<div class="cx-form"><p class="cx-sub">${esc(e.title)} · ${duration(e.min)}</p>${field('First part · minutes','cx-split-min',Math.max(1,Math.floor(e.min/2)),'number',`min="1" max="${e.min-1}"`)}${select('Second activity','cx-split-subject',['Topology','Linear Algebra','Real Analysis','Algebra','Complex analysis','Reading','Card review','Break'],'Algebra')}</div>`,btn('Split entry','split-save','primary',`data-id="${id}"`));break}
case'split-save':{
  const entry=S.entries.find(e=>e.id===id),minutes=Number(val('cx-split-min'));if(!entry)return;
  const parts=nativeWin.__lemmaEffortMetrics.intervalsFor(entry),total=parts.reduce((sum,part)=>sum+(part.end-part.start)/60000,0);
  if(crFormErrors([{id:'cx-split-min',message:!Number.isFinite(minutes)||minutes<=0||minutes>=total?'Choose a split inside this saved session.':''}]))return;
  snapshot();let left=minutes*60000;const first=[],second=[];
  for(const part of parts){const length=part.end-part.start;if(left>=length){first.push(part);left-=length}else if(left>0){first.push({start:part.start,end:part.start+left});second.push({start:part.start+left,end:part.end});left=0}else second.push(part)}
  const apply=(record,intervals)=>{const start=new Date(intervals[0].start),end=new Date(intervals.at(-1).end);return{...record,date:dkey(start),start:crTime(start.getHours()*60+start.getMinutes()),end:crTime(end.getHours()*60+end.getMinutes()),intervals:intervals.map(p=>({start:new Date(p.start).toISOString(),end:new Date(p.end).toISOString()})),min:intervals.reduce((sum,p)=>sum+(p.end-p.start)/60000,0)}};
  S.entries=S.entries.map(e=>e.id===id?apply(e,first):e);S.entries.push(apply({...entry,id:'split:'+crypto.randomUUID(),subject:val('cx-split-subject'),title:entry.title+' · part 2'},second));save();close();render();toast('Session split without duplicating its time.',true);break;
}
case'ritual':ritualStep=1;S.ritualPicks=[];ritual();break;
case'ritual-back':ritualStep--;ritual();break;
case'ritual-next':{
  if(ritualStep<3){ritualStep++;ritual()}else{S.ritualDone=true;S.intention=val('cx-ritual-intent');S.ritualSchedule=true;save();close();autoPlan()}break;
}
case'shutdown':S.carryIds=[];shutdown();break;
case'shutdown-save':{
  snapshot();const selected=new Set(S.carryIds||[]),finish=checked('cx-shutdown-stop');S.tomorrowFirst=val('cx-tomorrow-first');
  for(const task of S.tasks)if(selected.has(task.id))task.due=dkey(crAddCalendarDays(new Date(),1));
  S.shutdownDone=true;save();close();render();toast('Day closed. '+selected.size+' tasks carried to tomorrow.',true);
  if(finish&&(S.timer.running||S.timer.paused))nativeWin.__carrelIntegration?.open('timer','finish');break;
}
case'noticed':noticed();break;
case'drift':drift();break;
case'drift-preset':$('#cx-drift-min').value=id;break;
case'drift-save':{const n=+val('cx-drift-min');if(!(n>=1&&n<=240)){toast('Use 1–240 minutes.');return}snapshot();S.drift+=n;S.driftLog=(S.driftLog||[]).concat({min:n,note:val('cx-drift-note')});if(S.timer.running&&S.timer.phase==='study')S.timer.elapsed=Math.max(0,elapsed()-n*60),S.timer.stamp=Date.now();save();close();render();updateHome();toast(n+' minutes recorded as drift.',true);break}
case'park':modal('Set it down for later.',`<div class="cx-form">${areas('Thought to park','cx-park','','maxlength="140" placeholder="You can come back to this after the proof."')}</div>`,btn('Park thought','park-save','primary'));break;
case'park-save':if(val('cx-park').trim()){snapshot();S.parked.push({id:'p'+Date.now(),text:val('cx-park').trim(),done:false});save();close();render();toast('Thought parked.',true)}else toast('Write a thought first.');break;
case'park-task':{snapshot();const p=S.parked.find(x=>x.id===id);S.tasks.push({id:'p-task'+Date.now(),title:p.text,subject:S.timer.activity,min:30,priority:2,done:false});p.done=true;save();render();toast('Moved to backlog.',true);break}
case'park-dismiss':snapshot();S.parked.find(x=>x.id===id).done=true;save();render();toast('Thought dismissed.',true);break;
case'insight-tab':insightTab=id;render();break;
case'insight-prev':case'insight-next':toast('Analytics use one illustrative sample week in this template.');break;
case'insight-range':modal('A wider view.',`<p class="cx-sub">Illustrative month · November 2026</p>${bars([1120,980,1240,1090],['Week 1','Week 2','Week 3','Week 4'])}<p class="cx-caption" style="margin-top:16px">Sample month comparison. The final app would derive this from session records.</p>`,btn('Back to week','close'));break;
case'settings':frameLocation.hash='#/carrel/settings';break;
case'toggle':S.settings[id]=!S.settings[id];save();render();updateHome();toast((S.settings[id]?'Enabled':'Disabled')+' in this demo.');break;
case'day-settings':daySettings();break;
case'day-save':{for(const [id,k]of[['cx-gap','gap'],['cx-daily','daily'],['cx-minday','minDay'],['cx-guard','guard']]){const n=+val(id);if(!Number.isFinite(n)||n<0){toast('Check your numeric preferences.');return}S.settings[k]=n}Object.assign(S.settings,{dayStart:val('cx-daystart'),planStart:val('cx-planstart'),planEnd:val('cx-planend'),week:val('cx-weekstart'),clock:val('cx-hour-clock')});save();close();render();toast('Day preferences saved.');break}
case'activities':modal('Manage activities',`<div class="cx-form">${['Topology · study','Algebra · study','Complex analysis · study','Reading · study','Break · life','Sleep · life','Drift · separate from study',...(S.customActivities||[]).map(n=>n+' · custom')].map(n=>`<div class="cx-row"><span>${n}</span><span class="cx-tag">Visible</span></div>`).join('')}${field('New activity label','cx-custom-activity','','text','maxlength="40"')}</div>`,btn('Save label','activity-save','primary'));break;
case'activity-save':if(val('cx-custom-activity').trim()){S.customActivities=(S.customActivities||[]).concat(val('cx-custom-activity').trim());S.timer.activity=val('cx-custom-activity').trim();save();close();updateHome();toast('Custom activity selected for your next session.')}else toast('Add a label first.');break;
case'calendar-settings':{
  modal('Connected calendars',`<div class="cx-form"><p class="cx-caption">Connection design preview</p><div class="cx-row"><span>Google Calendar busy periods</span><span>Example commitments</span></div><div class="cx-row"><span>Study calendar</span><span>Not connected</span></div><p class="cx-sub">This prototype uses saved local commitments. Choose a calendar and review its read/write permissions when a real connection is available.</p></div>`,btn('Close','close'));break;
}
case'sync-preview':modal('Work can keep moving.',`<div class="cx-form"><span class="cx-badge" style="align-self:start">SYNC DESIGN PREVIEW</span><div class="cx-row"><span>Local changes</span><span class="cx-tag">Saved on this browser</span></div><div class="cx-row"><span>Account connection</span><span class="cx-tag">Demo only</span></div><p class="cx-sub">The real integration uses instant sync, an offline queue and conflict recovery. The mockup stores sample edits locally and never connects to production.</p><div class="cx-inset cx-sub">Offline: 3 waiting → reconnect → saved.<br>Conflict: preserve local copy → review both versions.</div></div>`,btn('Close','close'));break;
case'coach-dismiss':snapshot();S.coachDismissed=true;save();render();toast('Sample proposal dismissed.',true);break;
case'coach-accept':{snapshot();S.coachAccepted=true;S.coachDismissed=false;for(const b of S.blocks)if(b.id==='b4')b.min=65;save();render();toast('Sample coach plan accepted into the day.',true);break}
case'copy-prompt':modal('Take a question to your chat.',`<div class="cx-form">${select('Prompt','cx-prompt-type',['Plan my day','Plan my week','Weekly review','Exam plan'],'Plan my day')}<p class="cx-sub">Use your existing connected chat. The mockup does not call an AI service.</p></div>`,btn('Copy prompt','copy-prompt-now','primary'));break;
case'copy-prompt-now':{const text='Use the Supabase connector for Carrel. Read meta/guide in public.docs, then '+val('cx-prompt-type').toLowerCase()+': inspect week_summary, topics_due and existing plans. Write a coach proposal for review. Preserve Lemma checkpoint progress; do not approve learning-plan amendments.';if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Prompt copied.')).catch(()=>promptFallback(text));else promptFallback(text);break}
case'quick-tile':if(S.timer.running)finish();else startOptions();break;
case'share-target':capture('A paper to read tmr 30m');break;
case'keys':modal('A quieter way around.',`<div class="cx-form">${[['Space','Focus desk'],['B','Break / resume'],['N','Quick capture'],['S','Finish session'],['Ctrl / Cmd Z','Undo local edit'],['Esc','Close dialog / focus']].map(([k,v])=>`<div class="cx-row"><kbd class="cx-tag">${k}</kbd><span>${v}</span></div>`).join('')}</div>`,btn('Close','close'));break;
case'export-csv':exportData('csv');break;
case'export-json':exportData('json');break;
case'reset':modal('Start with a fresh notebook?',`<p class="cx-sub">This resets only this mockup’s local sample data. The attached Lemma demo is preserved.</p>`,btn('Cancel','close')+btn('Reset sample','reset-now','primary'));break;
case'reset-now':S=structuredClone(initial);S.timer.stamp=Date.now();save();close();render();updateHome();toast('Sample restored.');break;
}}
function promptFallback(text){modal('Copy this prompt.',`<div class="cx-form">${areas('Select and copy','cx-copyable-prompt',text)}</div>`,btn('Done','close'));$('#cx-copyable-prompt').select()}
let crPointerDrag=null,crSuppressClickUntil=0;
const crIsSpatial=()=>document.body.classList.contains('cx-calendar-page');
function crDragPosition(){
 const d=crPointerDrag;if(!d||!d.active)return;
 const dayOrigin=crVisibleDayStartHour*60;
 const cols=$$('.cr-grid-day');let col=cols.find(c=>{const r=c.getBoundingClientRect();return d.x>=r.left&&d.x<=r.right});
 if(!col||d.resize)col=d.column;if(!col)return;d.column=col;const rect=col.getBoundingClientRect();
 if(d.resize){const raw=dayOrigin+(d.y-rect.top)*60/84-d.start;d.minutes=Math.max(15,Math.min(1440-d.start,Math.round(raw/15)*15));d.at=d.start;d.day=d.block.date}
 else{d.at=Math.max(dayOrigin,Math.min(1440-d.block.min,Math.round((dayOrigin+(d.y-rect.top)*60/84-d.offset)/15)*15));d.minutes=d.block.min;d.day=col.dataset.date}
 if(d.ghost.parentElement!==col)col.append(d.ghost);
 d.ghost.style.top=(d.at-dayOrigin)*84/60+'px';d.ghost.style.height=d.minutes*84/60+'px';d.ghost.innerHTML=`<b>${crTime(d.at)}–${crTime(d.at+d.minutes)}</b><span>${esc(d.block.title)}</span>`;
}
function crDragAutoScroll(){
 const d=crPointerDrag;if(!d||!d.active)return;
 const r=d.scroll.getBoundingClientRect();let dy=0,dx=0;if(d.y<r.top+48)dy=-Math.min(11,(r.top+48-d.y)/4);else if(d.y>r.bottom-48)dy=Math.min(11,(d.y-r.bottom+48)/4);if(view==='week'){if(d.x<r.left+30)dx=-6;else if(d.x>r.right-30)dx=6}if(dy||dx){d.scroll.scrollTop+=dy;d.scroll.scrollLeft+=dx;crDragPosition()}d.raf=requestAnimationFrame(crDragAutoScroll)
}
function crEndPointer(cancel=false){
 const d=crPointerDrag;if(!d)return;crPointerDrag=null;cancelAnimationFrame(d.raf);d.ghost?.remove();d.element.classList.remove('is-dragging');document.body.classList.remove('cr-is-dragging');
 try{d.element.releasePointerCapture(d.pointer)}catch{}
 if(!d.active)return;crSuppressClickUntil=Date.now()+500;
 if(cancel)return;
 if(d.day!==d.block.date||d.at!==crClockMin(d.block.at)||d.minutes!==d.block.min){const scroll=d.scroll;crSpatialScroll.set(view+':'+dkey(date),{top:scroll.scrollTop,left:scroll.scrollLeft});snapshot();Object.assign(d.block,{date:d.day,at:crTime(d.at),min:d.minutes});save();render();announce();toast(d.resize?'Block length updated.':'Moved to '+crTime(d.at)+'.',true)}
}
document.addEventListener('pointerdown',e=>{
 if(!crIsSpatial()||e.button!==0||crPointerDrag)return;const el=e.target.closest('.cr-spatial-event[data-movable="true"]');if(!el)return;if(e.pointerType==='touch'&&!e.target.closest('.cr-event-grip,[data-resize]'))return;
 const b=S.blocks.find(b=>b.id===el.dataset.id);if(!b||b.actual||b.pin||b.busy)return;
 const col=el.closest('.cr-grid-day'),rect=col.getBoundingClientRect();crPointerDrag={pointer:e.pointerId,element:el,block:b,column:col,scroll:el.closest('.cr-grid-scroller'),x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,offset:(e.clientY-rect.top)*60/84-(crClockMin(b.at)-crVisibleDayStartHour*60),start:crClockMin(b.at),at:crClockMin(b.at),minutes:b.min,day:b.date,resize:!!e.target.closest('[data-resize]'),active:false};
 try{el.setPointerCapture(e.pointerId)}catch{}
},true);
document.addEventListener('pointermove',e=>{
 const d=crPointerDrag;if(!d||d.pointer!==e.pointerId)return;d.x=e.clientX;d.y=e.clientY;
 if(!d.active){if(Math.hypot(d.x-d.x0,d.y-d.y0)<6)return;d.active=true;d.ghost=document.createElement('div');d.ghost.className='cr-drag-preview';d.column.append(d.ghost);d.element.classList.add('is-dragging');document.body.classList.add('cr-is-dragging');crDragAutoScroll()}
 e.preventDefault();crDragPosition()
},{capture:true,passive:false});
document.addEventListener('pointerup',e=>{if(crPointerDrag?.pointer===e.pointerId)crEndPointer(false)},true);
document.addEventListener('pointercancel',e=>{if(crPointerDrag?.pointer===e.pointerId)crEndPointer(true)},true);
window.addEventListener('blur',()=>crEndPointer(true));
document.addEventListener('change',e=>{const el=e.target;if(el.matches('input[data-cx],select[data-cx]'))action(el.dataset.cx,el);if(el.matches('input[inputmode=numeric]')&&/:(?:00)?$/.test(el.placeholder||''))el.value=crNormalizeClock(el.value)});
document.addEventListener('click',e=>{if(crIsSpatial()&&Date.now()<crSuppressClickUntil&&e.target.closest('.cr-spatial-event,.cr-grid-day')){e.preventDefault();e.stopImmediatePropagation()}},true);
document.addEventListener('dblclick',e=>{if(!crIsSpatial()||e.target.closest('.cr-spatial-event'))return;const col=e.target.closest('.cr-grid-day');if(!col)return;e.preventDefault();const at=Math.max(crVisibleDayStartHour*60,Math.min(1380,Math.round((crVisibleDayStartHour*60+(e.clientY-col.getBoundingClientRect().top)*60/84)/15)*15));blockEditor(undefined,{date:col.dataset.date,at:crTime(at),min:50})});
document.addEventListener('keydown',e=>{
 if(!crIsSpatial())return;if(e.key==='Escape'&&crPointerDrag){crEndPointer(true);e.preventDefault();e.stopImmediatePropagation();return}
 const el=e.target.closest('.cr-spatial-event[data-movable="true"]');if(!el||!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
 e.preventDefault();e.stopImmediatePropagation();const b=S.blocks.find(b=>b.id===el.dataset.id);if(!b||b.actual||b.pin||b.busy)return;snapshot();if(e.key==='ArrowUp'||e.key==='ArrowDown')b.at=crTime(Math.max(crVisibleDayStartHour*60,Math.min(1440-b.min,crClockMin(b.at)+(e.key==='ArrowUp'?-15:15))));else{const day=new Date(b.date+'T12:00');day.setDate(day.getDate()+(e.key==='ArrowLeft'?-1:1));b.date=dkey(day)}save();render();announce();requestAnimationFrame(()=>$('.cr-spatial-event[data-id="'+b.id+'"]')?.focus());toast('Block moved.',true)
},true);

/* Shared publisher for keyboard, pointer and editor updates. */
function announce(){parent.postMessage({kind:'carrel:state',state:S},'*')}
function updateHome(){announce()}
function boot(){
 const base=document.createElement('div');base.innerHTML='<div id="cx-app"></div><nav class="cx-nav" id="cx-nav" aria-label="Unified navigation"></nav><div class="cx-running-dock cx" id="cx-dock"></div><div class="cx-dialog"><dialog id="cx-modal" aria-labelledby="cx-modal-title"></dialog></div><div id="cx-focus" class="cx-focus"></div><div id="cx-toast" class="cx-toast" role="status" aria-live="polite"></div>';while(base.firstChild)document.body.append(base.firstChild);
 $('#cx-modal').addEventListener('click',e=>{if(e.target===$('#cx-modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
 $('#cx-modal').addEventListener('cancel',()=>{urgeEnd=0});
 $('#cx-modal').addEventListener('close',()=>{if(!$('#cx-modal').open){calendarScrollLock($('#cx-modal'),false);nativeWin.__lemmaNativeDialogClose?.();if(modalOpener?.isConnected)modalOpener.focus({preventScroll:true})}});$('#cx-modal').addEventListener('input',e=>{if(e.target?.id==='cx-block-min')document.querySelectorAll('#cx-modal [data-cx="block-duration"]').forEach(x=>x.classList.toggle('is-selected',x.dataset.id===e.target.value))});
 document.addEventListener('click',e=>{const el=e.target.closest('[data-cx]');if(!el||el.matches('select,input,textarea'))return;e.preventDefault();e.stopPropagation();action(el.dataset.cx,el)},true);
 document.addEventListener('change',e=>{if(e.target.matches('input[data-cx="task-check"]'))return});
 document.addEventListener('change',e=>{if(e.target.id==='cx-joint-project'){const p=jointProjects.find(p=>p.id===e.target.value),select=$('#cx-joint-checkpoint');if(select)select.innerHTML=(p?'<option value="'+p.cp+'">'+p.cp+' · '+p.checkpoint+'</option>':'')+'<option value="">Project-level work</option>'}});
document.addEventListener('keydown',event=>{const tab=event.target.closest?.('[role=tab]');if(!tab)return;const tabs=[...tab.parentElement.querySelectorAll('[role=tab]')],index=tabs.indexOf(tab);let next;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=tabs[(index+1)%tabs.length];if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=tabs[(index-1+tabs.length)%tabs.length];if(event.key==='Home')next=tabs[0];if(event.key==='End')next=tabs.at(-1);if(next){event.preventDefault();const id=next.dataset.id;next.click();requestAnimationFrame(()=>document.querySelector('[role=tab][data-id="'+id+'"]')?.focus())}});
document.addEventListener('input',e=>{
 if(e.target.id==='cx-capture')capturePreview();
 const kind=e.target.dataset.plannerSearch;
 if(kind&&plannerListState[kind]){const value=e.target.value,caret=e.target.selectionStart;plannerListState[kind]={query:value,limit:20};const picker=$('#cx-modal')?.open&&$('#cx-modal-title')?.textContent==='Choose tasks from backlog';if(picker)ritualTaskPicker();else render();const field=picker?$('#cx-modal #cx-picker-search-'+kind):$('#cx-search-'+kind);field?.focus({preventScroll:true});try{field?.setSelectionRange(caret,caret)}catch{}}
});
 window.addEventListener('hashchange',()=>{close();exitFocus();render();window.scrollTo(0,0)});
 document.addEventListener('keydown',e=>{if(e.target.closest?.('button,a,summary,[role=tab]'))return;if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.key==='Escape'&&!$('#cx-modal').open){exitFocus();return}if($('#cx-modal').open)return;if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();action('undo');return}if(e.key===' '){e.preventDefault();focus()}if(e.key.toLowerCase()==='b')takeBreak();if(e.key.toLowerCase()==='n')capture();if(e.key.toLowerCase()==='s')finish();if(e.key==='Tab'&&$('#cx-focus').children.length){const focusables=$$('button',$('#cx-focus'));const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first)e.preventDefault(),last.focus();else if(!e.shiftKey&&document.activeElement===last)e.preventDefault(),first.focus()}});
 document.addEventListener('dragstart',e=>{const b=e.target.closest('.cx-cal-event[draggable=true]');if(b)e.dataTransfer.setData('text/plain',b.dataset.id)});
 document.addEventListener('dragover',e=>{if(e.target.closest('.cx-day-column'))e.preventDefault()});
 document.addEventListener('drop',e=>{const col=e.target.closest('.cx-day-column');if(!col)return;e.preventDefault();const b=S.blocks.find(b=>b.id===e.dataTransfer.getData('text/plain'));if(!b||b.actual||b.pin){toast('Fixed and logged blocks stay in place.');return}snapshot();b.date=col.dataset.date;save();render();toast('Block moved to '+b.date+'.',true)});
 let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate()})}).observe($('#root'),{childList:true,subtree:true});

window.__carrelTools={getState:()=>S,action,route:()=>route()};
window.addEventListener('storage',e=>{if(e.key!=='lemma.carrel.saturation.20261102.v1'||!e.newValue)return;try{
const next=JSON.parse(e.newValue);if(next?.timer){
S={...S,...next,blocks:next.blocks||S.blocks,tasks:next.tasks||S.tasks,deadlines:next.deadlines||S.deadlines,topics:next.topics||S.topics,entries:next.entries||S.entries,settings:{...S.settings,...(next.settings||{})}};
lastTimerSignature=timerSignature(S.timer);render();announce()}}catch{}});
window.addEventListener('message',e=>{if(e.source!==parent)return;const m=e.data;if(m?.kind==='carrel:theme'){for(const [k,v]of Object.entries(m.vars||{}))document.documentElement.style.setProperty(k,v);document.documentElement.dataset.theme=m.theme;return}if(m?.kind!=='carrel:command')return;
if(m.stateSync?.timer){
  // Session timing is authoritative; planner fields stay calendar-owned.
  S={...S,...m.stateSync,blocks:m.stateSync.blocks||S.blocks,tasks:m.stateSync.tasks||S.tasks,deadlines:m.stateSync.deadlines||S.deadlines,topics:m.stateSync.topics||S.topics,entries:m.stateSync.entries||S.entries,settings:{...S.settings,...(m.stateSync.settings||{})}};
  S.timer=sharedSession.get();lastTimerSignature=timerSignature(S.timer);
  save();render();announce();return;
}
if(m.integrated){S.integration={...(S.integration||{}),...m.integrated};if(m.integrated.settings)S.settings={...S.settings,...m.integrated.settings};save();render();announce();return;}
if(m.jointProject){const p=m.jointProject;jointPendingProject=p;if(m.prepare==='start'){frameLocation.hash='#/carrel/plan';startOptions(p.name);$('#cx-intent').value='Work on '+p.cp+' · '+p.checkpoint;announce();return;}frameLocation.hash='#/carrel/plan';blockEditor(null,{title:p.cp+' · '+p.checkpoint,subject:p.name,min:S.settings.defaultFocus||50,projectId:p.id,checkpointId:p.cp});announce();return;}
if(m.reviewBlock){frameLocation.hash='#/carrel/plan';blockEditor(null,{title:'Today’s card review',subject:'Card review',min:m.minutes||15,kind:'review'});announce();return;}
if(m.reviewSession){frameLocation.hash='#/carrel/plan';jointPendingKind='review';startOptions('Card review');$('#cx-focus-min').value=m.minutes||15;$('#cx-intent').value='Review due cards with care';announce();return;}
if(m.screen){planTab=m.tab||planTab;frameLocation.hash='#/carrel/'+m.screen;render()}if(m.action){const node=document.createElement('button');if(m.id)node.dataset.id=m.id;action(m.action,node)}announce()});
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a){e.preventDefault();const h=a.getAttribute('href');if(h.startsWith('#/carrel/'))frameLocation.hash=h;else parent.postMessage({kind:'carrel:lemma',hash:h},'*')}requestAnimationFrame(announce)},true);
parent.postMessage({kind:'carrel:ready'},'*');announce();
window.addEventListener('lemma:notebookchange',()=>{const next=nativeWin.__lemmaNotebook.getState();if(next.notebookRevision!==S.notebookRevision||timerSignature(next.timer)!==timerSignature(S.timer)){S=next;lastTimerSignature=timerSignature(S.timer);if(!$('#cx-modal')?.open)render();}});

 render();setInterval(()=>{$$('[data-cx-clock]').forEach(el=>el.textContent=displayClock());$$('[data-cx-progress]').forEach(el=>el.style.width=Math.min(100,elapsed()/(S.timer.focus*60)*100)+'%');const u=$('#cx-urge-time');if(u&&urgeEnd){const remain=Math.max(0,Math.ceil((urgeEnd-Date.now())/1000));u.textContent=remain;if(!remain)u.parentElement.nextElementSibling.textContent='The urge can pass. Return when you’re ready.'}},1000);
 setTimeout(decorate,700);setTimeout(decorate,2200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
 }
 class LemmaNativeCalendar extends HTMLElement {
   connectedCallback(){
    if(this._calendarConnected)return;
    this._calendarConnected=true;
    const shadow=this.shadowRoot||this.attachShadow({mode:'open'});shadow.replaceChildren();
    const style=nativeDoc.createElement('style');style.textContent=calendarCSS;
    const shell=nativeDoc.createElement('div');shell.className='cx-calendar-page';shell.innerHTML='<div id="root"></div>';
    shadow.append(style,shell);
    this.dataset.theme=nativeDoc.documentElement.dataset.theme||'graph-night';
    this.toggleAttribute('data-large-text',nativeDoc.documentElement.hasAttribute('data-large-text'));
    const scaleObserver=new MutationObserver(()=>this.toggleAttribute('data-large-text',nativeDoc.documentElement.hasAttribute('data-large-text')));scaleObserver.observe(nativeDoc.documentElement,{attributes:true,attributeFilter:['data-large-text']});
    const timers=new Set(), listeners=[],bus=new EventTarget(),host=this;
    const timerSet=(fn,ms,...args)=>{const id=nativeWin.setTimeout(()=>{timers.delete(id);fn(...args)},ms);timers.add(id);return id};
    const timerInterval=(fn,ms,...args)=>{const id=nativeWin.setInterval(fn,ms,...args);timers.add(id);return id};
    const clearT=id=>{nativeWin.clearTimeout(id);nativeWin.clearInterval(id);timers.delete(id)};
    const addListen=(target,type,fn,opt)=>{target.addEventListener(type,fn,opt);listeners.push([target,type,fn,opt])};
    const localDocument={
      body:shell,documentElement:host,fonts:nativeDoc.fonts,readyState:'complete',
      get activeElement(){return shadow.activeElement||nativeDoc.activeElement;},
      createElement:tag=>nativeDoc.createElement(tag),
      querySelector:sel=>shadow.querySelector(sel),
      querySelectorAll:sel=>shadow.querySelectorAll(sel),
      getElementById:id=>shadow.getElementById(id),
      addEventListener:(type,fn,opt)=>addListen(shadow,type,fn,opt),
      removeEventListener:(type,fn,opt)=>shadow.removeEventListener(type,fn,opt)
    };
    const parent={postMessage(data){nativeWin.__lemmaNativeCalendarMessage?.(data,host);}};
    const localWindow={
      parent,
      get __lemmaEffortMetrics(){return nativeWin.__lemmaEffortMetrics},
      get __lemmaNotebook(){return nativeWin.__lemmaNotebook},
      get __carrelTools(){return host._nativeCalendarTools},
      set __carrelTools(api){host._nativeCalendarTools=api;},
      addEventListener(type,fn,opt){addListen(['storage','resize','blur','lemma:notebookchange','lemma:sessionchange'].includes(type)?nativeWin:bus,type,fn,opt)},
      dispatchEvent:event=>bus.dispatchEvent(event),
      removeEventListener:(type,fn,opt)=>(['storage','resize','blur'].includes(type)?nativeWin:bus).removeEventListener(type,fn,opt),
      get scrollY(){return nativeWin.scrollY},scrollTo(...args){nativeWin.scrollTo(...args)}
    };
    this.nativeApi={
      command(message){const event=new Event('message');Object.defineProperties(event,{data:{value:message},source:{value:parent}});bus.dispatchEvent(event)},
      theme(theme,vars={}){host.dataset.theme=theme;for(const [key,value] of Object.entries(vars))host.style.setProperty(key,value);copyCalendarTokens(host)},
      getState(){return host._nativeCalendarTools?.getState()},
      action(...args){return host._nativeCalendarTools?.action(...args)},
      root:shadow
    };
    this._nativeDisposer=()=>{calendarScrollLock(shadow.querySelector('#cx-modal'),false);scaleObserver.disconnect();listeners.forEach(([target,type,fn,opt])=>target.removeEventListener(type,fn,opt));timers.forEach(clearT);this._calendarConnected=false};
    runCalendar({document:localDocument,window:localWindow,parent,setInterval:timerInterval,setTimeout:timerSet,clearInterval:clearT,clearTimeout:clearT});
   }
   disconnectedCallback(){this._nativeDisposer?.();this.nativeApi=null;}
 }
 class LemmaCalendarSpecimens extends HTMLElement {
  connectedCallback(){
   if(this._specimenConnected)return;this._specimenConnected=true;
   const root=this.shadowRoot||this.attachShadow({mode:'open'});root.replaceChildren();const style=nativeDoc.createElement('style');style.textContent=calendarCSS;
   const panel=nativeDoc.createElement('section');panel.className='cx-dialog lemma-calendar-specimens';panel.setAttribute('aria-label','Calendar component examples');
   panel.innerHTML=`<p class="cx-caption">Interactive examples of the Calendar fields, action colors, validation and sheet.</p><form class="cx-form" novalidate>
    ${calendarFieldMarkup('Example task','kit-task','Read one proof','text','maxlength="80"')}
    ${calendarFieldMarkup('Estimate · minutes','kit-estimate','25','number','min="5" max="720"')}
    ${calendarFieldMarkup('Starts at','kit-clock','20:00','time')}
    <div class="cx-wrap">${calendarButtonMarkup('Preview save','specimen-save','primary','','submit')}${calendarButtonMarkup('Open sheet example','specimen-open')}</div>
    <p class="cx-caption" role="status" id="kit-status"></p>
   </form><dialog id="kit-dialog" aria-labelledby="kit-dialog-heading"><header class="cx-modal-head"><h2 id="kit-dialog-heading" tabindex="-1">Calendar sheet example</h2>${calendarButtonMarkup('Close','specimen-close')}</header><div class="cx-modal-body"><p>This example uses the same field and button markup, scoped styles and native dialog behavior as Calendar.</p></div><footer class="cx-modal-foot">${calendarButtonMarkup('Remove example','specimen-remove','destructive')}${calendarButtonMarkup('Keep example','specimen-close','primary')}</footer></dialog>`;
   root.append(style,panel);
   const dialog=root.querySelector('#kit-dialog'),status=root.querySelector('#kit-status');
   panel.addEventListener('submit',event=>{
    event.preventDefault();const title=root.querySelector('#kit-task'),estimate=root.querySelector('#kit-estimate'),clock=root.querySelector('#kit-clock'),minutes=Number(estimate.value),time=clock.value.trim().replace(/^(\d{2})(\d{2})$/,'$1:$2');
    const errors=[[title,!title.value.trim()?'Enter a task title.':''],[estimate,!Number.isFinite(minutes)||minutes<5||minutes>720?'Enter 5–720 minutes.':''],[clock,!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?'Enter a 24-hour time such as 20:00.':'']];
    for(const [input,error]of errors){input.setAttribute('aria-invalid',String(Boolean(error)));root.querySelector('#'+input.id+'-error').textContent=error}
    const first=errors.find(([,error])=>error);if(first){first[0].focus();status.textContent='Check the marked fields.'}else{clock.value=time;status.textContent='Example saved.'}
   });
   panel.addEventListener('click',event=>{const action=event.target.closest('[data-cx]')?.dataset.cx;
    if(action==='specimen-open'){this._returnTo=root.activeElement;dialog.showModal();calendarScrollLock(dialog,true);root.querySelector('#kit-dialog-heading').focus()}
    if(action==='specimen-close')dialog.close();
    if(action==='specimen-remove'){dialog.close();root.querySelector('#kit-task').value='';status.textContent='Example removed.'}
   });
   dialog.addEventListener('close',()=>{calendarScrollLock(dialog,false);this._returnTo?.focus()});
   const theme=()=>{this.dataset.theme=nativeDoc.documentElement.dataset.theme||'graph';this.toggleAttribute('data-large-text',nativeDoc.documentElement.hasAttribute('data-large-text'));copyCalendarTokens(this)};theme();
   this._themeObserver=new MutationObserver(theme);this._themeObserver.observe(nativeDoc.documentElement,{attributes:true,attributeFilter:['data-theme','data-large-text']});
  }
  disconnectedCallback(){calendarScrollLock(this.shadowRoot?.querySelector('#kit-dialog'),false);this._themeObserver?.disconnect();this._specimenConnected=false;}
 }
 customElements.define('lemma-native-calendar',LemmaNativeCalendar);
 customElements.define('lemma-calendar-specimens',LemmaCalendarSpecimens);
})();
