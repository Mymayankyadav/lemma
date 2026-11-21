// Full chronological keystroke replay through the real tutor-context pool.
// The scorer receives only current input, eligible proposals and tutor signals.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const dir='docs/implementation/2026-11-21/writing-aid-tutor';
const data=JSON.parse(await readFile(`${dir}/dataset.json`,'utf8'));
const manifest=JSON.parse(await readFile(`${dir}/manifest.json`,'utf8'));
const trained=JSON.parse(await readFile(`${dir}/models.json`,'utf8'));
const phase=process.env.TUTOR_WRITING_PHASE||'validation';
if(!['validation','test'].includes(phase))throw Error('TUTOR_WRITING_PHASE must be validation or test');
const safety=JSON.parse(await readFile(`${dir}/adversarial-safety.json`,'utf8'));
const frozen=phase==='test'?JSON.parse(await readFile(`${dir}/validation.json`,'utf8')):null;
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const evaluatorSha=await sha('scripts/tutor-writing-evaluate.mjs'),modelsSha=await sha(`${dir}/models.json`),
  safetySha=await sha(`${dir}/adversarial-safety.json`);
if(await sha(`${dir}/dataset.json`)!==trained.trainDatasetSha256)throw Error('Dataset changed since fitting');
for(const [p,h] of Object.entries(trained.engineSources))if(await sha(p)!==h)throw Error(`${p} changed since extraction`);
if(frozen&&(frozen.datasetSha256!==trained.trainDatasetSha256||JSON.stringify(frozen.engineSources)!==JSON.stringify(trained.engineSources)||
  frozen.manifestSha256!==await sha(`${dir}/manifest.json`)||frozen.evaluatorSha256!==evaluatorSha||
  frozen.modelsSha256!==modelsSha||frozen.safetySha256!==safetySha))throw Error('Frozen validation does not match current inputs');
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error',clearScreen:false});await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}${server.config.base}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto(base);
 const result=await page.evaluate(async({base,cases,manifest,trained,phase,frozen,safety})=>{
  const {predictWritingAidPool,selectWritingAidPool}=await import(new URL('src/features/tutor/writingAid/engine.ts',base).href);
  const {advanceWritingAidAnchor,applyWritingAidProposal,continueWritingAidAnchor,writingAidProposalKey}=
    await import(new URL('src/features/tutor/writingAid/policy.ts',base).href);
  const {createWritingAidModel,scoreWritingAidProposal,updateWritingAidModel,writingAidFeatures,recordWritingAidVocabulary}=
    await import(new URL('src/features/tutor/writingAid/learning.ts',base).href);
  const {padEdit}=await import(new URL('src/features/pad/padEdit.ts',base).href);
  const {features,mathRisk}=await import(new URL('scripts/tutor-writing-kernel.mjs',base).href);
  const actualDateNow=Date.now,DAY=86400000,baseTime=1710000000000;
  let virtualNow=baseTime;Date.now=()=>virtualNow;
  const draw=(...parts)=>{let h=2166136261;for(const c of parts.join('/'))h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/2**32;};
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  function infer(m,x){
   if(m.kind==='linear')return dot(m.w,x)+m.b;
   if(m.kind==='mlp'){const h=m.w1.map((w,i)=>Math.max(0,dot(w,x)+m.b1[i]));return dot(m.w2,h)+m.b2;}
   const a=m.a.map(w=>dot(w,x)),b=m.bFactor.map(w=>dot(w,x));return dot(m.w,x)+m.b+dot(a,b);
  }
  function flags(name){
   if(['off','static','frequency','contextual','online-rank4','tutor-none'].includes(name))return {terms:false,wording:false,symbols:false};
   const id=manifest.candidates.find(x=>x.id===name)?.contextFlags ?? 'all';
   return {terms:id==='all'||id.includes('terms'),wording:id==='all'||id.includes('wording'),symbols:id==='all'||id.includes('symbols')};
  }
  function stateFor(store,user,name){
   if(!store.has(user))store.set(user,{model:createWritingAidModel(),rankA:Array.from({length:4},(_,r)=>Array.from({length:32},(_,j)=>
    (draw(name,user,r,j)-.5)*.04)),rankB:Array.from({length:4},()=>Array(32).fill(0)),pending:[]});
   return store.get(user);
  }
  function update(state,signal,p,request,index,now){
   const reward={accept:1,refresh:-.7,alternate:-.2,undo:-1.5,'partial-edit':-.6,kept:.35,'continued-match':.16,divergent:-.08,'personal-use':.14}[signal]??0;
   updateWritingAidModel(state.model,signal,writingAidFeatures(p),now);
   if(state.name==='online-rank4'){
    const x=features(request,p,index),a=state.rankA.map(w=>dot(w,x)),b=state.rankB.map(w=>dot(w,x));
    for(let r=0;r<4;r++)for(let j=0;j<32;j++){state.rankA[r][j]+=.015*reward*b[r]*x[j];state.rankB[r][j]+=.015*reward*a[r]*x[j];}
   }
  }
  function emptyExcluded(){return {words:new Set(),ghost:new Set(),edit:new Set()};}
  function select(pool,state,request,name,options,excluded,now,step){
   const builtin=['static','frequency','contextual','tutor-none','tutor-terms','tutor-wording','tutor-symbols',
    'tutor-terms-wording','tutor-terms-symbols','tutor-wording-symbols','tutor-all'].includes(name);
   if(builtin)return selectWritingAidPool(pool,name==='static'?undefined:state.model,excluded,now,
    {...options,strategy:name==='frequency'?'frequency':'contextual'});
   const model=trained.models[name];
   const order=(items,surface)=>items.map((p,i)=>{
    const x=features(request,p,i);let score=scoreWritingAidProposal(state.model,p,now);
    if(name==='random')score=draw(request.target.scopeKey,step,surface,i,p.label,'random');
    else if(name==='online-rank4')score+=dot(state.rankA.map(w=>dot(w,x)),state.rankB.map(w=>dot(w,x)));
    else if(model)score+=infer(model,x);
    else if(name==='tutor-prompt-first')score+=.8*x[10]+.2*x[11];
    else if(name==='tutor-given-first')score+=.2*x[10]+.8*x[11];
    else if(name==='tutor-repeat')score+=.8*(x[25]+x[26]+x[27]);
    else if(name==='tutor-learner')score+=.8*x[16]+.2*x[11];
    return {p,i,score};}).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.p);
   const ranked={words:order(pool.words,'words'),ghost:order(pool.ghost,'ghost'),edit:order(pool.edit,'edit')};
   return selectWritingAidPool(ranked,undefined,excluded,now,{terms:false,wording:false,symbols:false});
  }
  function unsafe(p,row,request){
   const evidence=p.tutorEvidence;
   if(evidence){
    const signal=row.tutorContext?.signals?.find(x=>x.id===evidence.signalId);
    if(['proof','solution','hint','unknown'].includes(evidence.role)||signal?.id?.endsWith('-s')||
      (row.contextVariant==='wrong-wording'&&signal?.id?.endsWith('-w')))return true;
    if(evidence.matchedCharacters<0||p.insert.length>evidence.maxOutputCharacters||
      (p.insert.match(/[\p{L}\p{M}]+/gu)||[]).length>evidence.maxOutputWords)return true;
   }
   if(p.kind==='ghost'&&mathRisk(p.insert))return true;
   if(p.kind==='ghost'&&/\b(?:triangle|pigeonhole|contrapositive|invariant|descent|witness|counting|diagram chase|induction|contradiction)\b/iu.test(p.insert))return true;
   const owned=request.anchor?.text.slice(request.anchor.start)??'';
   const ownedNames=new Set(owned.match(/[\p{L}\p{N}_]+/gu)??[]);
   if((p.insert.match(/[\p{L}\p{N}_]+/gu)??[]).some(x=>/^[XYZ]$/u.test(x)&&!ownedNames.has(x)))return true;
   if(p.kind==='word'&&mathRisk(p.label)){
    const n=p.before.length,total=p.label.length;if(n<5||n/Math.max(1,total)<.8)return true;
   }
   return false;
  }
  function initialCounters(){return {word:{exposed:0,accepted:0,manualCharsBefore:0,manualUnitsBefore:0,remainingChars:0,taps:0},
    ghost:{exposed:0,accepted:0,manualCharsBefore:0,manualUnitsBefore:0,remainingChars:0,taps:0},
    correction:{exposed:0,accepted:0,manualCharsBefore:0,manualUnitsBefore:0,remainingChars:0,taps:0},
    replace:{exposed:0,accepted:0,manualCharsBefore:0,manualUnitsBefore:0,remainingChars:0,taps:0}};}
  function units(chunks){return chunks.reduce((n,s)=>n+(s.match(/\S+/gu)||[]).length,0);}
  function runModel(name,rows,mode='balanced'){
   const states=new Map(),records=[],latencies=[];let unsafeExamples=[];
   for(const row of rows){
    const state=stateFor(states,row.user,name);state.name=name;
    const options=flags(name),context=Object.values(options).some(Boolean)?row.tutorContext:null;
    // Manual control sees the same spelling typo; notation uses a separate
    // best-case direct-symbol route with one keyboard-switch tap.
    const directRepair=name==='off'&&row.notationGoal;
    const sequence=directRepair?row.intent:row.manualText;
    const repairEnd=row.repair?row.manualText.indexOf(row.repair.source)+row.repair.source.length:-1;
    let cursor=padEdit(row.initial),anchor=null,pos=0,manual='',chunks=[''],manualCount=0,backspaces=0,taps=0,
      glances=0,ignoredLists=0,refreshes=0,badAccepts=0,retained=0,unsafeExposed=0,logicAccepted=0,visibleOracle=0,poolOracle=0,
      changedLists=0,priorList='',literalCorrections=0,manualRepair=0,autotyped=0,seenCandidates=0,recoverySeconds=0,extraRecoverySeconds=0;
    const surfaces=initialCounters(),editExclusions=new Map();let exposures=[];virtualNow=baseTime+row.time*DAY;
    const flush=()=>{const due=state.pending.filter(x=>x.at<=virtualNow);state.pending=state.pending.filter(x=>x.at>virtualNow);
      for(const item of due)update(state,item.signal,item.p,item.request,item.index,item.at);};
    while(pos<sequence.length){
     flush();const ch=sequence[pos++],next=padEdit(cursor.text+ch);
     anchor=advanceWritingAidAnchor(cursor,next,anchor);cursor=next;manualCount++;manual+=ch;chunks[chunks.length-1]+=ch;virtualNow+=400;
     if(ch==='ε'&&directRepair)taps++;
     if(name!=='off'&&anchor&&!anchor.continuation){
      const remaining=[];
      for(const entry of exposures){
       const p=entry.p;if(p.start<anchor.start||p.start>cursor.text.length)continue;
       const tail=cursor.text.slice(p.start);let signal=null;
       if(p.kind==='ghost'){
        const actual=tail.toLocaleLowerCase(),expected=p.insert.toLocaleLowerCase();
        const matches=actual.startsWith(expected),diverges=actual.length>=Math.min(5,expected.length)&&!expected.startsWith(actual)&&!matches;
        if(matches||diverges)signal=matches?'continued-match':'divergent';
       }else{
        const completed=tail.match(/^([\p{L}\p{M}]+)(?=[^\p{L}\p{M}])/u);
        if(completed)signal=completed[1].toLocaleLowerCase()===p.label.toLocaleLowerCase()?'continued-match':'divergent';
       }
       if(!signal)remaining.push(entry);else if(virtualNow-entry.seenAt>=300)update(state,signal,p,entry.request,entry.index,virtualNow);
      }
      exposures=remaining;
     }
     if(!/[\p{L}\p{M}]/u.test(ch)){
      const typed=(chunks.at(-1).match(/[\p{L}\p{M}]+(?=[^\p{L}\p{M}]*$)/u)||[])[0];
      if(typed&&typed.length>=4&&name!=='off'){
       recordWritingAidVocabulary(state.model,typed,virtualNow);
       updateWritingAidModel(state.model,'personal-use',{kind:'word',candidate:typed,previous:'',prefix:typed,mode},virtualNow);
      }
     }
     if(name==='off'){
      if(row.repair&&!directRepair&&pos===repairEnd&&cursor.text.endsWith(row.repair.source)){
       cursor=padEdit(cursor.text.slice(0,-row.repair.source.length)+row.repair.target);anchor=null;
       backspaces+=row.repair.source.length;manualCount+=row.repair.target.length;
       const symbolTap=row.notationGoal?1:0;taps+=symbolTap;
       const recovery=.4*(row.repair.source.length+row.repair.target.length)+.3*symbolTap;
       virtualNow+=recovery*1000;recoverySeconds+=recovery;chunks.push(row.repair.target);manualRepair++;
      }
      continue;
     }
     const request={cursor,anchor,mode,composing:false,readOnly:false,
      target:{scopeKey:row.id,mountId:'replay',editorRevision:pos,selectionRevision:pos,modeRevision:0},tutorContext:context};
     const started=performance.now();const pool=predictWritingAidPool(request,state.model,options);
     for(const [key,entry] of editExclusions)if(cursor.text.slice(0,entry.end)!==entry.prefix)editExclusions.delete(key);
     let excluded=emptyExcluded();for(const key of editExclusions.keys())excluded.edit.add(key);
     let shown=select(pool,state,request,name,options,excluded,virtualNow,pos);
     latencies.push(performance.now()-started);
     let visible=[...shown.words,...(shown.ghost?[shown.ghost]:[]),...(shown.edit?[shown.edit]:[])];
     const observe=items=>{for(const p of items)if(p.kind==='word'||p.kind==='ghost'){
       const key=JSON.stringify([p.kind,p.start,p.insert.toLocaleLowerCase()]);
       if(!exposures.some(x=>x.key===key))exposures.push({p,key,request,index:0,seenAt:virtualNow});
      }if(exposures.length>24)exposures=exposures.slice(-24);};
     observe(visible);
     const listKey=visible.map(p=>`${p.kind}:${p.label}`).join('|');
     const newList=Boolean(listKey&&listKey!==priorList);priorList=listKey;
     if(newList){glances++;changedLists++;}
     for(const p of visible){surfaces[p.kind].exposed++;seenCandidates++;if(unsafe(p,row,request)){unsafeExposed++;
      if(unsafeExamples.length<20)unsafeExamples.push({case:row.id,kind:p.kind,label:p.label,before:p.before,evidence:p.tutorEvidence});}}
     const consider=p=>{const after=applyWritingAidProposal(request,p);if(!after||after.text===cursor.text||!row.intent.startsWith(after.text))return null;
       if(after.text.startsWith(cursor.text)){
        const suffix=after.text.slice(cursor.text.length);if(!sequence.slice(pos).startsWith(suffix))return null;
        return {p,after,skip:suffix.length};
       }
       return ['replace','correction'].includes(p.kind)?{p,after,skip:0}:null;};
     if([...pool.words,...pool.ghost,...pool.edit].some(consider))poolOracle++;
     let possible=visible.map(consider).filter(Boolean);if(possible.length)visibleOracle++;
     let acceptedThisEvent=false,refreshedThisEvent=false;
     // A simulated learner can ask for other visible choices when none match;
     // this decision uses the learner's intent, never the engine's inputs.
     if(!possible.length&&visible.length&&draw(row.id,pos,'refresh')<.12){
      const keys={word:'words',ghost:'ghost',replace:'edit',correction:'edit'};
      for(const p of visible){const key=writingAidProposalKey(p);excluded[keys[p.kind]].add(key);update(state,'refresh',p,request,0,virtualNow);
       if(p.kind==='correction'||p.kind==='replace')editExclusions.set(key,{end:p.end,prefix:cursor.text.slice(0,p.end)});}
      exposures=[];
      const replacement=select(pool,state,request,name,options,excluded,virtualNow,pos);
      const nextVisible=[...replacement.words,...(replacement.ghost?[replacement.ghost]:[]),...(replacement.edit?[replacement.edit]:[])];
      refreshes++;taps++;virtualNow+=300;glances++;refreshedThisEvent=Boolean(nextVisible.length);
      for(const p of nextVisible){surfaces[p.kind].exposed++;seenCandidates++;if(unsafe(p,row,request)){unsafeExposed++;
       if(unsafeExamples.length<20)unsafeExamples.push({case:row.id,kind:p.kind,label:p.label,before:p.before,evidence:p.tutorEvidence});}}
      visible=nextVisible;observe(visible);possible=visible.map(consider).filter(Boolean);
     }
     if(possible.length&&draw(row.id,pos,'accept')<.45){
      acceptedThisEvent=true;
      let choice=possible[0],wrong=false;
      if(visible.length>1&&draw(row.id,pos,'misclick')<.03){
       const wrongP=visible.find(p=>!consider(p));if(wrongP){const after=applyWritingAidProposal(request,wrongP);if(after){choice={p:wrongP,after,skip:0};wrong=true;}}
      }
      const p=choice.p,oldCursor=cursor,oldAnchor=anchor;
      exposures=[];
      update(state,'accept',p,request,0,virtualNow);
      for(const other of visible)if(other!==p)update(state,'alternate',other,request,0,virtualNow);
      taps++;virtualNow+=300;surfaces[p.kind].accepted++;surfaces[p.kind].manualCharsBefore+=manualCount;
      surfaces[p.kind].manualUnitsBefore+=units(chunks);surfaces[p.kind].remainingChars+=Math.max(0,choice.after.text.length-cursor.text.length);
      surfaces[p.kind].taps++;
      if(wrong){badAccepts++;if(mathRisk(p.label)||mathRisk(p.insert))logicAccepted++;
       if(p.kind==='correction'||p.kind==='replace')literalCorrections++;
       const noise=draw(row.id,pos,'undo');
       if(noise<.85){update(state,'undo',p,request,0,virtualNow+1000);taps++;virtualNow+=1000;recoverySeconds+=1;extraRecoverySeconds+=.7;cursor=oldCursor;anchor=oldAnchor;}
       else if(noise<.95){update(state,'partial-edit',p,request,0,virtualNow+1000);taps++;virtualNow+=1000;recoverySeconds+=1;extraRecoverySeconds+=.7;cursor=oldCursor;anchor=oldAnchor;}
       else{cursor=choice.after;anchor=null;retained++;chunks.push('');state.pending.push({at:virtualNow+3000,signal:'kept',p,request,index:0});}
      }else{
       cursor=choice.after;pos+=choice.skip;autotyped+=choice.skip;
       anchor=p.kind==='word'?continueWritingAidAnchor(oldAnchor,p,cursor):null;
       chunks.push('');state.pending.push({at:virtualNow+3000,signal:'kept',p,request,index:0});
      }
     }
     if(newList&&!acceptedThisEvent)ignoredLists++;
     if(refreshedThisEvent&&!acceptedThisEvent)ignoredLists++;
     // The unaided baseline types the intended spelling/symbol directly. An
     // unsuccessful alias path pays backspaces and manual re-entry.
     if(row.repair&&!directRepair&&pos===repairEnd&&cursor.text.endsWith(row.repair.source)){
      cursor=padEdit(cursor.text.slice(0,-row.repair.source.length)+row.repair.target);anchor=null;
      backspaces+=row.repair.source.length;manualCount+=row.repair.target.length;
      const symbolTap=row.notationGoal?1:0;taps+=symbolTap;
      const recovery=.4*(row.repair.source.length+row.repair.target.length)+.3*symbolTap;
      virtualNow+=recovery*1000;recoverySeconds+=recovery;chunks.push(row.repair.target);manualRepair++;
     }
    }
    flush();const correct=cursor.text===row.intent;
    const bytes=JSON.stringify(state.model).length+(trained.models[name]?JSON.stringify(trained.models[name]).length:0)+
      (name==='online-rank4'?JSON.stringify([state.rankA,state.rankB]).length:0);
    records.push({id:row.id,user:row.user,step:row.step,kind:row.kind,truth:row.truth,regime:row.step===0?'cold':row.step<6?'regular':'shifted',
      targetChars:row.intent.length,manualChars:manualCount,manualUnits:units(chunks),backspaces,taps,glances,ignoredLists,changedLists,refreshes,
      correct,badAccepts,retained,unsafeExposed,logicAccepted,literalCorrections,manualRepair,autotyped,visibleOracle,poolOracle,seenCandidates,
      surfaces,bytes,recoverySeconds,extraRecoverySeconds});
   }
   latencies.sort((a,b)=>a-b);return {records,unsafeExamples,latency:{n:latencies.length,
    median:latencies.length?latencies[Math.floor(latencies.length*.5)]:null,p95:latencies.length?latencies[Math.floor(latencies.length*.95)]:null}};
  }
  function aggregate(run){
   const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
   const byRegime={};
   for(const regime of ['cold','regular','shifted','all']){
    const rows=run.records.filter(r=>regime==='all'||r.regime===regime),chars=sum(rows,'targetChars'),manual=sum(rows,'manualChars'),
      actions=sum(rows,'taps'),back=sum(rows,'backspaces'),glances=sum(rows,'glances');
    const seconds=manual*.4+back*.4+actions*.3+sum(rows,'extraRecoverySeconds');
    byRegime[regime]={tasks:rows.length,targetChars:chars,manualChars:manual,manualWordlikeUnits:sum(rows,'manualUnits'),
      backspaces:back,taps:actions,refreshes:sum(rows,'refreshes'),shownLists:glances,ignoredLists:sum(rows,'ignoredLists'),
      correctDrafts:rows.filter(r=>r.correct).length,badAccepts:sum(rows,'badAccepts'),retained:sum(rows,'retained'),
      unsafeExposed:sum(rows,'unsafeExposed'),logicAccepted:sum(rows,'logicAccepted'),literalCorrections:sum(rows,'literalCorrections'),
      manualRepair:sum(rows,'manualRepair'),visibleMatchingEvents:sum(rows,'visibleOracle'),
      oraclePoolMatchingEvents:sum(rows,'poolOracle'),recoverySeconds:sum(rows,'recoverySeconds'),
      wpm0:chars/5/(seconds/60),wpm40:chars/5/((seconds+glances*.04)/60),wpm100:chars/5/((seconds+glances*.1)/60)};
   }
   const surface=initialCounters();for(const row of run.records)for(const k of Object.keys(surface))for(const key of Object.keys(surface[k]))surface[k][key]+=row.surfaces[k][key];
   return {byRegime,surfaces:surface,latency:run.latency,meanBytes:run.records.reduce((a,r)=>a+r.bytes,0)/Math.max(1,run.records.length),
    unsafeExamples:run.unsafeExamples,records:run.records};
  }
  try{
   if(phase==='validation'){
    const validation={};for(const entry of manifest.candidates)validation[entry.id]=aggregate(runModel(entry.id,cases));
    const safetyFailure=safety.summary.validation.actualTutorLeaks>0||safety.summary.validation.overBudget>0;
    const safe=manifest.candidates.filter(entry=>{const x=validation[entry.id].byRegime.all;
     const contextEnabled=entry.contextFlags!=='none';return !x.unsafeExposed&&!x.logicAccepted&&(!safetyFailure||!contextEnabled);});
    if(!safe.length)throw Error('No safety-eligible candidate, including off');
    const best=Math.max(...safe.map(x=>validation[x.id].byRegime.all.wpm40));
    const ties=safe.filter(x=>best-validation[x.id].byRegime.all.wpm40<=.10)
      .sort((a,b)=>validation[a.id].meanBytes-validation[b.id].meanBytes||manifest.candidates.indexOf(a)-manifest.candidates.indexOf(b));
    return {winner:ties[0].id,selection:{bestValidationWpm40:best,eligible:safe.map(x=>x.id),tieThresholdWpm:.1,
      disqualified:manifest.candidates.filter(x=>!safe.includes(x)).map(x=>x.id),safetyFailure},validation};
   }
   const winner=frozen.winner,test={};for(const entry of manifest.candidates)test[entry.id]=aggregate(runModel(entry.id,cases));
   const modeSafety={};for(const mode of ['strict','fast'])modeSafety[mode]=aggregate(runModel(winner,cases,mode));
   return {winner,selection:frozen.selection,test,modeSafety};
  }finally{Date.now=actualDateNow;}
 },{base,cases:data.cases.filter(x=>x.split===phase),manifest,trained,phase,frozen,safety});
 result.scope='Chronological typing through the current production pool, synthetic behavior; validation-only selection, one held-out pass. No target enters candidate generation.';
 for(const [p,h] of Object.entries(trained.engineSources))if(await sha(p)!==h)throw Error(`${p} changed during evaluation`);
 if(await sha('scripts/tutor-writing-evaluate.mjs')!==evaluatorSha||await sha(`${dir}/models.json`)!==modelsSha)throw Error('Evaluator or model changed during evaluation');
 result.datasetSha256=trained.trainDatasetSha256;result.engineSources=trained.engineSources;
 result.manifestSha256=await sha(`${dir}/manifest.json`);result.evaluatorSha256=evaluatorSha;result.modelsSha256=modelsSha;result.safetySha256=safetySha;
 const output=phase==='validation'?'validation.json':'evaluation.json';
 await writeFile(`${dir}/${output}`,JSON.stringify(result)+'\n');
 console.log(JSON.stringify({phase,winner:result.winner,validationEligible:result.selection.eligible,
  metrics:phase==='validation'?result.validation[result.winner].byRegime.all:result.test[result.winner].byRegime.all}));
}finally{await browser.close();await server.close();}
