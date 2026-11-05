/* Shared notebook records and feedback for the React shell and the scoped planner. */
(()=>{'use strict';
  const KEY='lemma.carrel.saturation.20261102.v1',copy=value=>JSON.parse(JSON.stringify(value));
  const dayKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function exampleState(){
    const dkey=dayKey,previousDay=new Date();previousDay.setDate(previousDay.getDate()-1);
    const initial={timer:{running:true,phase:'study',activity:'Topology',project:'Topology',checkpoint:'CP2 · Topological spaces',intent:'Prove the quotient-map criterion',mode:'pomo',focus:50,short:10,long:20,every:4,cycle:2,elapsed:28*60+36,stamp:Date.now()},tasks:[{id:'t1',title:'Prove the quotient-map criterion',subject:'Topology',min:50,priority:1,done:false},{id:'t2',title:'Residue theorem exercises 4–8',subject:'Complex analysis',min:60,priority:2,done:false},{id:'t3',title:'Review quotient groups',subject:'Algebra',min:25,priority:2,done:false}],deadlines:[{id:'d1',title:'Topology seminar',subject:'Topology',date:'2026-11-06',kind:'Seminar',hours:4},{id:'d2',title:'Qualifying exam',subject:'Algebra',date:'2026-11-20',kind:'Exam',hours:18}],topics:[{id:'r1',title:'Deformation retracts',subject:'Topology',due:'Today',interval:3},{id:'r2',title:'Normal subgroups',subject:'Algebra',due:'Today',interval:2},{id:'r3',title:'Residues at infinity',subject:'Complex analysis',due:'Tomorrow',interval:6}],entries:[{id:'e1',subject:'Topology',title:'Homotopy equivalence',date:dkey(previousDay),start:'09:00',end:'10:20',min:80,focus:'Deep',note:'Proved the induced maps are inverses.'},{id:'e2',subject:'Algebra',title:'Sylow exercises',date:dkey(previousDay),start:'11:00',end:'12:00',min:60,focus:'Okay',note:'Revisit the conjugacy argument.'},{id:'e3',subject:'Complex analysis',title:'Laurent series',date:dkey(previousDay),start:'14:00',end:'14:50',min:50,focus:'Deep',note:''}],blocks:[{id:'b1',title:'Homotopy equivalence',subject:'Topology',date:dkey(new Date()),at:'09:00',min:80,actual:true},{id:'b2',title:'Sylow exercises',subject:'Algebra',date:dkey(new Date()),at:'11:00',min:60,actual:true},{id:'b3',title:'Laurent series',subject:'Complex analysis',date:dkey(new Date()),at:'14:00',min:50,actual:true},{id:'b4',title:'Quotient topology',subject:'Topology',date:dkey(new Date()),at:'20:00',min:50,current:true},{id:'b5',title:'Recall + review',subject:'Topology',date:dkey(new Date()),at:'21:15',min:25},{id:'b6',title:'Algebra seminar',subject:'Algebra',date:'2026-11-02',at:'11:00',min:60,busy:true},{id:'b7',title:'Residue theorem',subject:'Complex analysis',date:'2026-11-02',at:'20:00',min:60},{id:'b8',title:'Topology problems',subject:'Topology',date:'2026-11-03',at:'20:00',min:90},{id:'b9',title:'Research reading',subject:'Reading',date:'2026-11-04',at:'10:00',min:90},{id:'b10',title:'Qualifying practice',subject:'Algebra',date:'2026-11-05',at:'20:00',min:60},{id:'b11',title:'Topology seminar',subject:'Topology',date:'2026-11-06',at:'15:00',min:60,busy:true}],parked:[{id:'p1',text:'Find another example of a contractible space',done:false}],settings:{flow:true,recall:true,energy:false,urge:true,drift:false,notification:true,widget:true,pulse:false,daily:240,minDay:25,gap:10,guard:4,dayStart:'06:00',planStart:'09:00',planEnd:'23:00',week:'Monday',clock:'24h'},coachAccepted:false,ritualDone:false,shutdownDone:false,notices:2,drift:6};

/* Isolated synthetic calendar saturation: detached from real Supabase / previous local data. */
(function(){
 const subjects=['Topology','Algebra','Complex analysis','Real Analysis','Reading','Linear Algebra'];
 const topics=['Compactness and covering spaces','Representation of finite groups','Spectral theory and orthogonal projections','Residues and analytic continuation','Quotient topology','Convergence of Fourier series'];
 const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const date=i=>iso(new Date(2026,10,1+i));
 const historyDate=i=>{const day=new Date();day.setDate(day.getDate()-1-i);return iso(day)};
 const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 for(let i=0;i<1500;i++){
   const day=i%75,minute=6*60+((i*47)%930),subject=subjects[i%subjects.length];
   initial.blocks.push({id:'stress-b-'+i,title:topics[i%topics.length]+' · '+(i+1),subject,date:date(day),at:hm(minute),min:25+25*(i%4),actual:i%4===0,busy:i%13===0});
 }
 for(let i=0;i<1200;i++){
   let start=6*60+(i*71)%910,minutes=25+25*(i%3);
   initial.entries.push({id:'stress-e-'+i,subject:subjects[i%subjects.length],title:topics[i%topics.length]+' session '+(i+1),date:historyDate(i%110),start:hm(start),end:hm(Math.min(start+minutes,1430)),min:minutes,focus:i%3===0?'Deep':'Okay',note:i%7===0?'Proof revised; check the longest technical step.':'Review completed.'});
 }
 for(let i=0;i<350;i++)initial.tasks.push({id:'stress-t-'+i,title:topics[i%topics.length]+' · exercise '+(i+1),subject:subjects[i%subjects.length],min:25+25*(i%3),priority:1+i%3,done:i%5===0});
 for(let i=0;i<240;i++)initial.topics.push({id:'stress-r-'+i,title:topics[i%topics.length]+' · recall '+(i+1),subject:subjects[i%subjects.length],due:i%3===0?'Today':i%3===1?'Tomorrow':'This week',interval:1+i%30});
 for(let i=0;i<160;i++)initial.deadlines.push({id:'stress-d-'+i,title:topics[i%topics.length]+' milestone '+(i+1),subject:subjects[i%subjects.length],date:date(i%120),kind:i%4===0?'Exam':'Milestone',hours:1+i%16});
 for(let i=0;i<150;i++)initial.parked.push({id:'stress-p-'+i,text:topics[i%topics.length]+' — investigate example '+(i+1),done:i%4===0});
})();

    return initial;
  }
  let state,api,projects=[],catalogSubjects=[],pending=false,feedback=null,feedbackTimer=null,feedbackHost=null,feedbackLayer=null,mirroredMinute=-1;
  const listeners=new Set(),pendingActions=new Map();
  function initialize(){
    if(state)return;
    let saved;try{saved=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
    const seed=exampleState();state={...seed,...(saved||{}),settings:{...seed.settings,...(saved?.settings||{})},notebookRevision:Number(saved?.notebookRevision)||1};
    for(const name of ['blocks','entries','tasks','topics','deadlines','parked'])if(!Array.isArray(state[name]))state[name]=copy(seed[name]||[]);
    state=mirrorLoggedBlocks(state);
  }
  function mirrorLoggedBlocks(next){
    const now=Date.now(),planned=(next.blocks||[]).filter(b=>!b.actual&&!b.futureLog);mirroredMinute=Math.floor(now/60000);
    const logged=window.__lemmaEffortMetrics.uniqueEntries(next.entries).flatMap(entry=>{
      const parts=window.__lemmaEffortMetrics.intervalsFor(entry);
      return parts.flatMap((part,index)=>[{start:part.start,end:Math.min(part.end,now),actual:true},{start:Math.max(part.start,now),end:part.end,actual:false}].filter(part=>part.end>part.start).map((part,slot)=>{const start=new Date(part.start);return{id:`logged:${entry.id||index}:${index}:${slot}`,entryId:entry.id,actual:part.actual,futureLog:!part.actual,date:dayKey(start),
        at:`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,min:(part.end-part.start)/60000,
        title:(part.actual?'':'Needs review · ')+(entry.title||'Recorded study'),subject:entry.subject||'Study',projectId:entry.projectId||null,checkpointId:entry.checkpointId||null}}));
    });
    return{...next,blocks:[...planned,...logged]};
  }
  function getState(){initialize();if(mirroredMinute!==Math.floor(Date.now()/60000))state=mirrorLoggedBlocks(state);return copy({...state,timer:window.__lemmaSessionStore?.get?.()||state.timer})}
  function emit(){if(pending)return;pending=true;queueMicrotask(()=>{pending=false;for(const fn of listeners)fn(getState());window.dispatchEvent(new Event('lemma:notebookchange'))})}
  function commit(next,source='notebook'){
    initialize();
    if(next.notebookRevision&&next.notebookRevision<state.notebookRevision)return getState();
    state=mirrorLoggedBlocks({...state,...copy(next),timer:window.__lemmaSessionStore?.get?.()||next.timer||state.timer,notebookRevision:state.notebookRevision+1});
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch{show('Your browser could not save these changes.',{tone:'danger'})}
    emit();return getState();
  }
  function update(mutator,source){const next=getState();mutator(next);return commit(next,source)}
  function setProjects(rows){projects=Array.isArray(rows)?copy(rows):projects;window.dispatchEvent(new Event('lemma:catalogchange'))}
  function subjects(){return [...new Set([...catalogSubjects.map(subject=>subject.name),...projects.map(p=>p.subject?.name),...getState().entries.map(e=>e.subject),...getState().tasks.map(e=>e.subject)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))}
  function selectTime(days,now=Date.now()){
    const data=getState(),metrics=window.__lemmaEffortMetrics.forRange(data.entries,days,now),from=metrics.scope.from,to=Math.min(metrics.scope.to,now);
    const records=window.__lemmaEffortMetrics.uniqueEntries(data.entries).filter(e=>window.__lemmaEffortMetrics.intervalsFor(e).some(p=>p.end>from&&p.start<to)||!e.start&&e.date>=dayKey(new Date(from))&&e.date<dayKey(new Date(to)));
    const bySubject=new Map(),claimed=[];let allocated=0;
    for(const entry of records){const subject=entry.subject||'Study',prior=bySubject.get(subject);let minutes=0;
      for(const raw of window.__lemmaEffortMetrics.intervalsFor(entry)){const part={start:Math.max(from,raw.start),end:Math.min(to,raw.end)};if(part.end<=part.start)continue;const before=window.__lemmaEffortMetrics.union(claimed).reduce((n,p)=>n+p.end-p.start,0);claimed.push(part);const after=window.__lemmaEffortMetrics.union(claimed).reduce((n,p)=>n+p.end-p.start,0);minutes+=(after-before)/60000}
      if(!window.__lemmaEffortMetrics.intervalsFor(entry).length)minutes=window.__lemmaEffortMetrics.forRange([entry],days,now).committedMinutes;
      minutes=Math.min(minutes,Math.max(0,metrics.committedMinutes-allocated));allocated+=minutes;
      const project=projects.find(p=>p.subject?.name===subject);bySubject.set(subject,{subject:project?.subject||{id:subject,name:subject,glyph:'∫'},minutes:(prior?.minutes||0)+minutes});
    }
    const lengths=records.map(e=>window.__lemmaEffortMetrics.allTime([e]).committedMinutes).filter(n=>n>0).sort((a,b)=>a-b),middle=Math.floor(lengths.length/2);
    return{minutes:metrics.committedMinutes,sessions:metrics.committedRecords,subjects:[...bySubject.values()].sort((a,b)=>b.minutes-a.minutes),
      typicalSession:lengths.length?(lengths.length%2?lengths[middle]:(lengths[middle-1]+lengths[middle])/2):null,timeNeedsReview:metrics.needsReview,
      timeOverlapMinutes:metrics.overlapMinutes,timeInvalidRecords:metrics.invalidRecords,timeSource:'Saved study log'};
  }
  async function refreshCatalog(){
    const [projectResult,subjectResult]=await Promise.allSettled([Promise.resolve().then(()=>api?.listProjects?.()),Promise.resolve().then(()=>api?.listSubjects?.())]);
    if(projectResult.status==='fulfilled'&&Array.isArray(projectResult.value))setProjects(projectResult.value);
    if(subjectResult.status==='fulfilled'&&Array.isArray(subjectResult.value))catalogSubjects=copy(subjectResult.value);
    window.dispatchEvent(new Event('lemma:catalogchange'));
  }
  function configure(next){api=next.api||api;return refreshCatalog()}
  function addTaskFromAnywhere(){window.dispatchEvent(new Event('lemma:quick-task'))}
  function saveQuickTask(input){
    const title=String(input.title||'').trim(),min=Number(input.min),project=projects.find(project=>project.id===input.projectId||project.slug===input.projectId);
    if(!title||title.length>180)throw new Error('Enter a short task title, up to 180 characters.');
    if(!Number.isFinite(min)||min<5||min>720)throw new Error('Enter an estimate from 5 to 720 minutes.');
    if(input.projectId&&!project)throw new Error('This learning path is no longer available. Choose another path.');
    if(input.checkpointId&&!project)throw new Error('Choose a learning path before adding a checkpoint.');
    if(input.checkpointId&&!/^CP\d+$/i.test(input.checkpointId))throw new Error('Use a checkpoint code such as CP4.');
    if(input.checkpointId&&Number(project?.total)>0&&Number(input.checkpointId.slice(2))>Number(project.total))throw new Error('That checkpoint is beyond this learning path.');
    if(input.due&&!window.__lemmaEffortMetrics.dayBounds(input.due))throw new Error('Choose a valid due date.');
    const task={id:'task:'+crypto.randomUUID(),title,min,subject:input.subject||project?.subject?.name||'Study',projectId:project?.id||null,checkpointId:input.checkpointId?.toUpperCase()||null,due:input.due||'',priority:input.priority===1?1:2,done:false};
    update(state=>state.tasks.unshift(task),'quick-task');return copy(task);
  }
  function resolvePark(id,destination){
    const park=getState().parked.find(park=>park.id===id&&!park.done);if(!park)return false;
    if(destination==='task'){try{saveQuickTask({title:park.text,subject:park.subject,min:25})}catch(error){show(error.message,{tone:'danger'});return false}}
    update(state=>{const park=state.parked.find(park=>park.id===id);if(park)park.done=true},'park-resolution');return true;
  }
  function getLayer(){
    let layer=feedbackLayer||document.getElementById('lemma-feedback');
    if(!document.body)return null;
    if(!layer){layer=document.createElement('div');layer.id='lemma-feedback';layer.className='lemma-feedback-layer';layer.setAttribute('aria-live','polite');layer.setAttribute('aria-atomic','true')}
    const host=feedbackHost||document.body;if(layer.parentElement!==host)host.append(layer);feedbackLayer=layer;return layer;
  }
  function dismiss(){clearTimeout(feedbackTimer);const layer=getLayer();layer?.replaceChildren();for(const item of pendingActions.values())item.onDismiss?.();pendingActions.clear();feedback=null}
  function show(message,options={}){
 const layer=getLayer();if(!layer){document.addEventListener('DOMContentLoaded',()=>show(message,options),{once:true});return()=>{}}
 clearTimeout(feedbackTimer);feedback={message,...options};
 if(options.clearAction)pendingActions.delete(options.clearAction);
 if(options.action)pendingActions.set(options.key||options.action.label,{...options});
 layer.replaceChildren();const surface=document.createElement('div');surface.className='lemma-feedback';surface.dataset.tone=options.tone||'neutral';surface.setAttribute('role','status');
 const label=document.createElement('span');label.textContent=message;surface.append(label);
 for(const [key,item] of pendingActions){const action=document.createElement('button');action.type='button';action.textContent=item.action.label;action.addEventListener('click',()=>{pendingActions.delete(key);action.remove();item.action.onClick?.();if(!pendingActions.size&&!layer.contains(surface))return;if(!pendingActions.size)feedbackTimer=setTimeout(dismiss,6000)});surface.append(action)}
 const close=document.createElement('button');close.type='button';close.className='lemma-feedback-close';close.setAttribute('aria-label','Dismiss notification');close.textContent='×';close.addEventListener('click',dismiss);surface.append(close);
 surface.addEventListener('focusin',()=>{clearTimeout(feedbackTimer);surface.dataset.interacting='true';window.dispatchEvent(new CustomEvent('lemma:feedback-focus',{detail:{focused:true}}))});
 surface.addEventListener('focusout',()=>{surface.dataset.interacting='false';window.dispatchEvent(new CustomEvent('lemma:feedback-focus',{detail:{focused:false}}));if(!pendingActions.size)feedbackTimer=setTimeout(dismiss,6000)});
 layer.append(surface);if(!pendingActions.size)feedbackTimer=setTimeout(dismiss,6000);return dismiss;
}
  window.__lemmaFeedback=Object.freeze({show,dismiss,setHost:host=>{feedbackHost=host;getLayer()},isInteracting:()=>document.querySelector('#lemma-feedback [data-interacting=true]')!=null});
  window.__lemmaNotebook=Object.freeze({getState,commit,update,subscribe:fn=>(listeners.add(fn),()=>listeners.delete(fn)),getSeed:()=>copy(exampleState()),setProjects,getProjects:()=>copy(projects),subjects,selectTime,configure,refreshCatalog,addTask:addTaskFromAnywhere,saveQuickTask,resolvePark});
  window.addEventListener('lemma:sessionchange',emit);
  window.addEventListener('storage',event=>{if(event.key!==KEY||!event.newValue)return;try{const next=JSON.parse(event.newValue);if(Number(next.notebookRevision)>Number(state?.notebookRevision||0)){state=mirrorLoggedBlocks(next);emit()}}catch{}});
  // Root-relative UI measurements respond to font enlargement and physical viewport changes.
  function measureText(){
    document.documentElement.toggleAttribute('data-large-text',parseFloat(getComputedStyle(document.documentElement).fontSize)>=24);
  }
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(measureText);observer.observe(document.documentElement)}
  window.addEventListener('resize',measureText);measureText();
})();
