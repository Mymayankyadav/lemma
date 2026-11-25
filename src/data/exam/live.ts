import {LemmaError} from '../api'
import {authGeneration} from '../authBoundary'
import {createCommandRunner, requireOnline} from './commands'
import type {CardIdea, CommandReceipt, ConceptEvidence, ExamApi, ExamAttempt, ExamSetup, SittingChange, SittingRecord} from './contract'

const sittingFields = 'id,project_id,title,starts_at,time_zone,duration_minutes,study_minutes,study_minutes_set_at,activation_study_minutes,last_study_at,objective,pass_marks,total_marks,format,sources,blueprint,blueprint_version,ledger,status,phase,card_mode,bookmark,plan_note,next_question,happened,updated_at,finished_at,version'
const attemptFields = 'row_key,occurred_at,outcome,independence,hint_level,novelty,marks_awarded,marks_possible,confidence,timed,seconds'

function checked<T>(result:{data:T;error:{message:string}|null}):T {
 if(result.error)throw new LemmaError('server',result.error.message)
 return result.data
}
async function ownerClient(){
 const db=(await import('../live/client')).liveClient()
 const generation=authGeneration()
 const {data:{session},error}=await db.auth.getSession()
 if(error||generation!==authGeneration())throw new LemmaError('auth','The signed-in account changed or is unavailable.')
 if(!session)throw new LemmaError('auth','Sign in to access exam prep.')
 return {db,owner:session.user.id}
}
function successful(receipt:CommandReceipt){
 if(receipt.status==='conflict')throw new LemmaError('conflict',receipt.conflict?.reason??'Exam prep changed. Refresh and try again.')
 return receipt
}
type Page<T> = (from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>
async function allRows<T>(read:Page<T>):Promise<T[]>{
 const rows:T[]=[]
 const size=500
 for(let offset=0;offset<20000;offset+=size){
  const page=checked(await read(offset,offset+size-1))??[]
  rows.push(...page)
  if(page.length<size)return rows
 }
 throw new LemmaError('server','Too many records to load the exam ledger.')
}
interface SetupProgress {sittingId:string; operationId:string; deadlineOperationId:string; input:ExamSetup; committed:boolean}
interface CalendarProgress {sittingId:string; date:string}
function stored<T>(key:string):T|undefined{
 try{return JSON.parse(sessionStorage.getItem(key)??'null') as T??undefined}
 catch{return undefined}
}
function openWork<T>(name:string){
 const pending=new Map<string,T>()
 const keyFor=(owner:string,project:string)=>'lemma.exam-'+name+':'+owner+':'+project
 return {
  read:(owner:string,project:string)=>{
   const key=keyFor(owner,project)
   return pending.get(key)??stored<T>(key)
  },
  set:(owner:string,project:string,value?:T)=>{
   const key=keyFor(owner,project)
   if(value)pending.set(key,value)
   else pending.delete(key)
   try{
    if(value)sessionStorage.setItem(key,JSON.stringify(value))
    else sessionStorage.removeItem(key)
   }catch{/* Retry in memory when session storage is unavailable. */}
  },
 }
}
export function createLiveExamApi():ExamApi {
 const run=createCommandRunner(async (name,body)=>{
  const {db}=await ownerClient()
  return db.rpc(name,{p:body})
 })
 const pendingSetup=openWork<SetupProgress>('setup')
 const pendingCalendar=openWork<CalendarProgress>('calendar')
 async function readSitting(id:string){
  const {db,owner}=await ownerClient()
  return checked(await db.from('exam_sittings').select(sittingFields).eq('user_id',owner)
   .eq('id',id).maybeSingle()) as SittingRecord|null
 }
 async function syncDeadline(sitting:SittingRecord, create:boolean, operationId?:string){
  if(!sitting.starts_at)return
  const {db,owner}=await ownerClient()
  const existing=checked(await db.from('deadlines').select('id,due_at,version').eq('user_id',owner)
   .eq('id',sitting.id).eq('kind','exam').eq('project_id',sitting.project_id).maybeSingle())
  if(existing?.due_at&&Date.parse(existing.due_at)===Date.parse(sitting.starts_at))return
  if(!existing&&!create)return
  successful(await run({
   resource:'deadlines',operation:existing?'update':'create',target:{id:sitting.id},
   ...(existing?{expectedVersion:existing.version}:{}),
   patch:existing?{due_kind:'instant',due_at:sitting.starts_at}:{
    kind:'exam',title:sitting.title,project_id:sitting.project_id,due_kind:'instant',due_at:sitting.starts_at,
   },
  },operationId))
 }
 async function changeAtVersion(sitting:SittingRecord,change:SittingChange){
  return run({resource:'exam_sittings',...change,target:{id:sitting.id},expectedVersion:sitting.version})
 }
 return {
  mode:'live',
  async read(projectId){
   const {db,owner}=await ownerClient()
   const visible=checked(await db.from('exam_sittings').select(sittingFields).eq('user_id',owner)
    .eq('project_id',projectId).neq('status','cancelled').order('finished_at',{ascending:false,nullsFirst:true})
    .order('status').order('starts_at').order('id').limit(50)) as SittingRecord[]
   const calendar=pendingCalendar.read(owner,projectId)
   const pendingDate=visible.find(sitting=>sitting.id===calendar?.sittingId&&sitting.starts_at&&
    Date.parse(sitting.starts_at)===Date.parse(calendar.date))
   return {sittings:visible,pendingSetup:!!pendingSetup.read(owner,projectId),pendingCalendar:pendingDate?.id}
  },
  async readEvidence(sitting,asOf=new Date().toISOString()){
   const {db,owner}=await ownerClient()
   const [attempts,evidence]=await Promise.all([
    db.from('exam_attempts').select(attemptFields).eq('user_id',owner)
     .eq('sitting_id',sitting.id).is('voided_at',null).lte('occurred_at',asOf)
     .order('occurred_at',{ascending:false}).order('id',{ascending:false}).limit(500),
    sitting.blueprint.some(row=>row.concepts?.length)?db.rpc('exam_row_evidence',{p_owner:owner,p_sitting:sitting.id,p_as_of:asOf}):{data:[],error:null},
   ])
   return {attempts:(checked(attempts)??[]) as ExamAttempt[],evidence:(checked(evidence)??[]) as ConceptEvidence[]}
  },
  async readIdeas(projectId){
   const {db,owner}=await ownerClient()
   return allRows<CardIdea>((from,to)=>db.from('card_ideas')
    .select('id,project_id,sitting_id,target,reason,status,sightings,version')
    .eq('user_id',owner).eq('project_id',projectId).order('id').range(from,to))
  },
  async setup(input){
   requireOnline()
   const {owner}=await ownerClient()
   const projectId=input.project_id
   const generation=authGeneration()
   let setup=pendingSetup.read(owner,projectId)
   if(setup&&JSON.stringify(setup.input)!==JSON.stringify(input))
    throw new LemmaError('conflict','Retry the original exam setup before changing its details.')
   if(!setup){
    setup={sittingId:crypto.randomUUID(),operationId:crypto.randomUUID(),deadlineOperationId:crypto.randomUUID(),input:structuredClone(input),committed:false}
    pendingSetup.set(owner,projectId,setup)
   }
   if(!setup.committed){
    try{
     successful(await run({resource:'exam_sittings',operation:'create',target:{id:setup.sittingId},patch:setup.input},setup.operationId))
     setup.committed=true
     pendingSetup.set(owner,projectId,setup)
    }catch(error){
     if(error instanceof LemmaError&&error.code!=='server'&&error.code!=='auth'){
      pendingSetup.set(owner,projectId)
     }
     throw error
    }
   }
   if(generation!==authGeneration())throw new LemmaError('auth','The signed-in account changed.')
   const sitting=await readSitting(setup.sittingId)
   if(!sitting)throw new LemmaError('server','Exam was saved. Retry to link its calendar deadline.')
   try{await syncDeadline({...sitting,title:setup.input.title,starts_at:setup.input.starts_at},true,setup.deadlineOperationId)}
   catch{throw new LemmaError('server','Exam was saved. Retry to link its calendar deadline.')}
   pendingSetup.set(owner,projectId)
   return setup.sittingId
  },
  async resumeSetup(projectId){
   const {owner}=await ownerClient()
   const setup=pendingSetup.read(owner,projectId)
   if(!setup||setup.input.project_id!==projectId)throw new LemmaError('not_found','There is no saved setup to retry.')
   return this.setup(setup.input)
  },
  async resumeCalendar(projectId,sittingId){
   requireOnline()
   const {owner}=await ownerClient()
   const generation=authGeneration()
   const fresh=await readSitting(sittingId)
   if(generation!==authGeneration()||!fresh||fresh.project_id!==projectId)
    throw new LemmaError('not_found','This sitting is no longer available.')
   await syncDeadline(fresh,false)
   pendingCalendar.set(owner,projectId)
  },
  async change(sitting,change){
   requireOnline()
   const {owner}=await ownerClient()
   const date=(change.operation==='update'||change.operation==='reopen')&&change.patch.starts_at
   if(date)pendingCalendar.set(owner,sitting.project_id,{sittingId:sitting.id,date})
   const generation=authGeneration()
   let receipt=await changeAtVersion(sitting,change)
   if(receipt.status==='conflict'){
    const fresh=await readSitting(sitting.id)
    if(!fresh||generation!==authGeneration())throw new LemmaError('conflict','This sitting is no longer available.')
    // A full-blueprint patch must not overwrite concurrent edits. Replay the
    // requested row delta on the fresh blueprint if the touched rows survived.
    if(change.operation==='update'&&change.patch.blueprint){
     const previous=new Map(sitting.blueprint.map(row=>[row.key,JSON.stringify(row)]))
     const proposed=new Map(change.patch.blueprint.map(row=>[row.key,row]))
     const current=new Map(fresh.blueprint.map(row=>[row.key,row]))
     for(const [key,row] of proposed){
      if(previous.get(key)===JSON.stringify(row))continue
      if(previous.get(key)!==(current.has(key)?JSON.stringify(current.get(key)):undefined))
       throw new LemmaError('conflict','This blueprint row changed. Open it again to edit the latest version.')
      current.set(key,row)
     }
     change={...change,patch:{...change.patch,blueprint:[...current.values()]}}
    }
    receipt=await changeAtVersion(fresh,change)
   }
   successful(receipt)
   if(date&&generation===authGeneration()){
    try{await this.resumeCalendar(sitting.project_id,sitting.id)}
    catch{throw new LemmaError('server','Exam date saved. Retry to update its calendar deadline.')}
   }
  },
  command:run,
 }
}
