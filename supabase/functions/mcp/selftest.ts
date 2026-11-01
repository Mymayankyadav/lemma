import { Context, insert, scoped, rpc, commitBatch } from './db.ts';
import {setPrompt,history,undo,edit,add,remove,review,grade} from './tools/control.ts';
import { packet } from './packet.ts';
import { get, search, readPages } from './tools/read.ts';
import { proposePlanChange, proposePlan, startSession, saveProgress, proposeCards, endSession, createProject, proposals, decide } from './tools/write.ts';
import { createMcpHandler } from './deps.ts';
import { savePages } from './tools/transcribe.ts';
import { buildServer, TOOL_NAMES } from './server.ts';
import { parseMcpReply } from './protocol.ts';
// Keep each self-test request below the Edge worker's observed wall-clock limit.
// The smoke runs four independent partitions with their own fixtures and cleanup.
export type SelftestPart=1|2|3|4|'all';
const PART_STEPS={1:6,2:9,3:8,4:5,all:19} as const;
export async function selftest(c:Context,part:SelftestPart='all'):Promise<any>{
  const only=(n:1|2|3|4)=>part==='all'||part===n;
  c.selftestProjectIds=new Set<string>();
  const steps:{name:string;ok:boolean;ms:number;detail?:string}[]=[];
  let subjectId:string|undefined,projectId:string|undefined,extraId:string|undefined,extraSubjectId:string|undefined;
  let extraSubjectName:string|undefined,extraTitle:string|undefined;
  const cleanupFailures:string[]=[];
  async function check(name:string,f:()=>Promise<void>){
    const begin=Date.now();
    // Static step names and elapsed times only: never log owner data or connector credentials.
    console.info('[lemma selftest] START '+name);
    try{
      await f();
      const ms=Date.now()-begin;
      steps.push({name,ok:true,ms});
      console.info('[lemma selftest] PASS '+name+' ('+ms+'ms)');
    }catch(e){
      const ms=Date.now()-begin;
      steps.push({name,ok:false,ms,detail:e instanceof Error?e.message:String(e)});
      console.warn('[lemma selftest] FAIL '+name+' ('+ms+'ms)');
      throw e;
    }
  }
  let p:any,sessionCode='S1',planId:string|undefined;
  const run=async(n:string,fn:any,a:any)=>{const tx={...c,batch:[] as any[]};const text=await fn(tx,a);return {...await commitBatch(tx,n,a,text),text};};
  // A run stopped by the platform's wall-clock limit never reaches its
  // finally block. Before starting, remove fixtures such runs left behind:
  // owner-scoped, hidden system projects whose slug and subject name match the
  // exact self-test pattern, and only when older than 15 minutes so a
  // concurrent run is never touched. Real projects are never system projects.
  await sweepStaleFixtures(c);
  try{
    // Protocol preflight is independent of fixtures: fail promptly instead of
    // spending ~140s on database checks before discovering an MCP transport error.
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
      if(!res.ok)throw Error('MCP tools/list HTTP '+res.status);
      const payload=parseMcpReply(body,res.headers.get('Content-Type')||'',1);
      const list=payload.tools;
      if(!list||list.length!==TOOL_NAMES.length||TOOL_NAMES.some(n=>!list.some((x:any)=>x.name===n)))throw Error('Not all expected tools registered');
      const chars=JSON.stringify({tools:list}).length;
      if(chars>15000)throw Error('tools/list too large: '+chars);
    });
    await check('fixtures',async()=>{
      const subject=await insert(c,'subjects',{name:'zz-selftest-'+Date.now(),glyph:'z',hue:'slate'});subjectId=subject.id;
      p=await insert(c,'projects',{subject_id:subjectId,slug:'zz-selftest-'+Date.now(),title:'Selftest',goal:'Study finite subcovers using a tiny book.',status:'planning',system:true});
      projectId=p.id;
      c.selftestProjectIds.add(projectId!);
      const src=await insert(c,'sources',{project_id:p.id,title:'Selftest PDF',short:'selftest',filename:'selftest.pdf',page_count:2,status:'ready',has_text:true});
      await insert(c,'source_pages',{source_id:src.id,page:1,label:'1',body:'A finite subcover is a finite collection of open sets selected from the cover.'});
      await insert(c,'source_pages',{source_id:src.id,page:2,label:'2',body:'Every open cover of a compact space has a finite subcover.'});
    });
    if(only(1))await check('planning resume',async()=>{if(!(await packet(c,{project:p.slug})).includes('PLANNING'))throw Error('No planning packet')});
    await check('plan proposal and approval',async()=>{
      // MCP-5: reject malformed scale proposals before creating any proposal.
      const noStages=Array.from({length:9},(_,i)=>({
        title:'Large CP '+(i+1),objective:'Understand',criterion:'Demonstrates understanding',steps:['Prove']
      }));
      let rejected='';
      try{await proposePlan(c,{project:p.slug,checkpoints:noStages});}
      catch(e){rejected=(e as Error).message;}
      if(!/3–7 named stages/.test(rejected))throw Error('Stage-free large plan was not rejected');
      const flatIdeas=Array.from({length:21},(_,i)=>({name:'Flat idea '+i}));
      rejected='';
      try{await proposePlan(c,{project:p.slug,checkpoints:noStages.slice(0,3),concepts:flatIdeas});}
      catch(e){rejected=(e as Error).message;}
      if(!/levels and parent links/.test(rejected))throw Error('Flat large idea proposal was not rejected');
      rejected='';
      try{await createProject(c,{title:'Goal-free selftest',subject:'Topology'});}
      catch(e){rejected=(e as Error).message;}
      if(!/specific learning goal/.test(rejected))throw Error('Goal-free project was not rejected');
      await proposePlan(c,{project:p.slug,checkpoints:[
        {stage:'Foundations',title:'Cover basics',objective:'Define covers',criterion:'States a correct definition unaided',steps:['Define cover','Give example']},
        {stage:'Covers',title:'Compactness',objective:'Use covers',criterion:'Proves a finite subcover result',steps:['Choose cover','Prove finite subcover'],prereqs:[1]},
        {stage:'Applications',title:'Applications',objective:'Apply theorem',criterion:'Constructs a correct example',steps:['Find example','Explain'],prereqs:[2]}
      ],concepts:[{name:'Selftest cover '+p.slug,topic:'Topology'}]});
      const {data}=await scoped(c,'proposals').eq('project_id',p.id).eq('kind','plan').eq('status','pending').maybeSingle();
      if(!data)throw Error('No plan proposal');
      if((await scoped(c,'checkpoints').eq('project_id',p.id)).data?.length)throw Error('Plan applied before approval');
      if(data.payload?.concepts?.length!==1)throw Error('Plan proposal lost its single concept');
      planId=data.id;
      const applied=await rpc(c,'approve_proposal',{p_id:planId});
      if(applied?.concepts!==1)throw Error('Plan approval did not report one concept');
      const {data:active}=await scoped(c,'projects').eq('id',p.id).maybeSingle();
      if(active?.status!=='active')throw Error('Plan not active');
    });
    if(only(1))await check('planning metadata, ETA and undo',async()=>{
      const cp=(await scoped(c,'checkpoints').eq('project_id',p.id).eq('code','CP1').single()).data;
      const {data:concept,error:conceptError}=await scoped(c,'concepts').eq('subject_id',p.subject_id).eq('name','Selftest cover '+p.slug).maybeSingle();
      if(conceptError)throw Error('Approved concept lookup failed: '+conceptError.message);
      if(!concept){
        const {data:subjectConcepts,error:subjectError}=await scoped(c,'concepts','id').eq('subject_id',p.subject_id).limit(10);
        if(subjectError)throw Error('Approved concept subject lookup failed: '+subjectError.message);
        throw Error('Approved concept missing after successful plan approval; subject contains '+(subjectConcepts?.length??0)+' concepts');
      }
      if(cp.stage!=='Foundations'||concept.topic!=='Topology')throw Error('Approved plan lost stage/topic');
      const assertConcept=async(phase:string)=>{
        const {data,error}=await scoped(c,'concepts').eq('id',concept.id).maybeSingle();
        if(error)throw Error('Concept lookup '+phase+' failed: '+error.message);
        if(!data)throw Error('Approved concept disappeared '+phase);
        return data;
      };
      const change=await run('propose_plan_change',proposePlanChange,{project:p.slug,reason:'Selftest stages',ops:[
        {op:'update',code:'CP1',stage:'Revised'},
        {op:'add',title:'Bridge',objective:'Learn',criterion:'Proves it',steps:['Think'],stage:'Bridge'}]});
      const prop=(await scoped(c,'proposals').eq('project_id',p.id).eq('kind','plan_change').eq('status','pending').single()).data;
      if((await scoped(c,'checkpoints').eq('id',cp.id).single()).data.stage!=='Foundations')throw Error('Change applied before approval');
      const approved=await run('decide',decide,{approve:[prop.no]});
      if((await scoped(c,'checkpoints').eq('project_id',p.id).eq('stage','Bridge')).data?.length!==1)throw Error('Added stage missing');
      if((await scoped(c,'checkpoints').eq('id',cp.id).single()).data.stage!=='Revised')throw Error('Updated stage missing');
      await run('undo',undo,{action:approved.action});
      if((await scoped(c,'checkpoints').eq('id',cp.id).single()).data.stage!=='Foundations')throw Error('Stage undo failed');
      await assertConcept('after plan-change undo');
      const edited=await run('edit',edit,{target:p.slug,set:{target_date:'2027-01-15',target_label:'Prelim'}});
      const packetText=await packet(c,{project:p.slug});
      if(!packetText.includes('finish ≈')||!packetText.includes('Prelim 15 Jan'))throw Error('ETA/target missing');
      await run('undo',undo,{action:edited.action});
      if((await scoped(c,'projects').eq('id',p.id).single()).data.target_date!==null)throw Error('Target undo failed');
      await assertConcept('after target-date undo');
      await run('edit',edit,{project:p.slug,target:'CP1',set:{stage:null}});
      await run('edit',edit,{target:'idea:Selftest cover '+p.slug,set:{topic:'Open sets'}});
      if((await assertConcept('after topic edit')).topic!=='Open sets')throw Error('Topic edit failed');
      await run('edit',edit,{project:p.slug,target:'CP1',set:{stage:'Foundations'}});
      for(const set of [{target_date:'2027-02-30'},{target_label:'x'.repeat(21)}]){
        let failed=false;try{await run('edit',edit,{target:p.slug,set});}catch{failed=true;}if(!failed)throw Error('Invalid target accepted');
      }
    });
    if(only(1))await check('study resume bounds',async()=>{
      const s=await packet(c,{project:p.slug});
      if(!s.includes('NOW CP1')||!s.includes('RULES')||s.length>2400)throw Error('Study packet invalid');
    });
    if(only(2))await check('session reuse',async()=>{
      const a={project:p.slug,checkpoint:'CP1',goal:'Learn open covers',client:'other'};
      if(!(await startSession(c,a)).includes('started S1'))throw Error('Session creation failed');
      if(!(await startSession(c,a)).includes('continuing S1'))throw Error('Session reuse failed');
    });
    if(only(2))await check('progress and misconception',async()=>{
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
    if(only(2))await check('PDF reads and search',async()=>{
      const hits=await search(c,{project:p.slug,query:'finite subcover'});
      if(!hits.includes('selftest "Selftest PDF" p.')||!hits.includes('finite subcover'))throw Error('Source-labelled search failed');
      if(!(await readPages(c,{project:p.slug,from:'1',pdf:true})).includes('finite subcover'))throw Error('PDF read failed');
    });
    if(only(2))await check('card proposals and direct card',async()=>{
      await proposeCards(c,{project:p.slug,session:sessionCode,cards:[{front:'Define open cover',back:'A family of open sets.'},{front:'Define compactness',back:'Every open cover has a finite subcover.'}]});
      await proposeCards(c,{project:p.slug,session:sessionCode,direct:true,cards:[{front:'What is a subcover?',back:'A subfamily that still covers.'}]});
      const {data}=await scoped(c,'notes').eq('project_id',p.id);
      if(data?.length!==1)throw Error('Direct card not inserted');
    });
    if(only(2))await check('end session',async()=>{
      if(!(await endSession(c,{project:p.slug,session:sessionCode,summary:'Studied covers.',goal_met:'yes'})).includes('closed S1'))throw Error('No closed session');
    });
    if(only(2))await check('create, list and decide',async()=>{
      const title='zz-selftest extra '+Date.now();extraTitle=title;
      extraSubjectName='zz-selftest-'+Date.now();
      let invalid='';try{await run('create_project',createProject,{title,subject:extraSubjectName,goal:'Demo goal',style:'Teach with careful examples'});}catch(e){invalid=(e as Error).message;}
      if(!invalid.includes('Unknown style key')||!invalid.includes('socratic'))throw Error('Invalid style accepted or usable keys missing');
      if((await scoped(c,'subjects').eq('name',extraSubjectName)).data?.length)throw Error('Rejected style created a subject');
      const r=await createProject(c,{title,subject:extraSubjectName,goal:'Demo goal',style:'socratic',target_date:'2027-01-15',target_label:'Prelim'});
      const slug=r.match(/^created (\S+)/)?.[1];
      if(!slug)throw Error('Project creation failed');
      const {data:newP}=await scoped(c,'projects').eq('slug',slug).maybeSingle();extraId=newP?.id;extraSubjectId=newP?.subject_id;
      if(!extraId)throw Error('Created test project could not be resolved');
      c.selftestProjectIds.add(extraId);
      // create_project is deliberately exercised as a public tool; immediately
      // hide its result from every owner total before continuing the self-test.
      const {error:markError}=await c.db.from('projects').update({system:true})
       .eq('user_id',c.userId).eq('id',extraId);
      if(markError)throw Error('Cannot isolate test project: '+markError.message);
      if(!newP?.target_date||newP?.target_label!=='Prelim')throw Error('Create target lost');if(newP?.style!=='socratic')throw Error('Valid style not saved');
      const lines=await proposals(c,{project:p.slug});
      if(!lines.includes('P'))throw Error('Pending proposals invisible');
      const {data:pending}=await scoped(c,'proposals').eq('project_id',p.id).eq('status','pending').eq('kind','card').order('no').limit(1);
      if(!pending?.length)throw Error('Missing pending card');
      const answer=await decide(c,{approve:[pending[0].no]});
      if(!answer.includes('approved P'))throw Error(answer);
    });
    if(only(3))await check('scan transcription: search, readback, provenance and undo',async()=>{
      const scan=await insert(c,'sources',{
        project_id:p.id,title:'Selftest handwritten scan',short:'selftest-scan',
        filename:'selftest-scan.pdf',kind:'notes',page_count:2,status:'ready',has_text:false
      });
      const saved=await run('save_pages',savePages,{project:p.slug,source:'selftest-scan',client:'chatgpt',pages:[
        {page:1,text:'The handwritten compactness notes use finite subcovers.',confidence:'check'},
        {page:2,text:'An open cover of a compact space has a finite subcover.',confidence:'high'}
      ]});
      if(!saved.action)throw Error('Transcription lacked undo action');
      const {data:rows,error}=await scoped(c,'source_pages').eq('source_id',scan.id).order('page');
      if(error||rows?.length!==2||rows[0].confidence!=='check'||rows[0].transcribed_by!=='chatgpt'||!rows[0].transcribed_at)
       throw Error('Transcription provenance missing');
      const hit=await search(c,{project:p.slug,source:'selftest-scan',query:'handwritten compactness'});
      if(!hit.toLowerCase().includes('compactness'))throw Error('Transcribed page not indexed by search');
      const pages=await readPages(c,{project:p.slug,source:'selftest-scan',from:'1',to:'2'});
      if(!pages.includes('handwritten compactness')||!pages.includes('open cover'))
       throw Error('Transcribed scan not readable by read_pages');
      await run('undo',undo,{action:saved.action});
      if((await scoped(c,'source_pages').eq('source_id',scan.id)).data?.length)
       throw Error('Undo did not remove transcribed scan pages');
      if((await scoped(c,'sources','has_text').eq('id',scan.id).single()).data?.has_text)
       throw Error('Undo did not restore scan has_text=false');
      const fresh=await run('save_pages',savePages,{project:p.slug,title:'Selftest lecture transcription',
        client:'claude',pages:[{page:1,text:'Lecture transcription testing.'}]});
      if(!fresh.action)throw Error('New-source transcription lacked undo action');
      const made=(await scoped(c,'sources','id').eq('project_id',p.id).eq('title','Selftest lecture transcription').single()).data;
      if(!made)throw Error('save_pages did not create text-only source');
      await run('undo',undo,{action:fresh.action});
      if((await scoped(c,'sources').eq('id',made.id)).data?.length)
       throw Error('Undo did not remove transcribed text-only source');
    });
    if(only(3))await check('prompt history undo and redo',async()=>{
      const r=await run('set_prompt',setPrompt,{scope:p.slug,text:'Selftest Socratic prompt',mode:'replace'});
      if(!(await packet(c,{project:p.slug})).startsWith('OWNER'))throw Error('OWNER missing');
      // Other owner or CI writes can land between the prompt write and this read.
      // Assert the newest action in this throwaway project, not the global log.
      if(!(await history(c,{project:p.slug})).startsWith('A'+r.action+' '))throw Error('Newest project action missing');
      const u=await run('undo',undo,{action:r.action});
      if((await packet(c,{project:p.slug})).includes('Selftest Socratic prompt'))throw Error('Prompt undo failed');
      await run('undo',undo,{action:u.action});
      if(!(await packet(c,{project:p.slug})).includes('Selftest Socratic prompt'))throw Error('Prompt redo failed');
    });
    if(only(3))await check('direct edits add review grade',async()=>{
      await run('edit',edit,{target:p.slug,set:{title:'Edited selftest'}});
      await run('edit',edit,{project:p.slug,target:'CP1',set:{steps:['Think','Prove']}});
      const a=await run('add',add,{kind:'card',project:p.slug,fields:{front:'Selftest new card',back:'Answer'}});
      const note=a.created.find((x:any)=>x.table==='notes');if(!note)throw Error('Direct card missing');
      if(!(await review(c,{project:p.slug,count:10})).includes('N'+note.no+'.1'))throw Error('Review missing card');
      await run('grade',grade,{answers:[{card:'N'+note.no+'.1',rating:'good'}]});
      const nr=await scoped(c,'notes','id').eq('no',note.no).single();
      const cr=await scoped(c,'cards').eq('note_id',nr.data.id).single();if(cr.data?.reps!==1)throw Error('Grade failed');
    });
    if(only(3))await check('adaptive planning diagnostics',async()=>{
      const started=await run('start_session',startSession,{project:p.slug,goal:'Probe prerequisites',checkpoint:'CP1',client:'other'});
      const code=started.text.match(/S[0-9]+/)![0];
      for(let i=0;i<2;i++)await run('save_progress',saveProgress,{project:p.slug,session:code,diagnostics:[{kind:'gap',topic:'Selftest prerequisite',evidence:'Could not explain it',severity:3,confirmed:true}]});
      const d=await scoped(c,'diagnostics').eq('project_id',p.id).single();if(d.data?.times!==2)throw Error('Diagnostic sightings failed');
      if(!(await packet(c,{project:p.slug})).includes('ADAPT D'+d.data.no))throw Error('ADAPT missing');
    });
    if(only(3))await check('repeated new concept references and undo',async()=>{
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
    if(only(4))await check('idea relationship duplicates, conflicts and undo',async()=>{
      const base=await insert(c,'concepts',{subject_id:p.subject_id,slug:'selftest-links',name:'Selftest links '+p.slug});
      const subject=(await scoped(c,'subjects').eq('id',p.subject_id).single()).data.name;
      const links=async()=>{const r=await scoped(c,'concept_links').eq('to_id',base.id);if(r.error)throw Error(r.error.message);return r.data||[];};
      for(const tool of ['add','edit'])for(const field of ['prereqs','related']){
        const name='Selftest '+tool+' '+field;
        const args=tool==='add'?{kind:'idea',fields:{subject,name:base.name,[field]:[name,name.toLowerCase(),name]}}:{target:'idea:'+base.name,set:{[field]:[name,name.toLowerCase(),name]}};
        const action=await run(tool,tool==='add'?add:edit,args);
        const rows=await links();if(rows.length!==1||rows[0].kind!==(field==='prereqs'?'prereq':'related'))throw Error('Expected one canonical relationship');
        await run('undo',undo,{action:action.action});
        if((await links()).length)throw Error('Undo left relationships');
        if((await scoped(c,'concepts').eq('subject_id',p.subject_id).ilike('name',name)).data?.length)throw Error('Undo left new concept');
      }
      for(const tool of ['add','edit']){
        const name='Selftest conflicting '+tool;
        const fields={prereqs:[name],related:[name.toLowerCase()]};
        let message='';try{await run(tool,tool==='add'?add:edit,tool==='add'?{kind:'idea',fields:{subject,name:base.name,...fields}}:{target:'idea:'+base.name,set:fields});}catch(e){message=(e as Error).message;}
        if(!message.includes('both prerequisite and related'))throw Error('Expected explicit relationship conflict: '+message);
        if((await links()).length||(await scoped(c,'concepts').eq('subject_id',p.subject_id).ilike('name',name)).data?.length)throw Error('Rejected write changed data');
      }
      await run('add',add,{kind:'idea',fields:{subject,name:base.name,prereqs:['Selftest retained']}});
      await run('add',add,{kind:'idea',fields:{subject,name:base.name,prereqs:['selftest retained']}});
      if((await links()).length!==1)throw Error('Repeated add duplicated existing relationship');
      let conflict='';try{await run('edit',edit,{target:'idea:'+base.name,set:{related:['selftest retained']}});}catch(e){conflict=(e as Error).message;}
      if(!conflict.includes('both prerequisite and related'))throw Error('Untouched prerequisite silently replaced');
      const changed=await run('edit',edit,{target:'idea:'+base.name,set:{prereqs:[],related:['selftest retained']}});
      if((await links())[0]?.kind!=='related')throw Error('Explicit kind change failed');
      await run('undo',undo,{action:changed.action});
      if((await links())[0]?.kind!=='prereq')throw Error('Undo did not restore relationship kind');
    });
    if(only(4))await check('delete preview cascade and undo',async()=>{
      const preview=await run('delete',remove,{target:p.slug,confirm:false});if(preview.action)throw Error('Preview wrote data');
      const r=await run('delete',remove,{target:p.slug,confirm:true});
      if((await scoped(c,'projects').eq('id',p.id)).data?.length)throw Error('Delete failed');
      await run('undo',undo,{action:r.action});
      if(!(await scoped(c,'projects').eq('id',p.id)).data?.length)throw Error('Cascade restore failed');
    });

  }catch{/* Every failure is recorded in steps. */}finally{
    const cleanupStarted=Date.now();
    console.info('[lemma selftest] START cleanup');
    // Never delete by prefix: every destructive operation is owner-scoped and
    // restricted to IDs created in this invocation. Keep cleaning even if an
    // earlier deletion fails, and fail the self-test if anything survives.
    const purge=async(table:string,column:string,id:string|undefined)=>{
      if(!id)return;
      try{
        const {error}=await c.db.from(table).delete().eq('user_id',c.userId).eq(column,id);
        if(error)cleanupFailures.push(table+': '+error.message);
      }catch(error){cleanupFailures.push(table+': '+(error instanceof Error?error.message:String(error)))}
    };
    if(!extraId&&extraTitle){
      try{
        const {data,error}=await scoped(c,'projects','id').eq('title',extraTitle).maybeSingle();
        if(error)cleanupFailures.push('lookup extra project: '+error.message);
        else extraId=data?.id;
      }catch(error){cleanupFailures.push('lookup extra project: '+String(error))}
    }
    if(!extraSubjectId&&extraSubjectName){
      try{
        const {data,error}=await scoped(c,'subjects','id').eq('name',extraSubjectName).maybeSingle();
        if(error)cleanupFailures.push('lookup extra subject: '+error.message);
        else extraSubjectId=data?.id;
      }catch(error){cleanupFailures.push('lookup extra subject: '+String(error))}
    }
    for(const id of [extraId,projectId])await purge('projects','id',id);
    // Concepts created by the self-test may be independent of its checkpoints.
    // Delete them before their subjects, including on early failures.
    for(const id of [extraSubjectId,subjectId])await purge('concepts','subject_id',id);
    for(const id of [extraSubjectId,subjectId])await purge('subjects','id',id);
    // A successful DELETE request alone is insufficient: verify the IDs are gone.
    for(const [table,ids] of [['projects',[extraId,projectId]],['subjects',[extraSubjectId,subjectId]]] as const){
      for(const id of ids)if(id){
        try{
          const {data,error}=await c.db.from(table).select('id').eq('user_id',c.userId).eq('id',id).maybeSingle();
          if(error||data)cleanupFailures.push(table+' cleanup verification failed');
        }catch{cleanupFailures.push(table+' cleanup verification unavailable')}
      }
    }
    const cleanupMs=Date.now()-cleanupStarted;
    if(cleanupFailures.length)steps.push({name:'cleanup',ok:false,ms:cleanupMs,detail:cleanupFailures.join('; ')});
    console.info('[lemma selftest] '+(cleanupFailures.length?'FAIL':'PASS')+' cleanup ('+cleanupMs+'ms)');
  }
  return {ok:steps.length===PART_STEPS[part]&&steps.every(x=>x.ok)&&cleanupFailures.length===0,part,expected:PART_STEPS[part],steps};
}
// A previous invocation may have died at the platform's wall-clock limit.
// Never let recovery of an unbounded backlog consume the next selftest's
 // entire 150-second budget before its first recorded check.
const MAX_STALE_SWEEP_ROWS = 4;
const FIXTURE_PROJECT=/^zz-selftest-(extra-)?\d+$/;
const FIXTURE_SUBJECT=/^zz-selftest-\d+$/;
async function sweepStaleFixtures(c:Context):Promise<void>{
  const before=new Date(Date.now()-15*60*1000).toISOString();
  try{
    const projects=await c.db.from('projects').select('id,slug').eq('user_id',c.userId).eq('system',true)
      .like('slug','zz-selftest-%').lt('created_at',before)
      .order('created_at',{ascending:true}).limit(MAX_STALE_SWEEP_ROWS);
    for(const row of projects.data??[])if(FIXTURE_PROJECT.test(row.slug))
      await c.db.from('projects').delete().eq('user_id',c.userId).eq('system',true).eq('id',row.id);
    const subjects=await c.db.from('subjects').select('id,name').eq('user_id',c.userId)
      .like('name','zz-selftest-%').lt('created_at',before)
      .order('created_at',{ascending:true}).limit(MAX_STALE_SWEEP_ROWS);
    for(const row of subjects.data??[]){
      if(!FIXTURE_SUBJECT.test(row.name))continue;
      const used=await c.db.from('projects').select('id').eq('user_id',c.userId).eq('subject_id',row.id).limit(1);
      if(used.error||used.data?.length)continue;
      await c.db.from('concepts').delete().eq('user_id',c.userId).eq('subject_id',row.id);
      await c.db.from('subjects').delete().eq('user_id',c.userId).eq('id',row.id);
    }
    console.info('[lemma selftest] swept stale fixtures');
  }catch{console.warn('[lemma selftest] stale fixture sweep unavailable')}
}
