import type { LemmaApi } from '../api'
import { textKind } from '../../pdf/text-source'
import { liveClient } from './client'
import { checked, fail, owner, rows, toDb, settingsRow, styleRow, subjectRow, projectRow, sourceRow, sessionRow, checkpointRow, cardState, cardStateDb, commentRow, slugify, noteOrds, type Row } from './helpers'
import { projectProgress, conceptStatus } from '../../lib/derive'
import { studyDay } from '../../lib/calendar'
import { ingest } from '../../pdf/ingest'
import type { ProjectSummary, CheckpointView, ReviewItem, Proposal, AtlasGraph } from '../types'
import { LemmaError, notImplemented } from '../api'
import { mergeNotifyPrefs } from '../notify'
import { decodeCardPageCursor, encodeCardPageCursor, uuidCardPageId } from '../card-cursor'

type HomeReviewOutlook={
 decks:import('../types').DeckNode[]
 forecast:{day:string;due:number}[]
}
// Coalesce concurrent Today widgets into one HTTP request, but never cache
// settled data: grading a card must refresh due counts immediately.
let outlookPending:{uid:string;promise:Promise<HomeReviewOutlook>}|null=null
function homeReviewOutlook(db:ReturnType<typeof liveClient>,uid:string):Promise<HomeReviewOutlook>{
 if(outlookPending?.uid===uid)return outlookPending.promise
 const promise=Promise.resolve(db.rpc('home_review_outlook')).then(result=>checked(result) as HomeReviewOutlook)
 outlookPending={uid,promise}
 const clear=()=>{if(outlookPending?.promise===promise)outlookPending=null}
 void promise.then(clear,clear)
 return promise
}

