import { Context, insert, scoped, rpc } from './db.ts';
import { packet } from './packet.ts';
import { get, search, readPages } from './tools/read.ts';
import { proposePlan, startSession, saveProgress, proposeCards, endSession, createProject, proposals, decide } from './tools/write.ts';
import { createMcpHandler } from './deps.ts';
import { buildServer, TOOL_NAMES } from './server.ts';
export async function selftest(c:Context):Promise<any>{
  const steps:{name:string;ok:boolean;ms:number;detail?:string}[]=[];
  let subjectId:string|undefined,projectId:string|undefined,extraId:string|undefined;
  async function check(name:string,f:()=>Promise<void>){
    const begin=Date.now();
    try{await f();steps.push({name,ok:true,ms:Date.now()-begin})}
    catch(e){steps.push({name,ok:false,ms:Date.now()-begin,detail:e instanceof Error?e.message:String(e)});throw e}
  }
  let p:any,sessionCode='S1',planId:string|undefined;
  try{
    await check('fixtures',async()=>{
      const subject=await insert(c,'subjects',{name:'zz-selftest-'+Date.now(),glyph:'z',hue:'slate'});subjectId=subject.id;
      p=await insert(c,'projects',{subject_id:subjectId,slug:'zz-selftest-'+Date.now(),title:'Selftest',goal:'Study finite subcovers using a tiny book.',status:'planning'});
      projectId=p.id;
      const src=await insert(c,'sources',{project_id:p.id,title:'Selftest PDF',short:'selftest',filename:'selftest.pdf',page_count:2,status:'ready',has_text:true});
      await insert(c,'source_pages',{source_id:src.id,page:1,label:'1',body:'A finite subcover is a finite collection of open sets selected from the cover.'});
      await insert(c,'source_pages',{source_id:src.id,page:2,label:'2',body:'Every open cover of a compact space has a finite subcover.'});
    });
    await check('planning resume',async()=>{if(!(await packet(c,{project:p.slug})).includes('PLANNING'))throw Error('No planning packet')});
    await check('plan proposal and approval',async()=>{
      await proposePlan(c,{project:p.slug,checkpoints:[
        {title:'Cover basics',objective:'Define covers',criterion:'States a correct definition unaided',steps:['Define cover','Give example']},
        {title:'Compactness',objective:'Use covers',criterion:'Proves a finite subcover result',steps:['Choose cover','Prove finite subcover'],prereqs:[1]},
        {title:'Applications',objective:'Apply theorem',criterion:'Constructs a correct example',steps:['Find example','Explain'],prereqs:[2]}
      ]});
      const {data}=await scoped(c,'proposals').eq('project_id',p.id).eq('kind','plan').eq('status','pending').maybeSingle();
      if(!data)throw Error('No plan proposal');
      planId=data.id;await rpc(c,'approve_proposal',{p_id:planId});
      const {data:active}=await scoped(c,'projects').eq('id',p.id).maybeSingle();
      if(active?.status!=='active')throw Error('Plan not active');
    });
    await check('study resume bounds',async()=>{
      const s=await packet(c,{project:p.slug});
      if(!s.includes('NOW CP1')||!s.includes('RULES')||s.length>2400)throw Error('Study packet invalid');
    });
    await check('session reuse',async()=>{
      const a={project:p.slug,checkpoint:'CP1',goal:'Learn open covers',client:'other'};
      if(!(await startSession(c,a)).includes('started S1'))throw Error('Session creation failed');
      if(!(await startSession(c,a)).includes('continuing S1'))throw Error('Session reuse failed');
    });
    await check('progress and misconception',async()=>{
      await saveProgress(c,{project:p.slug,session:sessionCode,step:2,events:[{kind:'hint',text:'Start with the definition.',hint_level:1}],misconception:'cover vs subcover',next_question:'Why finite?'});
      const detail=await get(c,{what:'checkpoint',project:p.slug,id:'CP1'});
      if(!detail.includes('hint L1'))throw Error('Hint missing');
      if(!(await packet(c,{project:p.slug})).includes('FIX cover vs subcover'))throw Error('Misconception missing');
    });
    await check('PDF reads and search',async()=>{
      if(!(await search(c,{project:p.slug,query:'finite subcover'})).includes('selftest p.'))throw Error('Search failed');
      if(!(await readPages(c,{project:p.slug,from:'1',pdf:true})).includes('finite subcover'))throw Error('PDF read failed');
    });
    await check('card proposals and direct card',async()=>{
      await proposeCards(c,{project:p.slug,session:sessionCode,cards:[{front:'Define open cover',back:'A family of open sets.'},{front:'Define compactness',back:'Every open cover has a finite subcover.'}]});
      await proposeCards(c,{project:p.slug,session:sessionCode,direct:true,cards:[{front:'What is a subcover?',back:'A subfamily that still covers.'}]});
      const {data}=await scoped(c,'notes').eq('project_id',p.id);
      if(data?.length!==1)throw Error('Direct card not inserted');
    });
    await check('end session',async()=>{
      if(!(await endSession(c,{project:p.slug,session:sessionCode,summary:'Studied covers.',goal_met:'yes'})).includes('closed S1'))throw Error('No closed session');
    });
    await check('create, list and decide',async()=>{
      const title='zz-selftest extra '+Date.now();
      const r=await createProject(c,{title,subject:'zz-selftest-'+Date.now(),goal:'Demo goal'});
      const slug=r.match(/^created (\S+)/)?.[1];
      if(!slug)throw Error('Project creation failed');
      const {data:newP}=await scoped(c,'projects').eq('slug',slug).maybeSingle();extraId=newP?.id;
      const lines=await proposals(c,{project:p.slug});
      if(!lines.includes('P'))throw Error('Pending proposals invisible');
      const {data:pending}=await scoped(c,'proposals').eq('project_id',p.id).eq('status','pending').eq('kind','card').order('no').limit(1);
      if(!pending?.length)throw Error('Missing pending card');
      const answer=await decide(c,{approve:[pending[0].no]});
      if(!answer.includes('approved P'))throw Error(answer);
    });
    await check('MCP tool list and size',async()=>{
      const handler=createMcpHandler(()=>buildServer(c));
      const req=new Request('http://localhost/mcp',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
      const res=await handler.fetch(req),body=await res.text();
      let payload:any;
      if(body.startsWith('event:')){const line=body.split('\n').find((s:string)=>s.startsWith('data: '));payload=JSON.parse(line?.slice(6)||'{}')}
      else payload=JSON.parse(body);
      const list=payload.result?.tools;
      if(!list||list.length!==14||TOOL_NAMES.some(n=>!list.some((x:any)=>x.name===n)))throw Error('Not all 14 tools registered');
      const chars=JSON.stringify({tools:list}).length;
      if(chars>10500)throw Error('tools/list too large: '+chars);
    });
  }catch{/* Every failure is recorded in steps. */}finally{
    // All deletions are by the owner and the exact throwaway IDs.
    for(const id of [extraId,projectId])if(id)await c.db.from('projects').delete().eq('user_id',c.userId).eq('id',id);
    if(subjectId)await c.db.from('subjects').delete().eq('user_id',c.userId).eq('id',subjectId);
    // An extra subject was generated with its own name; remove only zz-selftest subjects without projects.
    // If it has a project, its FK prevents deletion; never remove real owner data.
    const {data:extra}=await scoped(c,'subjects').like('name','zz-selftest-%').limit(100);
    for(const s of extra||[])if(s.id!==subjectId)await c.db.from('subjects').delete().eq('user_id',c.userId).eq('id',s.id);
  }
  return {ok:steps.length===11&&steps.every(x=>x.ok),steps};
}