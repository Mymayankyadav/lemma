import type { LemmaApi } from '../api'

import { liveClient } from './client'
import { checked, fail, owner, rows, toDb, settingsRow, styleRow, subjectRow, projectRow, sourceRow, sessionRow, checkpointRow, cardState, cardStateDb, commentRow, slugify, noteOrds, type Row } from './helpers'
import { dueToday, checkpointUi, projectProgress, conceptStatus } from '../../lib/derive'
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
 async addSource(..._args: Parameters<LemmaApi['addSource']>): ReturnType<LemmaApi['addSource']> { throw notImplemented('addSource') }
 async deleteSource(..._args: Parameters<LemmaApi['deleteSource']>): ReturnType<LemmaApi['deleteSource']> { throw notImplemented('deleteSource') }
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
 async approveProposal(..._args: Parameters<LemmaApi['approveProposal']>): ReturnType<LemmaApi['approveProposal']> { throw notImplemented('approveProposal') }
 async rejectProposal(..._args: Parameters<LemmaApi['rejectProposal']>): ReturnType<LemmaApi['rejectProposal']> { throw notImplemented('rejectProposal') }
 async approveAllCards(..._args: Parameters<LemmaApi['approveAllCards']>): ReturnType<LemmaApi['approveAllCards']> { throw notImplemented('approveAllCards') }
 async getDeckTree(..._args: Parameters<LemmaApi['getDeckTree']>): ReturnType<LemmaApi['getDeckTree']> { throw notImplemented('getDeckTree') }
 async getReviewItems(..._args: Parameters<LemmaApi['getReviewItems']>): ReturnType<LemmaApi['getReviewItems']> { throw notImplemented('getReviewItems') }
 async recordReview(..._args: Parameters<LemmaApi['recordReview']>): ReturnType<LemmaApi['recordReview']> { throw notImplemented('recordReview') }
 async undoReview(..._args: Parameters<LemmaApi['undoReview']>): ReturnType<LemmaApi['undoReview']> { throw notImplemented('undoReview') }
 async searchCards(..._args: Parameters<LemmaApi['searchCards']>): ReturnType<LemmaApi['searchCards']> { throw notImplemented('searchCards') }
 async getCard(..._args: Parameters<LemmaApi['getCard']>): ReturnType<LemmaApi['getCard']> { throw notImplemented('getCard') }
 async createNote(..._args: Parameters<LemmaApi['createNote']>): ReturnType<LemmaApi['createNote']> { throw notImplemented('createNote') }
 async updateNote(..._args: Parameters<LemmaApi['updateNote']>): ReturnType<LemmaApi['updateNote']> { throw notImplemented('updateNote') }
 async setNoteStatus(..._args: Parameters<LemmaApi['setNoteStatus']>): ReturnType<LemmaApi['setNoteStatus']> { throw notImplemented('setNoteStatus') }
 async addComment(..._args: Parameters<LemmaApi['addComment']>): ReturnType<LemmaApi['addComment']> { throw notImplemented('addComment') }
 async dismissComment(..._args: Parameters<LemmaApi['dismissComment']>): ReturnType<LemmaApi['dismissComment']> { throw notImplemented('dismissComment') }
 async resolveMisconception(..._args: Parameters<LemmaApi['resolveMisconception']>): ReturnType<LemmaApi['resolveMisconception']> { throw notImplemented('resolveMisconception') }
 async getAtlas(..._args: Parameters<LemmaApi['getAtlas']>): ReturnType<LemmaApi['getAtlas']> { throw notImplemented('getAtlas') }
 async pinConcept(..._args: Parameters<LemmaApi['pinConcept']>): ReturnType<LemmaApi['pinConcept']> { throw notImplemented('pinConcept') }
 async getReviewLog(..._args: Parameters<LemmaApi['getReviewLog']>): ReturnType<LemmaApi['getReviewLog']> { throw notImplemented('getReviewLog') }
 async getInsightData(..._args: Parameters<LemmaApi['getInsightData']>): ReturnType<LemmaApi['getInsightData']> { throw notImplemented('getInsightData') }
 async exportAll(..._args: Parameters<LemmaApi['exportAll']>): ReturnType<LemmaApi['exportAll']> { throw notImplemented('exportAll') }
}
