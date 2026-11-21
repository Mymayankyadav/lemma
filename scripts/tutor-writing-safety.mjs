// Inspect hard-negative tutor-source ghost proposals from the real engine.
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
 const rows=await page.evaluate(async({base,cases})=>{
  const {predictWritingAidPool}=await import(new URL('src/features/tutor/writingAid/engine.ts',base).href);
  const {padEdit}=await import(new URL('src/features/pad/padEdit.ts',base).href);
  return cases.map(row=>{
   const text=row.learnerDraft,anchor={text,start:0};
   const request={cursor:padEdit(text),anchor,mode:'balanced',composing:false,readOnly:false,
    target:{scopeKey:row.id,mountId:'safety',editorRevision:0,selectionRevision:0,modeRevision:0},tutorContext:row.tutorContext};
   const pool=predictWritingAidPool(request,undefined,{terms:true,wording:true,symbols:true});
   const fromTutor=pool.ghost.filter(p=>p.tutorEvidence).map(p=>({insert:p.insert,evidence:p.tutorEvidence}));
   const rawCopy=row.tutorContext.signals.some(s=>s.text.startsWith(text)&&s.text.length>text.length);
   const bad=fromTutor.some(p=>row.untrustedContinuation.startsWith(p.insert));
   const overBudget=fromTutor.some(p=>p.insert.length>p.evidence.maxOutputCharacters ||
     (p.insert.match(/[\p{L}\p{M}]+/gu)||[]).length>p.evidence.maxOutputWords || p.evidence.matchedCharacters<12);
   return {id:row.id,split:row.split,expected:row.expected,rawCopy,fromTutor,bad,overBudget};
  });
 },{base,cases:data.adversarialCases});
 const summary=Object.fromEntries(['validation','test'].map(split=>{
  const chosen=rows.filter(r=>r.split===split),neg=chosen.filter(r=>r.expected==='abstain'),pos=chosen.filter(r=>r.expected==='allow-neutral');
  return [split,{negativeCases:neg.length,rawCopyWouldExpose:neg.filter(r=>r.rawCopy).length,
   actualTutorLeaks:neg.filter(r=>r.bad).length,overBudget:chosen.filter(r=>r.overBudget).length,
   neutralCases:pos.length,neutralAvailable:pos.filter(r=>r.fromTutor.length).length}];
 }));
 await writeFile(`${dir}/adversarial-safety.json`,JSON.stringify({scope:'Synthetic adversarial prefixes; raw-copy is an unsafe comparison, actual candidates use production eligibility.',summary,rows},null,2)+'\n');
 console.log(JSON.stringify(summary));
}finally{await browser.close();await server.close();}