/** Owner-scoped implementation; all queries use the browser session and RLS. */
export class LiveAdapter implements LemmaApi {
 readonly mode = 'live' as const
 /** Reminders stay unavailable in live mode until NOTIF-6. */
 async listPushDevices(..._args:Parameters<LemmaApi['listPushDevices']>):ReturnType<LemmaApi['listPushDevices']> {throw notImplemented('listPushDevices')}
 async addPushDevice(..._args:Parameters<LemmaApi['addPushDevice']>):ReturnType<LemmaApi['addPushDevice']> {throw notImplemented('addPushDevice')}
 async renamePushDevice(..._args:Parameters<LemmaApi['renamePushDevice']>):ReturnType<LemmaApi['renamePushDevice']> {throw notImplemented('renamePushDevice')}
 async removePushDevice(..._args:Parameters<LemmaApi['removePushDevice']>):ReturnType<LemmaApi['removePushDevice']> {throw notImplemented('removePushDevice')}
 async restorePushDevice(..._args:Parameters<LemmaApi['restorePushDevice']>):ReturnType<LemmaApi['restorePushDevice']> {throw notImplemented('restorePushDevice')}
 async touchPushDevice(..._args:Parameters<LemmaApi['touchPushDevice']>):ReturnType<LemmaApi['touchPushDevice']> {throw notImplemented('touchPushDevice')}
 async listRecentNotifications(..._args:Parameters<LemmaApi['listRecentNotifications']>):ReturnType<LemmaApi['listRecentNotifications']> {throw notImplemented('listRecentNotifications')}
 async listNotifyHolds(..._args:Parameters<LemmaApi['listNotifyHolds']>):ReturnType<LemmaApi['listNotifyHolds']> {throw notImplemented('listNotifyHolds')}
 async clearNotifyHold(..._args:Parameters<LemmaApi['clearNotifyHold']>):ReturnType<LemmaApi['clearNotifyHold']> {throw notImplemented('clearNotifyHold')}
 async sendTestNotification(..._args:Parameters<LemmaApi['sendTestNotification']>):ReturnType<LemmaApi['sendTestNotification']> {throw notImplemented('sendTestNotification')}
 async previewNotifications(..._args:Parameters<LemmaApi['previewNotifications']>):ReturnType<LemmaApi['previewNotifications']> {throw notImplemented('previewNotifications')}
 /** Read at most 21 reviews, with stable (reviewed_at,id) keyset paging. */
 async getCardHistoryPage(...args: Parameters<LemmaApi['getCardHistoryPage']>): ReturnType<LemmaApi['getCardHistoryPage']> {
  const [no,cursor]=args,db=liveClient(),uid=await owner(db)
  const key=decodeCardPageCursor(cursor,'reviews',no)
  const note=checked(await db.from('notes').select('id').eq('user_id',uid).eq('no',no).single()) as Row
  const cards=checked(await db.from('cards').select('id').eq('user_id',uid).eq('note_id',note.id)) as Row[]
  if(!cards.length)return {rows:[],nextCursor:null}
  let query=db.from('reviews').select('id,reviewed_at,rating,confidence')
   .eq('user_id',uid).in('card_id',cards.map(c=>c.id)).is('undone_at',null)
  if(key)query=query.or(`reviewed_at.lt.${key.at},and(reviewed_at.eq.${key.at},id.lt.${key.id})`)
  const page=checked(await query.order('reviewed_at',{ascending:false})
   .order('id',{ascending:false}).limit(21)) as Row[]
  const visible=page.slice(0,20)
  return {rows:visible.map(r=>({reviewedAt:r.reviewed_at,rating:r.rating,confidence:r.confidence})),
   nextCursor:page.length>20?encodeCardPageCursor('reviews',no,{at:visible[19].reviewed_at,id:String(visible[19].id)}):null}
 }
 /** Read at most 21 comments; origin metadata is resolved only for this page. */
 async getCardCommentsPage(...args: Parameters<LemmaApi['getCardCommentsPage']>): ReturnType<LemmaApi['getCardCommentsPage']> {
  const [no,cursor]=args,db=liveClient(),uid=await owner(db)
  const key=decodeCardPageCursor(cursor,'comments',no)
  // Demo comments use numeric no values; live comments have UUID primary keys.
  // Reject a demo/forged cursor before it reaches the UUID PostgREST comparator.
  if(key && !uuidCardPageId.test(key.id))throw new LemmaError('invalid','Invalid Card detail page cursor')
  const note=checked(await db.from('notes').select('id').eq('user_id',uid).eq('no',no).single()) as Row
  let query=db.from('card_comments').select('id,no,body,status,created_at,resolved_at,resolved_by_proposal')
   .eq('user_id',uid).eq('note_id',note.id)
  if(key)query=query.or(`created_at.lt.${key.at},and(created_at.eq.${key.at},id.lt.${key.id})`)
  const page=checked(await query.order('created_at',{ascending:false})
   .order('id',{ascending:false}).limit(21)) as Row[]
  const visible=page.slice(0,20)
  const ids=[...new Set(visible.map(c=>c.resolved_by_proposal).filter((id):id is string=>typeof id==='string'))]
  const proposals=ids.length
   ? checked(await db.from('proposals').select('id,origin').eq('user_id',uid).in('id',ids)) as Row[]
   : []
  const origins=new Map(proposals.map(p=>[p.id,p.origin]))
  return {rows:visible.map(c=>commentRow(c,origins.get(c.resolved_by_proposal)??null)),
   nextCursor:page.length>20?encodeCardPageCursor('comments',no,{at:visible[19].created_at,id:String(visible[19].id)}):null}
 }
 /** DB-4 implementation supplies these APIs; legacy adapters stay unchanged until then. */
 async updateSubject(...args: Parameters<LemmaApi['updateSubject']>): ReturnType<LemmaApi['updateSubject']> {
  const [id,patch]=args,db=liveClient(),uid=await owner(db)
  if(!Object.keys(patch).length){
   const subject=checked(await db.from('subjects').select('*').eq('id',id).eq('user_id',uid).single()) as Row
   return subjectRow(subject)
  }
  return subjectRow(checked(await db.from('subjects').update(toDb(patch))
   .eq('id',id).eq('user_id',uid).select('*').single()) as Row)
 }
 async mergeSubjects(...args: Parameters<LemmaApi['mergeSubjects']>): ReturnType<LemmaApi['mergeSubjects']> {
  const [sourceId,targetId]=args,db=liveClient()
  await owner(db)
  if(sourceId===targetId)throw new LemmaError('invalid','Choose two different subjects to merge')
  checked(await db.rpc('merge_subjects',{p_source:sourceId,p_target:targetId}))
 }
 async createProjectDraft(...args: Parameters<LemmaApi['createProjectDraft']>): ReturnType<LemmaApi['createProjectDraft']> {
  const [input]=args,db=liveClient(),uid=await owner(db)
  const title=input.title.trim(),base=slugify(title)
  if(!title||title.length>100||base.length<2)throw new LemmaError('invalid','Choose a project name between 2 and 100 characters')
  for(let n=1;n<100;n++){
   const suffix=n===1?'':'-'+n
   const slug=base.slice(0,40-suffix.length).replace(/-$/,'')+suffix
   const result=await db.from('projects').insert({
    user_id:uid,title,slug,goal:null,subject_id:null,style:'socratic',status:'planning',system:false
   }).select('*').single()
   if(!result.error)return projectRow(result.data as Row)
   if(result.error.code!=='23505')fail(result.error)
  }
  throw new LemmaError('conflict','Too many projects have this name')
 }
 async updateSource(...args: Parameters<LemmaApi['updateSource']>): ReturnType<LemmaApi['updateSource']> {
  const [id,patch]=args,db=liveClient(),uid=await owner(db)
  const changes:Row={}
  if(patch.title!==undefined){
   const title=patch.title.trim()
   if(!title||title.length>150)throw new LemmaError('invalid','Source title must be 1 to 150 characters')
   changes.title=title
  }
  if(patch.kind!==undefined){
   if(!['book','notes','slides','problems','syllabus','exam','other'].includes(patch.kind))
    throw new LemmaError('invalid','Invalid source kind')
   changes.kind=patch.kind
  }
  if(!Object.keys(changes).length)
   return sourceRow(checked(await db.from('sources').select('*').eq('id',id).eq('user_id',uid).single()) as Row)
  return sourceRow(checked(await db.from('sources').update(changes).eq('id',id).eq('user_id',uid).select('*').single()) as Row)
 }
 async listPlanRevisions(...args: Parameters<LemmaApi['listPlanRevisions']>): ReturnType<LemmaApi['listPlanRevisions']> {
  const [slug]=args,db=liveClient(),uid=await owner(db)
  const project=checked(await db.from('projects').select('id').eq('slug',slug).eq('user_id',uid).eq('system',false).single()) as Row
  const revisions=checked(await db.from('v_plan_revisions').select('revision,approved_at,summary,proposal_id')
   .eq('user_id',uid).eq('project_id',project.id).order('revision',{ascending:false})) as Row[]
  return revisions.map(row=>({revision:Number(row.revision),approvedAt:row.approved_at,summary:row.summary,proposalId:row.proposal_id}))
 }
 async getReviewForecast(): ReturnType<LemmaApi['getReviewForecast']> {
  const db=liveClient(),uid=await owner(db)
  return (await homeReviewOutlook(db,uid)).forecast
 }
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
  let result=checked(await db.rpc('bootstrap')) as unknown as Row
  // Keep scheduling tied to the owner's local study day, not the server UTC date.
  if(typeof window !== 'undefined'){
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone
    if(zone && zone!==result.time_zone){
      const uid=await owner(db)
      result=checked(await db.from('settings').update({time_zone:zone})
        .eq('user_id',uid).select('*').single()) as unknown as Row
    }

  }
  return settingsRow(result)
 }
 async getSettings(...args: Parameters<LemmaApi['getSettings']>): ReturnType<LemmaApi['getSettings']> {
  const db=liveClient(), uid=await owner(db)
  return settingsRow(checked(await db.from('settings').select('*').eq('user_id',uid).single()) as Row)
 }
 async updateSettings(...args: Parameters<LemmaApi['updateSettings']>): ReturnType<LemmaApi['updateSettings']> {
  const [patch]=args
  const db=liveClient(), uid=await owner(db)
  const dbPatch=toDb(patch)
  if(patch.notify && typeof patch.notify==='object'){
   const before=await this.getSettings()
   dbPatch.notify=mergeNotifyPrefs(before.notify,patch.notify)
  }
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
  return settingsRow(row as unknown as Row)
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
  const db=liveClient()
  await owner(db)
  // ST-5: a single owner-scoped RPC computes Today, the active resume target,
  // pending count and the daily review quota without downloading full tables.
  return checked(await db.rpc('home_summary')) as import('../types').HomeSummary
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
  const db=liveClient()
  await owner(db)
  // ST-5: one owner-scoped summary RPC replaces full-table downloads of
  // projects, checkpoints, prerequisites, notes, cards, sessions and sources.
  return checked(await db.rpc('project_summaries')) as ProjectSummary[]
 }
 async getProject(...args: Parameters<LemmaApi['getProject']>): ReturnType<LemmaApi['getProject']> {
  const [slug]=args,db=liveClient(),uid=await owner(db)
  const project=checked(await db.from('projects').select('*').eq('slug',slug).eq('user_id',uid).neq('status','archived').eq('system',false).single()) as Row
  const [subjects,cps,prereqs,proposalRows,sources,sessionList,settings,due]=await Promise.all([
    rows(db,'subjects',uid),rows(db,'checkpoints',uid),rows(db,'checkpoint_prereqs',uid),
    rows(db,'proposals',uid),rows(db,'sources',uid),this.listSessions(slug),this.getSettings(),
    this.getReviewItems({decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false})
  ])
  const today=studyDay(Date.now(),settings.timeZone,settings.rolloverHour),forProject=cps.filter(c=>c.project_id===project.id)
  const byId=new Map(forProject.map(c=>[c.id,c])),cached=new Map<string,CheckpointView>(),visiting=new Set<string>()
  const view=(cp:Row): CheckpointView=>{
    if(cached.has(cp.id))return cached.get(cp.id)!
    if(visiting.has(cp.id)) throw new LemmaError('invalid','Checkpoint prerequisite cycle')
    visiting.add(cp.id)
    const parents=prereqs.filter(p=>p.checkpoint_id===cp.id).map(p=>byId.get(p.prereq_id)).filter(Boolean) as Row[]
    const v=checkpointRow(cp,parents.map(view),today);cached.set(cp.id,v);visiting.delete(cp.id);return v
  }
  const views:CheckpointView[]=forProject.map(view)
  for(const v of views) v.dueCards=due.filter(c=>c.projectSlug===slug&&c.checkpointCode===v.code).length
  const pending=proposalRows.filter(p=>p.project_id===project.id&&p.status==='pending')
  for (const proposal of pending.filter(p=>p.kind==='plan_change')){
    for(const op of (proposal.payload?.ops??[]) as Row[]){
      if(op.op!=='add')continue
      const previous=views.find(c=>c.code===op.after)
      const next=views.filter(c=>c.position>(previous?.position??0)).sort((a,b)=>a.position-b.position)[0]
      const position=previous&&next?(previous.position+next.position)/2:(previous?.position??0)+10
      const candidate=op.after?.match(/^CP(\d+)$/)?.[1]
      const proposedCode=op.code??(candidate?'CP'+candidate+'a':'Proposed')
      views.push({id:'proposed:'+proposal.id+':'+views.length,code:proposedCode,
        title:op.title,position,ui:'proposed',
        currentStep:0,stepsTotal:op.steps?.length??0,recheckDue:null,dueCards:0})
    }
  }
  views.sort((a,b)=>a.position-b.position)
  const progress=projectProgress(views)
  return {project:projectRow(project),subject:subjectRow(subjects.find(s=>s.id===project.subject_id)??{id:'',name:'Unassigned',glyph:'∫',hue:'slate',position:-1}),
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
  // Detect same-content PDFs before extraction or a second storage upload.
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer())
  const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')
  const same=checked(await db.from('sources').select('id').eq('user_id',uid).eq('project_id',projectId)
   .eq('sha256',sha256).limit(1)) as Row[]
  if(same.length)throw new LemmaError('conflict','Already added')
  const document=await ingest(file,{onProgress})
  // .tex and .md sources are stored as their text only (the storage bucket holds PDFs).
  const textOnly=textKind(file)!==null
  const basename=file.name.replace(/\.(pdf|tex|latex|ltx|md|markdown)$/i,'').trim()||'Untitled source'
  const existing=await rows(db,'sources',uid)
  const used=new Set(existing.filter(s=>s.project_id===projectId).map(s=>s.short))
  const base=slugify(basename).replace(/-/g,'').slice(0,17)||'source'
  let short=base,index=2
  while(used.has(short)){short=base.slice(0,17)+index++}
  const source=checked(await db.from('sources').insert({user_id:uid,project_id:projectId,
    title:basename.slice(0,120),short,filename:file.name,bytes:file.size,status:'uploading',sha256,
    page_count:document.pageCount,has_text:document.hasText,outline:document.outline
  }).select('*').single()) as Row
  const storagePath=`${uid}/${source.id}.pdf`
  const progress=(phase:'uploading'|'saving'|'done'|'failed',page:number,message:string)=>
    onProgress({phase,page,pageCount:document.pageCount,message})
  try {
    if(!textOnly){
      progress('uploading',0,'Uploading original PDF')
      const {error:uploadError}=await db.storage.from('sources').upload(storagePath,file,{upsert:false,contentType:'application/pdf'})
      if(uploadError) fail(uploadError)
    }
    checked(await db.from('sources').update({storage_path:textOnly?null:storagePath,status:'extracting'})
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
    // An incomplete upload is not a usable source. Clean up only this attempt,
    // allowing the queue's Retry action to reuse the same content fingerprint.
    if(!textOnly)await db.storage.from('sources').remove([storagePath]).catch(()=>undefined)
    await db.from('sources').delete().eq('id',source.id).eq('user_id',uid)
    progress('failed',0,'Source upload failed')
    throw error
  }
 }
 async deleteSource(...args: Parameters<LemmaApi['deleteSource']>): ReturnType<LemmaApi['deleteSource']> {
  const [id]=args,db=liveClient(),uid=await owner(db)
  const source=checked(await db.from('sources').select('*').eq('user_id',uid).eq('id',id).single()) as Row
  // Keep the PDF binary for DB-2 undo; only the audited rows are deleted.
  checked(await db.from('sources').delete().eq('id',id).eq('user_id',uid).select('id').single())
 }
 async getSourceTranscriptionStats(projectId:string):Promise<import('../types').SourceTranscriptionStat[]> {
  const db=liveClient()
  await owner(db)
  // The SQL aggregate returns at most one row per source, regardless of PDF page count.
  // It filters auth.uid() and joins pages on user_id under invoker RLS.
  const rows=checked(await db.rpc('source_transcription_stats',{p_project_id:projectId})) as Row[]
  return rows.map(row=>({
   sourceId:row.source_id as string,
   transcribed:Number(row.transcribed),
   needsCheck:Number(row.needs_check),
  }))
 }
 async getSourcePage(sourceId:string,page:number):Promise<import('../types').TranscribedSourcePage|null>{
  if(!Number.isSafeInteger(page)||page<1)throw new LemmaError('invalid','Invalid PDF page')
  const db=liveClient(),uid=await owner(db)
  const src=checked(await db.from('sources').select('id').eq('id',sourceId).eq('user_id',uid).single()) as Row
  const {data,error}=await db.from('source_pages')
   .select('source_id,page,label,body,transcribed_by,confidence')
   .eq('user_id',uid).eq('source_id',src.id).eq('page',page).maybeSingle()
  if(error)fail(error)
  return data?{sourceId:data.source_id,page:data.page,label:data.label??null,body:data.body??'',
   transcribedBy:data.transcribed_by??null,confidence:data.confidence??null}:null
 }
 async getTranscribedPagesForExport(sourceId:string):Promise<import('../types').TranscribedSourcePage[]>{
  const db=liveClient(),uid=await owner(db)
  checked(await db.from('sources').select('id').eq('id',sourceId).eq('user_id',uid).single())
  const result:import('../types').TranscribedSourcePage[]=[]
  for(let offset=0;;offset+=100){
   const rows=checked(await db.from('source_pages')
    .select('source_id,page,label,body,transcribed_by,confidence')
    .eq('user_id',uid).eq('source_id',sourceId).not('transcribed_at','is',null)
    .order('page').range(offset,offset+99)) as Row[]
   for(const row of rows)result.push({
    sourceId:row.source_id,page:row.page,label:row.label??null,
    body:row.body??'',transcribedBy:row.transcribed_by??null,confidence:row.confidence??null,
   })
   if(rows.length<100)break
  }
  return result
 }
 async updateSourcePage(sourceId:string,page:number,patch:{body?:string;confidence?:'high'|'check'}):Promise<import('../types').TranscribedSourcePage>{
  if(!Number.isSafeInteger(page)||page<1)throw new LemmaError('invalid','Invalid PDF page')
  const db=liveClient(),uid=await owner(db)
  const source=checked(await db.from('sources').select('id').eq('user_id',uid).eq('id',sourceId).single()) as Row
  const changes:Row={}
  if(patch.body!==undefined){
   if(patch.body.length>8000||!patch.body.trim()||/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(patch.body)||/<!--/.test(patch.body))
    throw new LemmaError('invalid','Transcriptions must be 1–8,000 characters of Markdown/LaTeX, without raw HTML')
   changes.body=patch.body
  }
  if(patch.confidence!==undefined){
   if(patch.confidence!=='high'&&patch.confidence!=='check')throw new LemmaError('invalid','Unknown confidence')
   changes.confidence=patch.confidence
  }
  if(!Object.keys(changes).length)throw new LemmaError('invalid','No page change requested')
  const data=checked(await db.from('source_pages').update(changes)
   .eq('user_id',uid).eq('source_id',source.id).eq('page',page)
   .not('transcribed_at','is',null)
   .select('source_id,page,label,body,transcribed_by,confidence').single()) as Row
  return {sourceId:data.source_id,page:data.page,label:data.label??null,body:data.body??'',
   transcribedBy:data.transcribed_by??null,confidence:data.confidence??null}
 }
 async getSourcePdfUrl(sourceId:string):Promise<string|null>{
  const db=liveClient(),uid=await owner(db)
  const src=checked(await db.from('sources').select('storage_path').eq('user_id',uid).eq('id',sourceId).single()) as Row
  if(!src.storage_path)return null
  const {data,error}=await db.storage.from('sources').createSignedUrl(src.storage_path,300)
  if(error)fail(error)
  return data.signedUrl
 }
 async listSessions(...args: Parameters<LemmaApi['listSessions']>): ReturnType<LemmaApi['listSessions']> {
  const [slug]=args, db=liveClient(),uid=await owner(db)
  const [projects,cps,sessions]=await Promise.all([rows(db,'projects',uid),rows(db,'checkpoints',uid),rows(db,'sessions',uid)])
  const projectsById=new Map(projects.filter(p=>p.system!==true).map(p=>[p.id,p]))
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
  checked(await db.rpc('approve_proposal',{p_id:id,p_edit:edit?toDb({...edit}):null}))
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
  const db=liveClient(),uid=await owner(db)
  return (await homeReviewOutlook(db,uid)).decks
 }
 async getReviewItems(...args: Parameters<LemmaApi['getReviewItems']>): ReturnType<LemmaApi['getReviewItems']> {
  const [filter]=args,db=liveClient()
  await owner(db)
  // Daily quotas, sibling deduplication and filters run in PostgreSQL before
  // returning card bodies. A 30,000-card library must not trigger whole-table
  // downloads of cards, notes, reviews, sources or session histories.
  return checked(await db.rpc('review_items',{
   p_decks:filter.decks,p_session_id:filter.sessionId,
   p_concept_slug:filter.conceptSlug,p_include_new:filter.includeNew,
   p_new_only:filter.newOnly,
  })) as ReviewItem[]
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
  const [query,slug]=args,db=liveClient()
  await owner(db)
  // ST-5: the database searches and returns only one bounded page. Never fetch
  // every note/card/comment into the browser for a simple search.
  const pageArgs={p_query:query,p_slug:slug??null,p_limit:50}
  const first=checked(await db.rpc('search_cards_page',{...pageArgs,p_offset:0})) as import('../types').CardRow[]
  // Preserve the existing 100-result search contract until a separate
  // additive pagination contract lets the UI request later pages.
  if(first.length<50)return first
  const second=checked(await db.rpc('search_cards_page',{...pageArgs,p_offset:50})) as import('../types').CardRow[]
  return [...first,...second]
 }
 async searchCardsPage(...args: Parameters<LemmaApi['searchCardsPage']>): ReturnType<LemmaApi['searchCardsPage']> {
  const [filter]=args,db=liveClient()
  await owner(db)
  const offset=filter.offset??0
  if(!Number.isSafeInteger(offset)||offset<0)
   throw new LemmaError('invalid','Card page offset must be a nonnegative integer')
  const page=checked(await db.rpc('search_cards_filtered_page',{
   p_query:filter.query,p_slug:filter.projectSlug??null,
   p_checkpoint:filter.checkpointCode??null,p_state:filter.state??null,
   p_note_status:filter.noteStatus??null,
   p_has_open_comments:filter.hasOpenComments??null,p_offset:offset,
  })) as import('../types').CardRow[]
  return {rows:page,nextOffset:page.length===50?offset+50:null}
 }
 async getCard(...args: Parameters<LemmaApi['getCard']>): ReturnType<LemmaApi['getCard']> {
  const [no]=args,db=liveClient(),uid=await owner(db)
  const note=checked(await db.from('notes').select('*').eq('user_id',uid).eq('no',no).single()) as Row
  // Fetch metadata only for this note. Do not scan eight entire owner tables.
  // Keep full per-note history until FIX-546b adds cursor-backed More controls.
  const [projectResult,cpResult,sessionResult,sourceResult,cardResult]=await Promise.all([
    db.from('projects').select('id,slug').eq('user_id',uid).eq('id',note.project_id).neq('status','archived').limit(1),
    note.checkpoint_id
      ? db.from('checkpoints').select('id,code').eq('user_id',uid).eq('id',note.checkpoint_id).limit(1)
      : Promise.resolve({data:[],error:null}),
    note.session_id
      ? db.from('sessions').select('id,number').eq('user_id',uid).eq('id',note.session_id).limit(1)
      : Promise.resolve({data:[],error:null}),
    note.source_id
      ? db.from('sources').select('id,short').eq('user_id',uid).eq('id',note.source_id).limit(1)
      : Promise.resolve({data:[],error:null}),
    db.from('cards').select('*').eq('user_id',uid).eq('note_id',note.id),
  ])
  const project=(checked(projectResult) as Row[])[0]
  const cps=checked(cpResult) as Row[],sessions=checked(sessionResult) as Row[]
  const sources=checked(sourceResult) as Row[]
  const cardRows=checked(cardResult) as Row[]
  // Initial Card detail is bounded; older rows are fetched explicitly by the UI.
  const [historyPage,commentsPage]=await Promise.all([
   this.getCardHistoryPage(no),this.getCardCommentsPage(no)
  ])
  return {note:{noteId:note.id,noteNo:Number(note.no),front:note.front,back:note.back,type:note.type,
    kind:note.kind,tags:note.tags??[],status:note.status,origin:note.origin,
    projectSlug:project?.slug??'',checkpointCode:cps[0]?.code??null,
    sessionNumber:sessions[0]?.number??null,
    sourceShort:sources[0]?.short??null,pageLabel:note.page_label},
    cards:cardRows.map(c=>({ord:c.ord,state:cardState(c)})).sort((a,b)=>a.ord-b.ord),
    history:historyPage.rows,
    comments:commentsPage.rows,
    historyNextCursor:historyPage.nextCursor,
    commentsNextCursor:commentsPage.nextCursor}
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
      topic:c.topic??null,level:c.level??'planet',parentId:c.parent_id??null,isStar:!!c.is_star,
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
  if((x===null)!==(y===null)||(x!==null&&!Number.isFinite(x))||(y!==null&&!Number.isFinite(y)))
    throw new LemmaError('invalid','Invalid Atlas coordinates')
  checked(await db.from('concepts').update({pin_x:x,pin_y:y}).eq('id',id).eq('user_id',uid).select('id').single())
 }
 async getReviewLog(...args: Parameters<LemmaApi['getReviewLog']>): ReturnType<LemmaApi['getReviewLog']> {
  const db=liveClient(),uid=await owner(db)
  return (await rows(db,'reviews',uid)).filter(r=>!r.undone_at)
    .map(r=>({cardId:r.card_id,reviewedAt:r.reviewed_at,rating:r.rating}))
 }
 async getInsightData(...args: Parameters<LemmaApi['getInsightData']>): ReturnType<LemmaApi['getInsightData']> {
  const [days]=args,db=liveClient()
  await owner(db)
  // ST-5: aggregate in PostgreSQL. Never transfer every review, session,
  // card and checkpoint event just to draw bounded Insights charts.
  const aggregate=checked(await db.rpc('insights',{p_days:days})) as import('../types').InsightAggregate
  return {aggregate,reviews:[],sessions:[],checkpointEvents:[],projects:[],misconceptions:[]}
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
