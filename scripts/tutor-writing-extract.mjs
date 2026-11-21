// Extract *training* features from every chronologically typed prefix using the
// real runtime pool; labels come from training intent only after generation.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const dir='docs/implementation/2026-11-21/writing-aid-tutor';
const data=JSON.parse(await readFile(`${dir}/dataset.json`,'utf8'));
const sourcePaths=['src/features/tutor/writingAid/engine.ts','src/features/tutor/writingAid/policy.ts',
 'src/features/tutor/writingAid/tutorContext.ts','src/features/tutor/writingAid/learning.ts','scripts/tutor-writing-kernel.mjs'];
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const sources=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,await sha(path)])));
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error',clearScreen:false});
await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}${server.config.base}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto(base);
 const result=await page.evaluate(async ({base,cases,typos})=>{
   const {predictWritingAidPool}=await import(new URL('src/features/tutor/writingAid/engine.ts',base).href);
   const {advanceWritingAidAnchor,applyWritingAidProposal}=await import(new URL('src/features/tutor/writingAid/policy.ts',base).href);
   const {padEdit}=await import(new URL('src/features/pad/padEdit.ts',base).href);
   const {features}=await import(new URL('scripts/tutor-writing-kernel.mjs',base).href);
   const output=[];let steps=0;
   const target=(id,revision)=>({scopeKey:id,mountId:'train',editorRevision:revision,selectionRevision:revision,modeRevision:0});
   for(const row of cases) {
     let cursor=padEdit(row.initial),anchor=null;
     for(const ch of row.manualText) {
       const next=padEdit(cursor.text+ch);anchor=advanceWritingAidAnchor(cursor,next,anchor);cursor=next;steps++;
       const request={cursor,anchor,mode:'balanced',composing:false,readOnly:false,target:target(row.id,steps),tutorContext:row.tutorContext};
       const pool=predictWritingAidPool(request,undefined,{terms:true,wording:true,symbols:true});
       const items=[...pool.words,...pool.ghost,...pool.edit];
       for(let i=0;i<items.length;i++) {
         const proposal=items[i],after=applyWritingAidProposal(request,proposal);
         if(!after)continue;
         const positive=after.text!==cursor.text && row.intent.startsWith(after.text) &&
           (after.text.length>cursor.text.length || proposal.kind==='replace' || proposal.kind==='correction');
         output.push({id:row.id,group:`${row.id}/${steps}`,x:features(request,proposal,i),y:Number(positive),kind:proposal.kind});
       }
     }
   }
   for(const row of typos) {
     const cursor=padEdit(row.draft), anchor={text:row.draft,start:0};
     const request={cursor,anchor,mode:'balanced',composing:false,readOnly:false,target:target(row.id,steps++)};
     const pool=predictWritingAidPool(request,undefined,{terms:true,wording:true,symbols:true});
     const items=pool.edit;
     for(let i=0;i<items.length;i++) {
       const proposal=items[i],after=applyWritingAidProposal(request,proposal);if(!after)continue;
       output.push({id:row.id,group:row.id,x:features(request,proposal,i),
         y:Number(after.text===row.intent && row.shouldChange),kind:proposal.kind});
     }
   }
   return {examples:output,steps,positive:output.filter(x=>x.y).length,
     byKind:Object.fromEntries(['word','ghost','correction','replace'].map(k=>[k,output.filter(x=>x.kind===k).length]))};
 },{base,cases:data.cases.filter(x=>x.split==='train'),typos:data.typoCases.filter(x=>x.split==='train')});
 for(const [path,expected] of Object.entries(sources))if(await sha(path)!==expected)throw new Error(`${path} changed during extraction`);
 const artifact={version:1,scope:'Training split only. The pool is generated before labels are computed; no future text reaches features.',
   datasetSha256:await sha(`${dir}/dataset.json`),sources,...result};
 await writeFile(`${dir}/train-features.json`,JSON.stringify(artifact)+'\n');
 console.log(JSON.stringify({steps:result.steps,examples:result.examples.length,positive:result.positive,byKind:result.byKind}));
} finally {await browser.close();await server.close();}
