// Validation-only teacher-forced diagnostics for source-backed candidates.
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
  const {predictWritingAidPool,selectWritingAidPool}=await import(new URL('src/features/tutor/writingAid/engine.ts',base).href);
  const {applyWritingAidProposal}=await import(new URL('src/features/tutor/writingAid/policy.ts',base).href);
  const {padEdit}=await import(new URL('src/features/pad/padEdit.ts',base).href);
  const out={};
  for(const [name,options] of Object.entries({wordingOnly:{terms:false,wording:true,symbols:false},all:{terms:true,wording:true,symbols:true}})){
   const roles={},kinds={},casesWithSource=new Set(),casesWithVisibleSource=new Set(),casesWithMatchingSource=new Set();
   let steps=0,eligibleSource=0,visibleSource=0,matchingVisible=0;
   for(const row of cases)for(let pos=1;pos<=row.manualText.length;pos++){
    const text=row.manualText.slice(0,pos),request={cursor:padEdit(text),anchor:{text,start:0},mode:'balanced',
      composing:false,readOnly:false,target:{scopeKey:row.id,mountId:'provenance',editorRevision:pos,selectionRevision:pos,modeRevision:0},
      tutorContext:row.tutorContext};
    const pool=predictWritingAidPool(request,undefined,options),all=[...pool.words,...pool.ghost,...pool.edit];
    const selected=selectWritingAidPool(pool,undefined,undefined,1710000000000,options);
    const visible=[...selected.words,...(selected.ghost?[selected.ghost]:[]),...(selected.edit?[selected.edit]:[])];steps++;
    for(const p of all)if(p.tutorEvidence){eligibleSource++;casesWithSource.add(row.id);
      roles[p.tutorEvidence.role]=(roles[p.tutorEvidence.role]||0)+1;kinds[p.kind]=(kinds[p.kind]||0)+1;}
    for(const p of visible)if(p.tutorEvidence){visibleSource++;casesWithVisibleSource.add(row.id);const after=applyWritingAidProposal(request,p);
      if(after&&after.text!==text&&row.intent.startsWith(after.text)){matchingVisible++;casesWithMatchingSource.add(row.id);}}
   }
   out[name]={steps,eligibleSource,visibleSource,matchingVisible,roles,kinds,casesWithSource:casesWithSource.size,
     casesWithVisibleSource:casesWithVisibleSource.size,casesWithMatchingSource:casesWithMatchingSource.size};
  }
  return out;
 },{base,cases:data.cases.filter(x=>x.split==='validation')});
 await writeFile(`${dir}/provenance.json`,JSON.stringify({scope:'Validation-only all-manual teacher forcing with an empty model; counts are proposal events, not observed accepts or held-out outcomes.',result},null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{await browser.close();await server.close();}
