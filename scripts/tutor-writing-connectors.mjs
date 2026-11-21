// Fresh post-fix stress corpus, independent of the earlier main replay.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const dir='docs/implementation/2026-11-21/writing-aid-tutor';
const families=[
 ['fresh-metric','I believe the distance is clear.'],['fresh-order','I begin with the ordering.'],
 ['fresh-logic','I decide whether the wording is clear.'],['fresh-measure','I consider the size again.'],
 ['fresh-colour','I describe the colour of the diagram.'],['fresh-orbit','I see the orbit in my notes.'],
 ['fresh-graph','I think about the graph.'],['fresh-topology','I understand the topology now.'],
 ['fresh-geometry','I follow the illustration.'],['fresh-analysis','I would like another explanation.'],
 ['fresh-infimum','I believe the infimum is zero.'],['fresh-degree','I believe the vertex has degree two.'],
 ['fresh-equivalence','I believe the relation is reflexive.'],['fresh-quotient','I believe the quotient is trivial.'],
 ['fresh-reason','I think because the sample is small.'],
 ['fresh-operand-a','My choices are X and Y. I choose '],['fresh-operand-b','Let X and Y be labels. The next value is '],
];
const cases=families.map(([family,intent],i)=>({id:`connector-fresh-user-${i}`,user:`fresh-user-${i}`,family,intent,
 tutorContext:{version:1,revision:`fresh-${i}`,signals:[
  {id:`fresh-${i}-given`,sourceId:`fresh-${i}-reply`,role:'given',text:'The choices are X and Y.',variables:['X','Y'],symbols:['≤']},
  {id:`fresh-${i}-solution`,sourceId:`fresh-${i}-reply`,role:'solution',text:'Because X is chosen, therefore Y is excluded.',variables:['X','Y'],symbols:['⇒']}
 ]}}));
const digest=p=>createHash('sha256').update(p).digest('hex');
const engineSha=digest(await readFile('src/features/tutor/writingAid/engine.ts'));
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error',clearScreen:false});await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}${server.config.base}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(base);
 const result=await page.evaluate(async({base,cases})=>{
  const {predictWritingAidPool,selectWritingAidPool}=await import(new URL('src/features/tutor/writingAid/engine.ts',base).href);
  const {padEdit}=await import(new URL('src/features/pad/padEdit.ts',base).href);
  const connector=/^(?:because|therefore|hence|unless|although|otherwise|since|thus|consequently|implies|only|whereas|however|if|then|or|and|not|while)$/iu;
  const results={};
  for(const mode of ['balanced','fast','strict']){
   let steps=0,weakConnector=0,untypedVariable=0,sourceLeak=0;const examples=[];
   for(const row of cases)for(let pos=1;pos<=row.intent.length;pos++){
    const text=row.intent.slice(0,pos),request={cursor:padEdit(text),anchor:{text,start:0},mode,composing:false,readOnly:false,
      target:{scopeKey:row.id,mountId:'fresh-stress',editorRevision:pos,selectionRevision:pos,modeRevision:0},tutorContext:row.tutorContext};
    const pool=predictWritingAidPool(request),shown=selectWritingAidPool(pool),items=[...shown.words,...(shown.ghost?[shown.ghost]:[]),...(shown.edit?[shown.edit]:[])];steps++;
    for(const p of items){
     const prefix=p.before||'',weak=p.kind==='word'&&connector.test(p.label)&&(prefix.length<5||prefix.length/Math.max(1,p.label.length)<.8);
     const names=p.insert.match(/[\p{L}\p{N}_]+/gu)||[],owned=new Set(text.match(/[\p{L}\p{N}_]+/gu)||[]);
     const variable=names.some(x=>/^[XYZ]$/u.test(x)&&!owned.has(x));
     const leak=p.tutorEvidence&&['proof','solution','hint','unknown'].includes(p.tutorEvidence.role);
     weakConnector+=Number(weak);untypedVariable+=Number(variable);sourceLeak+=Number(Boolean(leak));
     if((weak||variable||leak)&&examples.length<20)examples.push({case:row.id,pos,label:p.label,before:p.before,weak,variable,leak:Boolean(leak)});
    }
   }
   results[mode]={steps,weakConnector,untypedVariable,sourceLeak,examples};
  }
  results.strongStem={};
  for(const mode of ['balanced','fast','strict']){
   const text='I becaus',request={cursor:padEdit(text),anchor:{text,start:0},mode,composing:false,readOnly:false,
    target:{scopeKey:'fresh-strong-stem',mountId:'fresh-stress',editorRevision:1,selectionRevision:1,modeRevision:0}};
   results.strongStem[mode]=predictWritingAidPool(request).words.some(p=>p.label.toLocaleLowerCase()==='because');
  }
  return results;
 },{base,cases});
 const output={scope:'Fresh synthetic users, prefixes and family labels after the Fast connector fix; typed-prefix replay, no model selection.',engineSha256:engineSha,
  cases,result};
 await writeFile(`${dir}/fresh-connectors.json`,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();await server.close();}
