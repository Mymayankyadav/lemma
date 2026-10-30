import { Context, insert, scoped, rpc, commitBatch } from './db.ts';
import {setPrompt,history,undo,edit,add,remove,review,grade} from './tools/control.ts';
import { packet } from './packet.ts';
import { get, search, readPages } from './tools/read.ts';
import { proposePlan, startSession, saveProgress, proposeCards, endSession, createProject, proposals, decide } from './tools/write.ts';
import { createMcpHandler } from './deps.ts';
import { buildServer, TOOL_NAMES } from './server.ts';
export async function selftest(c:Context):Promise<any>{
  const steps:{name:string;ok:boolean;ms:number;detail?:string}[]=[];
  let subjectId:string|undefined,projectId:string|undefined,extraId:string|undefined,extraSubjectId:string|undefined;
  let extraSubjectName:string|undefined;
  async function check(name:string,f:()=>Promise<void>){
    const begin=Date.now();
    try{await f();steps.push({name,ok:true,ms:Date.now()-begin})}
    catch(e){steps.push({name,ok:false,ms:Date.now()-begin,detail:e instanceof Error?e.message:String(e)});throw e}
  }
  let p:any,sessionCode='S1',planId:string|undefined;
  const run=async(n:string,fn:any,a:any)=>{const tx={...c,batch:[] as any[]};const text=await fn(tx,a);return {...await commitBatch(tx,n,a,text),text};};
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
      const {data:before}=await scoped(c,'session_events','id').eq('session_id',(await scoped(c,'sessions').eq('project_id',p.id).eq('number',1).single()).data.id);
      let rolledBack=false;
      try {
        await saveProgress(c,{project:p.slug,session:sessionCode,step:1,
          events:[{kind:'hint',text:'should roll back',hint_level:1},{kind:'note',text:''}],
          next_question:'must not be saved'});
      } catch {rolledBack=true}
      const {data:after}=await scoped(c,'session_events','id').eq('session_id',(await scoped(c,'sessions').eq('project_id',p.id).eq('number',1).single()).data.id);
      const {data:current}=await scoped(c,'sessions','resume_question').eq('project_id',p.id).eq('number',1).single();
      if(!rolledBack || before?.length!==after?.length || current?.resume_question!=='Why finite?')
        throw Error('Atomic rollback failed');
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
      extraSubjectName='zz-selftest-'+Date.now();
      const r=await createProject(c,{title,subject:extraSubjectName,goal:'Demo goal'});
      const slug=r.match(/^created (\S+)/)?.[1];
      if(!slug)throw Error('Project creation failed');
      const {data:newP}=await scoped(c,'projects').eq('slug',slug).maybeSingle();extraId=newP?.id;extraSubjectId=newP?.subject_id;
      const lines=await proposals(c,{project:p.slug});
      if(!lines.includes('P'))throw Error('Pending proposals invisible');
      const {data:pending}=await scoped(c,'proposals').eq('project_id',p.id).eq('status','pending').eq('kind','card').order('no').limit(1);
      if(!pending?.length)throw Error('Missing pending card');
      const answer=await decide(c,{approve:[pending[0].no]});
      if(!answer.includes('approved P'))throw Error(answer);
    });
    await check('prompt history undo and redo',async()=>{
      const r=await run('set_prompt',setPrompt,{scope:p.slug,text:'Selftest Socratic prompt',mode:'replace'});
      if(!(await packet(c,{project:p.slug})).startsWith('OWNER'))throw Error('OWNER missing');
      if(!(await history(c,{})).startsWith('A'+r.action+' '))throw Error('Newest action missing');
      const u=await run('undo',undo,{action:r.action});
      if((await packet(c,{project:p.slug})).includes('Selftest Socratic prompt'))throw Error('Prompt undo failed');
      await run('undo',undo,{action:u.action});
      if(!(await packet(c,{project:p.slug})).includes('Selftest Socratic prompt'))throw Error('Prompt redo failed');
    });
    await check('direct edits add review grade',async()=>{
      await run('edit',edit,{target:p.slug,set:{title:'Edited selftest'}});
      await run('edit',edit,{project:p.slug,target:'CP1',set:{steps:['Think','Prove']}});
      const a=await run('add',add,{kind:'card',project:p.slug,fields:{front:'Selftest new card',back:'Answer'}});
      const note=a.created.find((x:any)=>x.table==='notes');if(!note)throw Error('Direct card missing');
      if(!(await review(c,{project:p.slug,count:10})).includes('N'+note.no+'.1'))throw Error('Review missing card');
      await run('grade',grade,{answers:[{card:'N'+note.no+'.1',rating:'good'}]});
      const nr=await scoped(c,'notes','id').eq('no',note.no).single();
      const cr=await scoped(c,'cards').eq('note_id',nr.data.id).single();if(cr.data?.reps!==1)throw Error('Grade failed');
    });
    await check('adaptive planning diagnostics',async()=>{
      const started=await run('start_session',startSession,{project:p.slug,goal:'Probe prerequisites',checkpoint:'CP1',client:'other'});
      const code=started.text.match(/S[0-9]+/)![0];
      for(let i=0;i<2;i++)await run('save_progress',saveProgress,{project:p.slug,session:code,diagnostics:[{kind:'gap',topic:'Selftest prerequisite',evidence:'Could not explain it',severity:3,confirmed:true}]});
      const d=await scoped(c,'diagnostics').eq('project_id',p.id).single();if(d.data?.times!==2)throw Error('Diagnostic sightings failed');
      if(!(await packet(c,{project:p.slug})).includes('ADAPT D'+d.data.no))throw Error('ADAPT missing');
    });
    await check('repeated new concept references and undo',async()=>{
      const name='Selftest repeated concept';
      const cp=(await scoped(c,'checkpoints').eq('project_id',p.id).eq('code','CP1').single()).data;
      const before=(await scoped(c,'checkpoint_concepts').eq('checkpoint_id',cp.id)).data||[];
      const action=await run('edit',edit,{project:p.slug,target:'CP1',set:{ideas:[name,name.toLowerCase(),name]}});
      const found=(await scoped(c,'concepts').eq('subject_id',p.subject_id).ilike('name',name)).data||[];
      if(found.length!==1)throw Error('Expected one canonical concept');
      const links=(await scoped(c,'checkpoint_concepts').eq('checkpoint_id',cp.id)).data||[];
      if(links.length!==1||links[0].concept_id!==found[0].id)throw Error('Expected one concept link');
      await run('undo',undo,{action:action.action});
      if((await scoped(c,'concepts').eq('id',found[0].id)).data?.length)throw Error('Concept survived undo');
      const restored=(await scoped(c,'checkpoint_concepts').eq('checkpoint_id',cp.id)).data||[];
      if(restored.length!==before.length||before.some((x:any)=>!restored.some((y:any)=>y.concept_id===x.concept_id)))throw Error('Original links not restored');
    });
    await check('delete preview cascade and undo',async()=>{
      const preview=await run('delete',remove,{target:p.slug,confirm:false});if(preview.action)throw Error('Preview wrote data');
      const r=await run('delete',remove,{target:p.slug,confirm:true});
      if((await scoped(c,'projects').eq('id',p.id)).data?.length)throw Error('Delete failed');
      await run('undo',undo,{action:r.action});
      if(!(await scoped(c,'projects').eq('id',p.id)).data?.length)throw Error('Cascade restore failed');
    });
    await check('MCP tool list and size',async()=>{
      const handler=createMcpHandler(()=>buildServer(c));
      const options={method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'}};
      const initialized=await handler.fetch(new Request('http://localhost/mcp',{...options,
        body:JSON.stringify({jsonrpc:'2.0',id:0,method:'initialize',params:{
          protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'lemma-selftest',version:'1.0.0'}
        }})}));
      if(!initialized.ok)throw Error('MCP initialize failed: '+initialized.status);
      const session=initialized.headers.get('Mcp-Session-Id');
      const headers={...options.headers,...(session?{'Mcp-Session-Id':session}:{})};
      const notified=await handler.fetch(new Request('http://localhost/mcp',{...options,headers,
        body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})}));
      if(!notified.ok)throw Error('MCP initialized notification rejected: '+notified.status);
      const req=new Request('http://localhost/mcp',{...options,headers,
        body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
      const res=await handler.fetch(req),body=await res.text();
      let payload:any;
      if(body.startsWith('event:')){const line=body.split('\n').find((s:string)=>s.startsWith('data: '));payload=JSON.parse(line?.slice(6)||'{}')}
      else payload=JSON.parse(body);
      const list=payload.result?.tools;
      if(!list||list.length!==22||TOOL_NAMES.some(n=>!list.some((x:any)=>x.name===n)))throw Error('Not all 22 tools registered');
      const chars=JSON.stringify({tools:list}).length;
      if(chars>15000)throw Error('tools/list too large: '+chars);
    });
  }catch{/* Every failure is recorded in steps. */}finally{
    // All deletions are by the owner and the exact throwaway IDs.
    for(const id of [extraId,projectId])if(id)await c.db.from('projects').delete().eq('user_id',c.userId).eq('id',id);
    if(subjectId)await c.db.from('subjects').delete().eq('user_id',c.userId).eq('id',subjectId);
    if(!extraSubjectId&&extraSubjectName){
      const {data:orphan}=await scoped(c,'subjects','id').eq('name',extraSubjectName).maybeSingle();
      extraSubjectId=orphan?.id;
    }
    if(extraSubjectId)await c.db.from('subjects').delete().eq('user_id',c.userId).eq('id',extraSubjectId);
  }
  return {ok:steps.length===16&&steps.every(x=>x.ok),steps};
}