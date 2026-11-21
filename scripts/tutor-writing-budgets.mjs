// Secondary validation-only source/input/output-budget sensitivity. It does not
// change the preregistered 24-candidate selection or touch held-out trajectories.
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const dir='docs/implementation/2026-11-21/writing-aid-tutor';
const data=JSON.parse(await readFile(`${dir}/dataset.json`,'utf8'));
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error',clearScreen:false});await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}${server.config.base}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(base);
 const result=await page.evaluate(async({base,cases})=>{
  const {predictWritingAidPool}=await import(new URL('src/features/tutor/writingAid/engine.ts',base).href);
  const {applyWritingAidProposal}=await import(new URL('src/features/tutor/writingAid/policy.ts',base).href);
  const {padEdit}=await import(new URL('src/features/pad/padEdit.ts',base).href);
  const {mathRisk}=await import(new URL('scripts/tutor-writing-kernel.mjs',base).href);
  const rows=[];
  for(const learner of [8,16,32,1024])for(const count of [0,1,4,12])for(const outputWords of [2,6]){
   const times=[];let calls=0,inputChars=0,inputUnits=0,tutorChars=0,tutorSignals=0,wordEvents=0,ghostEvents=0,editEvents=0,
     displayedWords=0,ghostChars=0,matchingEvents=0,unsafe=0;
   for(const row of cases){
    const signals=(row.tutorContext?.signals??[]).slice(0,count);
    const context=count?{...row.tutorContext,signals}:null;
    for(let pos=1;pos<=row.manualText.length;pos++){
     const text=row.manualText.slice(0,pos),tokens=[...text.matchAll(/\S+/gu)];
     const start=learner===1024?Math.max(0,text.length-1024):(tokens.length>learner?tokens[tokens.length-learner].index:0);
     const anchor={text,start},request={cursor:padEdit(text),anchor,mode:'balanced',composing:false,readOnly:false,
      target:{scopeKey:row.id,mountId:'budget',editorRevision:pos,selectionRevision:pos,modeRevision:0},tutorContext:context};
     const started=performance.now();const pool=predictWritingAidPool(request,undefined,{terms:true,wording:true,symbols:true});
     times.push(performance.now()-started);calls++;const authored=text.slice(start);
     inputChars+=authored.length;inputUnits+=(authored.match(/\S+/gu)||[]).length;
     tutorChars+=signals.reduce((n,s)=>n+s.text.length,0);tutorSignals+=signals.length;
     if(pool.words.length)wordEvents++;if(pool.ghost.length)ghostEvents++;if(pool.edit.length)editEvents++;
     displayedWords+=Math.min(1,pool.words.length);
     const items=[...pool.words,...pool.ghost,...pool.edit];
     if(items.some(p=>{const after=applyWritingAidProposal(request,p);return after&&after.text!==text&&row.intent.startsWith(after.text)}))matchingEvents++;
     for(const p of pool.ghost){
      const spans=[...p.insert.matchAll(/\S+/gu)];const capped=spans.length>outputWords?p.insert.slice(0,spans[outputWords-1].index+spans[outputWords-1][0].length):p.insert;
      ghostChars+=capped.length;
      const ev=p.tutorEvidence,signal=ev&&signals.find(s=>s.id===ev.signalId);
      if(mathRisk(capped)||(ev&&(['hint','proof','solution','unknown'].includes(ev.role)||signal?.id?.endsWith('-s')||
        row.contextVariant==='wrong-wording'&&signal?.id?.endsWith('-w'))))unsafe++;
     }
    }
   }
   times.sort((a,b)=>a-b);
   rows.push({learner,fragmentLimit:count,outputWordLimit:1,postPoolGhostWordLimit:outputWords,calls,
    meanLearnerChars:inputChars/calls,meanLearnerWordlikeUnits:inputUnits/calls,meanTutorChars:tutorChars/calls,
    meanTutorFragments:tutorSignals/calls,wordEvents,ghostEvents,editEvents,oneWordOutputs:displayedWords,ghostChars,
    oracleMatchingEvents:matchingEvents,unsafeGhostExposures:unsafe,
    medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)]});
  }
  return rows;
 },{base,cases:data.cases.filter(x=>x.split==='validation'&&x.user.endsWith('00')||x.split==='validation'&&x.user.endsWith('01'))});
 const artifact={scope:'Validation-only, all-manual teacher-forced prefixes through actual production pool. Ghost 2/6-word limits are hypothetical post-pool measurement, not configurable runtime policy; no UI edits or selection changes.',
  learnerContext:'8/16/32 word-like units or 1024 characters; whitespace units are not LLM tokens.',
  currentRuntimeLimits:{signals:12,charactersPerSignal:240,variablesOrSymbolsPerSignal:16,wordCandidatesDisplayed:3,ghostOutputWords:6,ghostOutputCharacters:64},rows:result};
 await writeFile(`${dir}/budgets.json`,JSON.stringify(artifact,null,2)+'\n');
 console.log(JSON.stringify({configs:result.length,calls:result.reduce((n,x)=>n+x.calls,0)}));
}finally{await browser.close();await server.close();}
