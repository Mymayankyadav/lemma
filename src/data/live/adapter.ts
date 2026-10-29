import type { LemmaApi } from '../api'

import { liveClient } from './client'
import { checked, fail, owner, rows, toDb, settingsRow, styleRow, subjectRow, projectRow, sourceRow, sessionRow, checkpointRow, cardState, cardStateDb, commentRow, slugify, noteOrds, type Row } from './helpers'
import { dueToday, studyDayBounds, checkpointUi, projectProgress, conceptStatus } from '../../lib/derive'
import { studyDay } from '../../lib/calendar'
import { ingest } from '../../pdf/ingest'
import type { ProjectSummary, CheckpointView, ReviewItem, CardState, CardComment, Proposal, AtlasGraph } from '../types'
import { LemmaError } from '../api'

/** Owner-scoped implementation; all queries use the browser session and RLS. */
export class LiveAdapter implements LemmaApi {
 readonly mode = 'live' as const
 async getAuth(...args: Parameters<LemmaApi['getAuth']>): ReturnType<LemmaApi['getAuth']> {
  const {data,error} = await liveClient().auth.getUser()
  if (error && !/missing|session/i.test(error.message)) fail(error)
  return data.user?.email ? {email:data.user.email} : null
 }
 async signIn(...args: Parameters<LemmaApi['signIn']>): ReturnType<LemmaApi['signIn']> {
  const db=liveClient()
  if (typeof window === 'undefined') throw new LemmaError('auth','Sign-in requires a browser')
  sessionStorage.setItem('lemma:oauth-return',window.location.hash)
  const redirectTo=window.location.origin+window.location.pathname
  const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo}})
  if(error) fail(error)
 }
 async signOut(...args: Parameters<LemmaApi['signOut']>): ReturnType<LemmaApi['signOut']> {
  const {error}=await liveClient().auth.signOut()
  if(error) fail(error)
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('lemma:oauth-return')
 }
 async bootstrap(...args: Parameters<LemmaApi['bootstrap']>): ReturnType<LemmaApi['bootstrap']> {
  const db=liveClient()
  await owner(db)
  const result=checked(await db.rpc('bootstrap'))
  if(typeof window !== 'undefined'){
    const hash=sessionStorage.getItem('lemma:oauth-return')
    if(hash && !window.location.hash) {sessionStorage.removeItem('lemma:oauth-return'); window.location.hash=hash}
    const url=new URL(window.location.href)
    if(url.searchParams.has('code')) {url.searchParams.delete('code'); window.history.replaceState(null,'',url.pathname+url.search+url.hash)}
  }
  return settingsRow(result as Row)
 }
 async getSettings(...args: Parameters<LemmaApi['getSettings']>): ReturnType<LemmaApi['getSettings']> {
  const db=liveClient(), uid=await owner(db)
  return settingsRow(checked(await db.from('settings').select('*').eq('user_id',uid).single()) as Row)
 }
 async updateSettings(...args: Parameters<LemmaApi['updateSettings']>): ReturnType<LemmaApi['updateSettings']> {
  const [patch]=args
  const db=liveClient(), uid=await owner(db)
  const dbPatch=toDb(patch)
  for (const key of ['connector_secret','connector_last_client','connector_last_seen_at','user_id']) delete dbPatch[key]
  if(!Object.keys(dbPatch).length) return this.getSettings()
  return settingsRow(checked(await db.from('settings').update(dbPatch).eq('user_id',uid).select('*').single()) as Row)
 }
 async rotateConnectorSecret(...args: Parameters<LemmaApi['rotateConnectorSecret']>): ReturnType<LemmaApi['rotateConnectorSecret']> {
  const db=liveClient(), uid=await owner(db)
  const bytes=new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const secret=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')
  const row=checked(await db.from('settings').update({connector_secret:secret}).eq('user_id',uid).select('*').single())
  return settingsRow(row as Row)
 }
 async listStyles(...args: Parameters<LemmaApi['listStyles']>): ReturnType<LemmaApi['listStyles']> {
  const db=liveClient(), uid=await owner(db)
  return (await rows(db,'styles',uid)).sort((a,b)=>a.position-b.position).map(styleRow)
 }
 async updateStyle(...args: Parameters<LemmaApi['updateStyle']>): ReturnType<LemmaApi['updateStyle']> {
  const [key,patch]=args, db=liveClient(),uid=await owner(db)
  return styleRow(checked(await db.from('styles').update(toDb(patch)).eq('user_id',uid).eq('key',key).select('*').single()) as Row)
 }
 async getHome(...args: Parameters<LemmaApi['getHome']>): ReturnType<LemmaApi['getHome']> {
  const [projects,sessions,proposals,due]=await Promise.all([
    this.listProjects(),this.listSessions(),this.listProposals(),
    this.getReviewItems({decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false})
  ])
  const active=sessions.filter(s=>s.display!=='ended').sort((a,b)=>b.lastActivityAt.localeCompare(a.lastActivityAt))[0]
  const p=active?projects.find(x=>x.slug===active.projectSlug):projects[0]
  const detail=p?await this.getProject(p.slug):null
  const current=detail?.checkpoints.find(x=>x.code===active?.checkpointCode)
    ??detail?.checkpoints.find(x=>x.ui==='now')
  const session=active?await this.getSession(active.projectSlug,active.number):null
  return {resume:p?{projectSlug:p.slug,projectTitle:p.title,glyph:p.subject.glyph,
      checkpointCode:current?.code??null,checkpointTitle:current?.title??null,
      step:session?.resumeStep??current?.currentStep??0,stepsTotal:current?.stepsTotal??0,
      question:session?.resumeQuestion??null,objective:current?((await this.getCheckpoint(p.slug,current.code)).objective):null,
      pausedAt:active?.lastActivityAt??p.lastActivityAt,sessionNumber:active?.number??null}:null,
    due:due.length,pendingProposals:proposals.length,projects}
 }
 async listSubjects(...args: Parameters<LemmaApi['listSubjects']>): ReturnType<LemmaApi['listSubjects']> {
  const db=liveClient(),uid=await owner(db)
  return (await rows(db,'subjects',uid)).sort((a,b)=>a.position-b.position).map(subjectRow)
 }
 async createSubject(...args: Parameters<LemmaApi['createSubject']>): ReturnType<LemmaApi['createSubject']> {
  const [input]=args, db=liveClient(),uid=await owner(db)
  const existing=await rows(db,'subjects',uid)
  return subjectRow(checked(await db.from('subjects').insert({...input,user_id:uid,position:existing.length}).select('*').single()) as Row)
 }
 async listProjects(...args: Parameters<LemmaApi['listProjects']>): ReturnType<LemmaApi['listProjects']> {
  const db=liveClient(),uid=await owner(db)
  const [projects,subjects,cps,notes,sessions,sources,prereqs]=await Promise.all([
    rows(db,'projects',uid),rows(db,'subjects',uid),rows(db,'checkpoints',uid),
    rows(db,'notes',uid),rows(db,'sessions',uid),rows(db,'sources',uid),rows(db,'checkpoint_prereqs',uid)
  ])
  const subjectMap=new Map(subjects.map(s=>[s.id,subjectRow(s)]))
  const cpMap=new Map(cps.map(c=>[c.id,c]))
  const today=studyDay(Date.now())
  const views=new Map<string,CheckpointView>()
  const visiting=new Set<string>()
  const getView=(c:Row): CheckpointView=>{
    if(views.has(c.id)) return views.get(c.id)!
    if(visiting.has(c.id)) throw new LemmaError('invalid','Checkpoint prerequisite cycle')
    visiting.add(c.id)
    const pre=prereqs.filter(p=>p.checkpoint_id===c.id).map(p=>cpMap.get(p.prereq_id)).filter(Boolean) as Row[]
    const view=checkpointRow(c,pre.map(getView),today)
    views.set(c.id,view);visiting.delete(c.id);return view
  }
  return projects.map(p=>{
    const checkpoints=cps.filter(c=>c.project_id===p.id).sort((a,b)=>a.position-b.position).map(getView)
    const counts=projectProgress(checkpoints)
    const current=checkpoints.find(c=>c.ui==='now')??checkpoints.find(c=>c.ui==='next')
    return {id:p.id,slug:p.slug,title:p.title,subject:subjectMap.get(p.subject_id)!,status:p.status,
      done:counts.done,total:counts.total,
      current:current?{code:current.code,title:current.title,step:current.currentStep,stepsTotal:current.stepsTotal}:null,
      lastActivityAt:p.last_activity_at,cardsCount:notes.filter(n=>n.project_id===p.id&&n.status==='active').length,
      sessionsCount:sessions.filter(s=>s.project_id===p.id&&s.state==='ended').length,
      sourcesCount:sources.filter(s=>s.project_id===p.id).length} satisfies ProjectSummary
  }).sort((a,b)=>(b.lastActivityAt??'').localeCompare(a.lastActivityAt??''))
 }
 async getProject(...args: Parameters<LemmaApi['getProject']>): ReturnType<LemmaApi['getProject']> {
  const [slug]=args,db=liveClient(),uid=await owner(db)
  const project=checked(await db.from('projects').select('*').eq('slug',slug).eq('user_id',uid).single()) as Row
  const [subjects,cps,prereqs,proposalRows,sources,sessionList]=await Promise.all([
    rows(db,'subjects',uid),rows(db,'checkpoints',uid),rows(db,'checkpoint_prereqs',uid),
    rows(db,'proposals',uid),rows(db,'sources',uid),this.listSessions(slug)
  ])
  const today=studyDay(Date.now()),forProject=cps.filter(c=>c.project_id===project.id)
  const byId=new Map(forProject.map(c=>[c.id,c])),cached=new Map<string,CheckpointView>(),visiting=new Set<string>()
  const view=(cp:Row): CheckpointView=>{
    if(cached.has(cp.id))return cached.get(cp.id)!
    if(visiting.has(cp.id)) throw new LemmaError('invalid','Checkpoint prerequisite cycle')
    visiting.add(cp.id)
    const parents=prereqs.filter(p=>p.checkpoint_id===cp.id).map(p=>byId.get(p.prereq_id)).filter(Boolean) as Row[]
    const v=checkpointRow(cp,parents.map(view),today);cached.set(cp.id,v);visiting.delete(cp.id);return v
  }
  const views:CheckpointView[]=forProject.map(view)
  const pending=proposalRows.filter(p=>p.project_id===project.id&&p.status==='pending')
  for (const proposal of pending.filter(p=>p.kind==='plan_change')){
    for(const op of (proposal.payload?.ops??[]) as Row[]){
      if(op.op!=='add')continue
      const previous=views.find(c=>c.code===op.after)
      views.push({id:'proposed:'+proposal.id+':'+views.length,code:op.code??'Proposed',
        title:op.title,position:(previous?.position??0)+0.5,ui:'proposed',
        currentStep:0,stepsTotal:op.steps?.length??0,recheckDue:null,dueCards:0})
    }
  }
  views.sort((a,b)=>a.position-b.position)
  const progress=projectProgress(views)
  return {project:projectRow(project),subject:subjectRow(subjects.find(s=>s.id===project.subject_id)!),
    checkpoints:views,done:progress.done,total:progress.total,
    sources:sources.filter(s=>s.project_id===project.id).map(sourceRow),
    sessions:sessionList,pendingProposals:pending.length}
 }
 async createProject(...args: Parameters<LemmaApi['createProject']>): ReturnType<LemmaApi['createProject']> {
  const [input]=args, db=liveClient(),uid=await owner(db)
  const base=slugify(input.slug||input.title)
  if(base.length<2) throw new LemmaError('invalid','Use a longer project title')
  for(let n=1;n<100;n++){
    const suffix=n===1?'':'-'+n
    const slug=base.slice(0,40-suffix.length).replace(/-$/,'')+suffix
    const res=await db.from('projects').insert({user_id:uid,title:input.title,goal:input.goal,
      style:input.style,subject_id:input.subjectId,slug}).select('*').single()
    if(!res.error) return projectRow(res.data as Row)
    if(res.error.code!=='23505') fail(res.error)
  }
  throw new LemmaError('conflict','Too many projects with the same name')
 }
 async updateProject(...args: Parameters<LemmaApi['updateProject']>): ReturnType<LemmaApi['updateProject']> {
  const [id,patch]=args,db=liveClient(),uid=await owner(db)
  return projectRow(checked(await db.from('projects').update(toDb(patch)).eq('id',id).eq('user_id',uid).select('*').single()) as Row)
 }
 async getCheckpoint(...args: Parameters<LemmaApi['getCheckpoint']>): ReturnType<LemmaApi['getCheckpoint']> {
  const [slug,code]=args,db=liveClient(),uid=await owner(db)
  const project=await this.getProject(slug)
  const row=checked(await db.from('checkpoints').select('*').eq('project_id',project.project.id).eq('code',code).eq('user_id',uid).single()) as Row
  const [prereqs,cpConcepts,concepts,sources,events,notes,sessions]=await Promise.all([
    rows(db,'checkpoint_prereqs',uid),rows(db,'checkpoint_concepts',uid),rows(db,'concepts',uid),
    rows(db,'sources',uid),rows(db,'session_events',uid),rows(db,'notes',uid),this.listSessions(slug)
  ])
  const cpRows=await rows(db,'checkpoints',uid)
  const linked=cpConcepts.filter(x=>x.checkpoint_id===row.id).map(x=>concepts.find(c=>c.id===x.concept_id)).filter(Boolean) as Row[]
  const cpById=new Map(cpRows.map(c=>[c.id,c]))
  return {view:project.checkpoints.find(x=>x.id===row.id)!,objective:row.objective,criterion:row.criterion,
    steps:row.steps??[],pages:row.pages,sourceShort:sources.find(x=>x.id===row.source_id)?.short??null,
    prereqs:prereqs.filter(x=>x.checkpoint_id===row.id).map(x=>cpById.get(x.prereq_id)?.code).filter(Boolean) as string[],
    concepts:linked.map(x=>({slug:x.slug,name:x.name})),recheckPrompt:row.recheck_prompt,
    events:events.filter(x=>x.checkpoint_id===row.id).sort((a,b)=>b.id-a.id).slice(0,20).map(x=>({
      id:Number(x.id),kind:x.kind,body:x.body,outcome:x.outcome,hintLevel:x.hint_level,
      checkpointCode:code,createdAt:x.created_at
    })),cardsCount:notes.filter(x=>x.checkpoint_id===row.id&&x.status==='active').length,
    sessions:sessions.filter(s=>s.checkpointCode===code)}
 }
 async addSource(...args: Parameters<LemmaApi['addSource']>): ReturnType<LemmaApi['addSource']> {
  const [projectId,file,onProgress]=args,db=liveClient(),uid=await owner(db)
  checked(await db.from('projects').select('id').eq('user_id',uid).eq('id',projectId).single())
  const document=await ingest(file,{onProgress})
  const basename=file.name.replace(/\.pdf$/i,'').trim()
  const existing=await rows(db,'sources',uid)
  const used=new Set(existing.filter(s=>s.project_id===projectId).map(s=>s.short))
  const base=slugify(basename).replace(/-/g,'').slice(0,17)||'source'
  let short=base,index=2
  while(used.has(short)){short=base.slice(0,17)+index++}
  const source=checked(await db.from('sources').insert({user_id:uid,project_id:projectId,
    title:basename.slice(0,120),short,filename:file.name,bytes:file.size,status:'uploading',
    page_count:document.pageCount,has_text:document.hasText,outline:document.outline
  }).select('*').single()) as Row
  const storagePath=`${uid}/${source.id}.pdf`
  const progress=(phase:'uploading'|'saving'|'done'|'failed',page:number,message:string)=>
    onProgress({phase,page,pageCount:document.pageCount,message})
  try {
    progress('uploading',0,'Uploading original PDF')
    const {error:uploadError}=await db.storage.from('sources').upload(storagePath,file,{upsert:false,contentType:'application/pdf'})
    if(uploadError) fail(uploadError)
    checked(await db.from('sources').update({storage_path:storagePath,status:'extracting'})
      .eq('id',source.id).eq('user_id',uid).select('id').single())
    for(let i=0;i<document.pages.length;i+=50){
      const slice=document.pages.slice(i,i+50).map(p=>({...p,body:p.body.slice(0,20000),source_id:source.id,user_id:uid}))
      const {error}=await db.from('source_pages').insert(slice)
      if(error) fail(error)
      progress('saving',Math.min(i+50,document.pageCount),'Saving extracted text')
    }
    const completed=checked(await db.from('sources').update({status:'ready'})
      .eq('id',source.id).eq('user_id',uid).select('*').single()) as Row
    progress('done',document.pageCount,'Source is ready')
    return sourceRow(completed)
  }catch(error){
    await db.from('sources').update({status:'failed',error:error instanceof Error?error.message:'Upload failed'})
      .eq('id',source.id).eq('user_id',uid)
    progress('failed',0,'Source upload failed')
    throw error
  }
 }
 async deleteSource(...args: Parameters<LemmaApi['deleteSource']>): ReturnType<LemmaApi['deleteSource']> {
  const [id]=args,db=liveClient(),uid=await owner(db)
  const source=checked(await db.from('sources').select('*').eq('user_id',uid).eq('id',id).single()) as Row
  if(source.storage_path){
    const {error}=await db.storage.from('sources').remove([source.storage_path])
    if(error) fail(error)
  }
  checked(await db.from('sources').delete().eq('id',id).eq('user_id',uid).select('id').single())
 }
 async listSessions(...args: Parameters<LemmaApi['listSessions']>): ReturnType<LemmaApi['listSessions']> {
  const [slug]=args, db=liveClient(),uid=await owner(db)
  const [projects,cps,sessions]=await Promise.all([rows(db,'projects',uid),rows(db,'checkpoints',uid),rows(db,'sessions',uid)])
  const projectsById=new Map(projects.map(p=>[p.id,p]))
  const cpById=new Map(cps.map(c=>[c.id,c]))
  return sessions.filter(s=>projectsById.has(s.project_id)&&(!slug||projectsById.get(s.project_id)?.slug===slug))
    .map(s=>sessionRow(s,projectsById.get(s.project_id)!.slug,cpById.get(s.checkpoint_id)?.code??null))
    .sort((a,b)=>b.startedAt.localeCompare(a.startedAt))
 }
 async getSession(...args: Parameters<LemmaApi['getSession']>): ReturnType<LemmaApi['getSession']> {
  const [slug,number]=args,db=liveClient(),uid=await owner(db)
  const [projects,sessions,cps,styles,events,misconceptions,notes,proposals]=await Promise.all([
    rows(db,'projects',uid),rows(db,'sessions',uid),rows(db,'checkpoints',uid),rows(db,'styles',uid),
    rows(db,'session_events',uid),rows(db,'misconceptions',uid),rows(db,'notes',uid),rows(db,'proposals',uid)
  ])
  const project=projects.find(x=>x.slug===slug)
  if(!project) throw new LemmaError('not_found','Project not found')
  const session=sessions.find(x=>x.project_id===project.id&&x.number===number)
  if(!session) throw new LemmaError('not_found','Session not found')
  const cp=cps.find(x=>x.id===session.checkpoint_id)
  const pending=proposals.filter(x=>x.session_id===session.id&&x.status==='pending')
  const cardProposals=pending.filter(x=>x.kind==='card')
  return {summary:sessionRow(session,slug,cp?.code??null),
    styleName:styles.find(x=>x.key===session.style)?.name??session.style,
    summaryText:session.summary,resumeQuestion:session.resume_question,resumeStep:session.resume_step,
    events:events.filter(x=>x.session_id===session.id).sort((a,b)=>a.id-b.id).map(x=>({
      id:Number(x.id),kind:x.kind,body:x.body,outcome:x.outcome,hintLevel:x.hint_level,
      checkpointCode:cps.find(c=>c.id===x.checkpoint_id)?.code??null,createdAt:x.created_at
    })),misconceptions:misconceptions.filter(x=>x.project_id===project.id).map(x=>({
      id:x.id,label:x.label,times:x.times,lastSeenAt:x.last_seen_at,resolvedAt:x.resolved_at
    })),cards:[
      ...notes.filter(x=>x.session_id===session.id&&x.status==='active').map(x=>({noteNo:Number(x.no),front:x.front,state:'active' as const})),
      ...cardProposals.map(x=>({noteNo:Number(x.no),front:x.payload.front,state:'pending' as const}))
    ],pendingProposals:{cards:cardProposals.length,planChanges:pending.filter(x=>x.kind==='plan_change'||x.kind==='plan').length},
    pages:cp?.pages??null}
 }
 async listProposals(...args: Parameters<LemmaApi['listProposals']>): ReturnType<LemmaApi['listProposals']> {
  const db=liveClient(),uid=await owner(db)
  const [proposals,projects,subjects,sessions,notes,comments]=await Promise.all([
    rows(db,'proposals',uid),rows(db,'projects',uid),rows(db,'subjects',uid),
    rows(db,'sessions',uid),rows(db,'notes',uid),rows(db,'card_comments',uid)
  ])
  const ps=new Map(projects.map(p=>[p.id,p]))
  const ss=new Map(subjects.map(s=>[s.id,s]))
  const ses=new Map(sessions.map(s=>[s.id,s]))
  return proposals.filter(p=>p.status==='pending').sort((a,b)=>a.created_at.localeCompare(b.created_at))
    .map(p=>{
      const payload=p.payload as Row,project=ps.get(p.project_id)
      const note=notes.find(n=>n.no===payload.note_no)
      return {id:p.id,kind:p.kind,projectSlug:project?.slug??'',projectGlyph:ss.get(project?.subject_id)?.glyph??'∫',
        sessionNumber:ses.get(p.session_id)?.number??null,origin:p.origin,reason:p.reason,createdAt:p.created_at,
        card:p.kind==='card'?payload:null,cardEdit:p.kind==='card_edit'?{
          ...payload,current:{front:note?.front??'',back:note?.back??''},
          comments:comments.filter(c=>c.note_id===note?.id).map(c=>commentRow(c))
        }:null,plan:p.kind==='plan'?payload:null,planChange:p.kind==='plan_change'?payload:null} as Proposal
    })
 }
 async getProposal(...args: Parameters<LemmaApi['getProposal']>): ReturnType<LemmaApi['getProposal']> {
  const [id]=args,db=liveClient(),uid=await owner(db)
  const p=checked(await db.from('proposals').select('*').eq('id',id).eq('user_id',uid).single()) as Row
  const [projects,subjects,sessions,notes,comments]=await Promise.all([
    rows(db,'projects',uid),rows(db,'subjects',uid),rows(db,'sessions',uid),rows(db,'notes',uid),rows(db,'card_comments',uid)
  ])
  const project=projects.find(x=>x.id===p.project_id),subject=subjects.find(x=>x.id===project?.subject_id)
  const session=sessions.find(x=>x.id===p.session_id),payload=p.payload as Row
  const note=notes.find(x=>x.no===payload.note_no)
  return {id:p.id,kind:p.kind,projectSlug:project?.slug??'',projectGlyph:subject?.glyph??'∫',
    sessionNumber:session?.number??null,origin:p.origin,reason:p.reason,createdAt:p.created_at,
    card:p.kind==='card'?payload:null,
    cardEdit:p.kind==='card_edit'?{...payload,current:{front:note?.front??'',back:note?.back??''},
      comments:comments.filter(c=>c.note_id===note?.id).map(c=>commentRow(c))}:null,
    plan:p.kind==='plan'?payload:null,planChange:p.kind==='plan_change'?payload:null} as Proposal
 }
 async approveProposal(...args: Parameters<LemmaApi['approveProposal']>): ReturnType<LemmaApi['approveProposal']> {
  const [id,edit]=args,db=liveClient()
  await owner(db)
  checked(await db.rpc('approve_proposal',{p_id:id,p_edit:edit?toDb(edit):null}))
  return
 }
 async rejectProposal(...args: Parameters<LemmaApi['rejectProposal']>): ReturnType<LemmaApi['rejectProposal']> {
  const [id]=args,db=liveClient()
  await owner(db)
  const {error}=await db.rpc('reject_proposal',{p_id:id})
  if(error) fail(error)
 }
 async approveAllCards(...args: Parameters<LemmaApi['approveAllCards']>): ReturnType<LemmaApi['approveAllCards']> {
  const cards=(await this.listProposals()).filter(p=>p.kind==='card')
  let count=0
  for(const card of cards){await this.approveProposal(card.id);count++}
  return count
 }
 async getDeckTree(...args: Parameters<LemmaApi['getDeckTree']>): ReturnType<LemmaApi['getDeckTree']> {
  const [projects,due,checkpoints]=await Promise.all([
    this.listProjects(),
    this.getReviewItems({decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false}),
    (async()=>{const db=liveClient(),uid=await owner(db);return rows(db,'checkpoints',uid)})()
  ])
  return projects.map(p=>{
    const mine=due.filter(c=>c.projectSlug===p.slug)
    const children=checkpoints.filter(c=>c.project_id===p.id).sort((a,b)=>a.position-b.position)
      .map(c=>({key:`cp:${p.slug}:${c.code}` as const,label:c.title,glyph:p.subject.glyph,
        level:1 as const,due:mine.filter(card=>card.checkpointCode===c.code).length,children:[]}))
    return {key:`project:${p.slug}` as const,label:p.title,glyph:p.subject.glyph,
      level:0 as const,due:mine.length,children}
  })
 }
 async getReviewItems(...args: Parameters<LemmaApi['getReviewItems']>): ReturnType<LemmaApi['getReviewItems']> {
  const [filter]=args,db=liveClient(),uid=await owner(db)
  const [cards,notes,projects,subjects,cps,sessions,sources,settings,reviews,concepts]=await Promise.all([
    rows(db,'cards',uid),rows(db,'notes',uid),rows(db,'projects',uid),rows(db,'subjects',uid),
    rows(db,'checkpoints',uid),rows(db,'sessions',uid),rows(db,'sources',uid),
    this.getSettings(),rows(db,'reviews',uid),rows(db,'concepts',uid)
  ])
  const notesById=new Map(notes.filter(n=>n.status==='active').map(n=>[n.id,n]))
  const projectsById=new Map(projects.map(p=>[p.id,p]))
  const subjectsById=new Map(subjects.map(s=>[s.id,s]))
  const cpById=new Map(cps.map(c=>[c.id,c]))
  const sessionsById=new Map(sessions.map(s=>[s.id,s]))
  const sourceById=new Map(sources.map(s=>[s.id,s]))
  const all:ReviewItem[]=cards.filter(c=>notesById.has(c.note_id)).map(c=>{
    const n=notesById.get(c.note_id)!, p=projectsById.get(n.project_id)!, cp=cpById.get(n.checkpoint_id)
    return {cardId:c.id,noteId:n.id,noteNo:Number(n.no),ord:c.ord,type:n.type,kind:n.kind,
      front:n.front,back:n.back,projectSlug:p?.slug??'',glyph:subjectsById.get(p?.subject_id)?.glyph??'∫',
      checkpointCode:cp?.code??null,checkpointTitle:cp?.title??null,
      sessionNumber:sessionsById.get(n.session_id)?.number??null,
      sourceShort:sourceById.get(n.source_id)?.short??null,pageLabel:n.page_label??null,state:cardState(c)}
  })
  const {start}=studyDayBounds(Date.now(),settings.timeZone,settings.rolloverHour)
  const answered=reviews.filter(r=>r.reviewed_at>=new Date(start).toISOString()&&!r.undone_at)
  const due=dueToday(all,settings,{answeredToday:answered.length,newAnsweredToday:answered.filter(r=>r.state_before===0).length})
  const selected=due.filter(c=>{
    if(filter.newOnly&&c.state.state!==0)return false
    if(!filter.includeNew&&c.state.state===0)return false
    if(filter.decks.length&&!filter.decks.some(d=>d===`project:${c.projectSlug}`||d===`cp:${c.projectSlug}:${c.checkpointCode}`))return false
    if(filter.sessionId && sessionsById.get(notesById.get(c.noteId)?.session_id)?.id!==filter.sessionId)return false
    if(filter.conceptSlug){
      const n=notesById.get(c.noteId)
      if(concepts.find(x=>x.id===n?.concept_id)?.slug!==filter.conceptSlug)return false
    }
    return true
  })
  return selected
 }
 async recordReview(...args: Parameters<LemmaApi['recordReview']>): ReturnType<LemmaApi['recordReview']> {
  const [input]=args,db=liveClient()
  await owner(db)
  const result=checked(await db.rpc('record_review',{p_card:input.cardId,p_rating:input.rating,
    p_confidence:input.confidence,p_duration_ms:input.durationMs,p_next:cardStateDb(input.next)}))
  return {reviewId:Number(result)}
 }
 async undoReview(...args: Parameters<LemmaApi['undoReview']>): ReturnType<LemmaApi['undoReview']> {
  const [id]=args,db=liveClient()
  await owner(db)
  return cardState(checked(await db.rpc('undo_review',{p_review:id})) as Row)
 }
 async searchCards(...args: Parameters<LemmaApi['searchCards']>): ReturnType<LemmaApi['searchCards']> {
  const [query,slug]=args,db=liveClient(),uid=await owner(db)
  const [notes,projects,subjects,cps,cards,comments]=await Promise.all([
    rows(db,'notes',uid),rows(db,'projects',uid),rows(db,'subjects',uid),
    rows(db,'checkpoints',uid),rows(db,'cards',uid),rows(db,'card_comments',uid)
  ])
  const term=query.trim().toLocaleLowerCase()
  const matches=notes.filter(n=>{
    const p=projects.find(p=>p.id===n.project_id)
    return p && (!slug||p.slug===slug) && (!term||[n.front,n.back].some(text=>String(text).toLocaleLowerCase().includes(term)))
  }).slice(0,100)
  return matches.map(n=>{
    const project=projects.find(p=>p.id===n.project_id)!,subject=subjects.find(s=>s.id===project.subject_id)
    const cp=cps.find(c=>c.id===n.checkpoint_id)
    return {noteNo:Number(n.no),front:n.front,type:n.type,kind:n.kind,
      projectSlug:project.slug,glyph:subject?.glyph??'∫',checkpointCode:cp?.code??null,
      due:cards.filter(c=>c.note_id===n.id).sort((a,b)=>a.due.localeCompare(b.due))[0]?.due??null,
      status:n.status,openComments:comments.filter(c=>c.note_id===n.id&&c.status==='open').length}
  })
 }
 async getCard(...args: Parameters<LemmaApi['getCard']>): ReturnType<LemmaApi['getCard']> {
  const [no]=args,db=liveClient(),uid=await owner(db)
  const note=checked(await db.from('notes').select('*').eq('user_id',uid).eq('no',no).single()) as Row
  const [projects,cps,sessions,sources,cards,reviews,comments,proposals]=await Promise.all([
    rows(db,'projects',uid),rows(db,'checkpoints',uid),rows(db,'sessions',uid),rows(db,'sources',uid),
    rows(db,'cards',uid),rows(db,'reviews',uid),rows(db,'card_comments',uid),rows(db,'proposals',uid)
  ])
  const project=projects.find(x=>x.id===note.project_id)
  const cardRows=cards.filter(c=>c.note_id===note.id)
  const cardIds=new Set(cardRows.map(c=>c.id))
  const proposalMap=new Map(proposals.map(p=>[p.id,p]))
  return {note:{noteId:note.id,noteNo:Number(note.no),front:note.front,back:note.back,type:note.type,
    kind:note.kind,tags:note.tags??[],status:note.status,origin:note.origin,
    projectSlug:project?.slug??'',checkpointCode:cps.find(c=>c.id===note.checkpoint_id)?.code??null,
    sessionNumber:sessions.find(s=>s.id===note.session_id)?.number??null,
    sourceShort:sources.find(s=>s.id===note.source_id)?.short??null,pageLabel:note.page_label},
    cards:cardRows.map(c=>({ord:c.ord,state:cardState(c)})).sort((a,b)=>a.ord-b.ord),
    history:reviews.filter(r=>cardIds.has(r.card_id)&&!r.undone_at)
      .sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at))
      .map(r=>({reviewedAt:r.reviewed_at,rating:r.rating,confidence:r.confidence})),
    comments:comments.filter(c=>c.note_id===note.id).sort((a,b)=>b.no-a.no)
      .map(c=>commentRow(c,proposalMap.get(c.resolved_by_proposal)?.origin??null))}
 }
 async createNote(...args: Parameters<LemmaApi['createNote']>): ReturnType<LemmaApi['createNote']> {
  const [input]=args,db=liveClient(),uid=await owner(db)
  const project=checked(await db.from('projects').select('*').eq('user_id',uid).eq('slug',input.projectSlug).single()) as Row
  let checkpointId:string|null=null
  if(input.checkpointCode){
    const cp=checked(await db.from('checkpoints').select('id').eq('user_id',uid).eq('project_id',project.id).eq('code',input.checkpointCode).single()) as Row
    checkpointId=cp.id
  }
  const note=checked(await db.from('notes').insert({user_id:uid,project_id:project.id,checkpoint_id:checkpointId,
    front:input.front,back:input.back,type:input.type,kind:input.kind,origin:'user'}).select('*').single()) as Row
  const cardRows=noteOrds(input.front,input.type).map(ord=>({user_id:uid,note_id:note.id,ord}))
  const {error}=await db.from('cards').insert(cardRows)
  if(error){await db.from('notes').delete().eq('user_id',uid).eq('id',note.id);fail(error)}
  return {noteNo:Number(note.no)}
 }
 async updateNote(...args: Parameters<LemmaApi['updateNote']>): ReturnType<LemmaApi['updateNote']> {
  const [no,patch]=args,db=liveClient(),uid=await owner(db)
  const note=checked(await db.from('notes').select('*').eq('user_id',uid).eq('no',no).single()) as Row
  const oldCards=checked(await db.from('cards').select('*').eq('user_id',uid).eq('note_id',note.id)) as Row[]
  const newOrds=noteOrds(patch.front??note.front,patch.type??note.type)
  const adding=newOrds.filter(ord=>!oldCards.some(c=>c.ord===ord))
  const removing=oldCards.filter(c=>!newOrds.includes(c.ord)).map(c=>c.id)
  // Add first and remove last, so a recoverable failure never loses previously scheduled cards.
  if(adding.length){
    const {error}=await db.from('cards').insert(adding.map(ord=>({user_id:uid,note_id:note.id,ord})))
    if(error) fail(error)
  }
  const {error}=await db.from('notes').update(toDb(patch)).eq('no',no).eq('user_id',uid)
  if(error) {
    if(adding.length) await db.from('cards').delete().eq('user_id',uid).eq('note_id',note.id).in('ord',adding)
    fail(error)
  }
  if(removing.length) {
    const {error:removeError}=await db.from('cards').delete().eq('user_id',uid).in('id',removing)
    if(removeError) fail(removeError)
  }
 }
 async setNoteStatus(...args: Parameters<LemmaApi['setNoteStatus']>): ReturnType<LemmaApi['setNoteStatus']> {
  const [no,status]=args,db=liveClient(),uid=await owner(db)
  const {data,error}=await db.from('notes').update({status}).eq('no',no).eq('user_id',uid).select('id').single()
  checked({data,error})
 }
 async addComment(...args: Parameters<LemmaApi['addComment']>): ReturnType<LemmaApi['addComment']> {
  const [no,body]=args,db=liveClient(),uid=await owner(db)
  const note=checked(await db.from('notes').select('id').eq('user_id',uid).eq('no',no).single()) as Row
  return commentRow(checked(await db.from('card_comments').insert({user_id:uid,note_id:note.id,body}).select('*').single()) as Row)
 }
 async dismissComment(...args: Parameters<LemmaApi['dismissComment']>): ReturnType<LemmaApi['dismissComment']> {
  const [no]=args,db=liveClient(),uid=await owner(db)
  checked(await db.from('card_comments').update({status:'dismissed',resolved_at:new Date().toISOString()})
    .eq('user_id',uid).eq('no',no).select('id').single())
 }
 async resolveMisconception(...args: Parameters<LemmaApi['resolveMisconception']>): ReturnType<LemmaApi['resolveMisconception']> {
  const [id]=args,db=liveClient(),uid=await owner(db)
  checked(await db.from('misconceptions').update({resolved_at:new Date().toISOString()})
    .eq('id',id).eq('user_id',uid).select('id').single())
 }
 async getAtlas(...args: Parameters<LemmaApi['getAtlas']>): ReturnType<LemmaApi['getAtlas']> {
  const db=liveClient(),uid=await owner(db)
  const [subjects,concepts,links,cpConcepts,cps,projects,prereqs,misconceptions,notes,cards,reviews,due]=await Promise.all([
    rows(db,'subjects',uid),rows(db,'concepts',uid),rows(db,'concept_links',uid),
    rows(db,'checkpoint_concepts',uid),rows(db,'checkpoints',uid),rows(db,'projects',uid),
    rows(db,'checkpoint_prereqs',uid),rows(db,'misconceptions',uid),rows(db,'notes',uid),
    rows(db,'cards',uid),rows(db,'reviews',uid),
    this.getReviewItems({decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false})
  ])
  const cpById=new Map(cps.map(c=>[c.id,c]))
  const cached=new Map<string,CheckpointView>(),seen=new Set<string>()
  const getView=(c:Row):CheckpointView=>{
    if(cached.has(c.id))return cached.get(c.id)!
    if(seen.has(c.id)) throw new LemmaError('invalid','Checkpoint prerequisite cycle')
    seen.add(c.id)
    const pre=prereqs.filter(p=>p.checkpoint_id===c.id).map(p=>cpById.get(p.prereq_id)).filter(Boolean) as Row[]
    const v=checkpointRow(c,pre.map(getView))
    cached.set(c.id,v);seen.delete(c.id);return v
  }
  const conceptNodes=concepts.map(c=>{
    const linkedCps=cpConcepts.filter(x=>x.concept_id===c.id).map(x=>cpById.get(x.checkpoint_id)).filter(Boolean) as Row[]
    const relevantNotes=notes.filter(n=>n.concept_id===c.id)
    const cardIds=new Set(cards.filter(card=>relevantNotes.some(n=>n.id===card.note_id)).map(card=>card.id))
    const again=reviews.filter(r=>cardIds.has(r.card_id)&&!r.undone_at&&r.rating===1)
      .map(r=>({reviewedAt:r.reviewed_at,rating:r.rating}))
    return {id:c.id,slug:c.slug,name:c.name,blurb:c.blurb,subjectId:c.subject_id,
      status:conceptStatus(linkedCps.map(getView).map(v=>v.ui),
        misconceptions.some(m=>m.concept_id===c.id&&!m.resolved_at),again),
      pinX:c.pin_x,pinY:c.pin_y,
      checkpointRefs:linkedCps.map(cp=>({projectSlug:projects.find(p=>p.id===cp.project_id)?.slug??'',code:cp.code})),
      dueCards:due.filter(item=>relevantNotes.some(n=>n.id===item.noteId)).length}
  })
  return {subjects:subjects.map(subjectRow),concepts:conceptNodes,
    links:links.map(l=>({fromId:l.from_id,toId:l.to_id,kind:l.kind}))} as AtlasGraph
 }
 async pinConcept(...args: Parameters<LemmaApi['pinConcept']>): ReturnType<LemmaApi['pinConcept']> {
  const [id,x,y]=args,db=liveClient(),uid=await owner(db)
  if(!Number.isFinite(x)||!Number.isFinite(y)) throw new LemmaError('invalid','Invalid Atlas coordinates')
  checked(await db.from('concepts').update({pin_x:x,pin_y:y}).eq('id',id).eq('user_id',uid).select('id').single())
 }
 async getReviewLog(...args: Parameters<LemmaApi['getReviewLog']>): ReturnType<LemmaApi['getReviewLog']> {
  const db=liveClient(),uid=await owner(db)
  return (await rows(db,'reviews',uid)).filter(r=>!r.undone_at)
    .map(r=>({cardId:r.card_id,reviewedAt:r.reviewed_at,rating:r.rating}))
 }
 async getInsightData(...args: Parameters<LemmaApi['getInsightData']>): ReturnType<LemmaApi['getInsightData']> {
  const [days]=args,db=liveClient(),uid=await owner(db)
  const cutoff=new Date(Date.now()-days*86_400_000).toISOString()
  const [reviews,cards,notes,projects,subjects,sessions,events,cps,misconceptions,concepts]=await Promise.all([
    rows(db,'reviews',uid),rows(db,'cards',uid),rows(db,'notes',uid),rows(db,'projects',uid),
    rows(db,'subjects',uid),rows(db,'sessions',uid),rows(db,'session_events',uid),
    rows(db,'checkpoints',uid),rows(db,'misconceptions',uid),rows(db,'concepts',uid)
  ])
  const cardById=new Map(cards.map(c=>[c.id,c]))
  const noteById=new Map(notes.map(n=>[n.id,n]))
  const cpsById=new Map(cps.map(c=>[c.id,c]))
  const sessionsById=new Map(sessions.map(s=>[s.id,s]))
  return {reviews:reviews.filter(r=>r.reviewed_at>=cutoff&&!r.undone_at).map(r=>({
      reviewedAt:r.reviewed_at,rating:r.rating,stateBefore:r.state_before,confidence:r.confidence,
      durationMs:r.duration_ms,projectId:noteById.get(cardById.get(r.card_id)?.note_id)?.project_id??''
    })),sessions:sessions.filter(s=>s.started_at>=cutoff&&s.state==='ended').map(s=>({
      startedAt:s.started_at,minutes:s.minutes??0,projectId:s.project_id,goalMet:s.goal_met
    })),checkpointEvents:events.filter(e=>e.created_at>=cutoff && (e.kind==='evidence'||e.kind==='recheck') && e.outcome)
      .map(e=>{const cp=cpsById.get(e.checkpoint_id)
        return {at:e.created_at,kind:e.kind==='evidence'&&e.outcome==='demonstrated'?'demonstrated':
          e.outcome==='demonstrated'?'recheck_ok':'recheck_fail',
          checkpointCode:cp?.code??'',projectId:cp?.project_id??sessionsById.get(e.session_id)?.project_id??''}
      }),projects:projects.map(p=>({id:p.id,title:p.title,subject:subjectRow(subjects.find(s=>s.id===p.subject_id)!)})),
    misconceptions:misconceptions.map(m=>({label:m.label,times:m.times,conceptName:concepts.find(c=>c.id===m.concept_id)?.name??null}))} as import('../types').InsightData
 }
 async exportAll(...args: Parameters<LemmaApi['exportAll']>): ReturnType<LemmaApi['exportAll']> {
  const db=liveClient(),uid=await owner(db)
  const tables=['settings','styles','subjects','projects','sources','source_pages','concepts','concept_links',
    'checkpoints','checkpoint_prereqs','checkpoint_concepts','sessions','session_events','misconceptions',
    'notes','cards','reviews','card_comments','proposals']
  const result:Record<string,Row[]>={}
  for(const table of tables){
    result[table]=await rows(db,table,uid)
    // Export must not leak the live connector credential if the backup file is shared.
    if(table==='settings') result[table]=result[table].map(({connector_secret: _secret,...safe})=>safe)
  }
  return new Blob([JSON.stringify({format:'lemma-backup-v1',exportedAt:new Date().toISOString(),tables:result},null,2)],
    {type:'application/json'})
 }
}
