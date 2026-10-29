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
 async getHome(..._args: Parameters<LemmaApi['getHome']>): ReturnType<LemmaApi['getHome']> { throw notImplemented('getHome') }
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
 async getProject(..._args: Parameters<LemmaApi['getProject']>): ReturnType<LemmaApi['getProject']> { throw notImplemented('getProject') }
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
 async getCheckpoint(..._args: Parameters<LemmaApi['getCheckpoint']>): ReturnType<LemmaApi['getCheckpoint']> { throw notImplemented('getCheckpoint') }
 async addSource(..._args: Parameters<LemmaApi['addSource']>): ReturnType<LemmaApi['addSource']> { throw notImplemented('addSource') }
 async deleteSource(..._args: Parameters<LemmaApi['deleteSource']>): ReturnType<LemmaApi['deleteSource']> { throw notImplemented('deleteSource') }
 async listSessions(..._args: Parameters<LemmaApi['listSessions']>): ReturnType<LemmaApi['listSessions']> { throw notImplemented('listSessions') }
 async getSession(..._args: Parameters<LemmaApi['getSession']>): ReturnType<LemmaApi['getSession']> { throw notImplemented('getSession') }
 async listProposals(..._args: Parameters<LemmaApi['listProposals']>): ReturnType<LemmaApi['listProposals']> { throw notImplemented('listProposals') }
 async getProposal(..._args: Parameters<LemmaApi['getProposal']>): ReturnType<LemmaApi['getProposal']> { throw notImplemented('getProposal') }
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
