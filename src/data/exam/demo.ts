import {LemmaError} from '../api'
import {getDemoProfile} from '../mode'
import {getDeadlineApi} from '../deadlines'
import {requireOnline} from './commands'
import type {BlueprintRow, CardIdea, ExamApi, ExamAttempt, ExamSetup, SittingChange, SittingRecord} from './contract'

const projects = [
 {id:'project-linear',title:'Linear Algebra midterm',status:'active',days:3},
 {id:'project-topology',title:'Topology qualifier',status:'planned',days:11},
 {id:'project-analysis',title:'Analysis practice paper',status:'finished',days:-2},
] as const

export function createDemoExamApi(now=Date.now()):ExamApi {
 const iso=(days:number)=>new Date(now+days*86400000).toISOString()
 const linearRows:BlueprintRow[]=[
  {key:'diagonalizability',title:'Decide diagonalizability from eigenspace dimensions',marks:20,compulsory:true,minutes:15,section:'Part B',concepts:['eigenvalues'],checkpoints:['CP4']},
  {key:'projections',title:'Compute the orthogonal projection onto a subspace',marks:15,chance:0.8,minutes:8},
  {key:'change-of-basis',title:'Write the matrix of a linear transformation in a new basis',marks:12,minutes:8},
 ]
 const sittings:SittingRecord[]=getDemoProfile()==='first-use'?[]:projects.map(project=>({
  id:'demo-exam-'+project.id,project_id:project.id,title:project.title,status:project.status,phase:'screen',card_mode:'later',
  starts_at:iso(project.days),finished_at:project.status==='finished'?iso(-2):null,time_zone:'UTC',study_minutes:project.status==='active'?1:120,total_marks:60,
  version:1,blueprint_version:1,blueprint:project.id==='project-linear'?linearRows:[],ledger:{},
 }))
 const attempts:Array<ExamAttempt&{sitting_id:string;id:string;delivery_ref?:string;seconds?:number}>=[{
  sitting_id:'demo-exam-project-linear',id:'demo-exam-attempt',
  row_key:'change-of-basis',outcome:'correct',
  marks_awarded:12,marks_possible:12,independence:'independent',hint_level:0,novelty:'novel',
  timed:true,seconds:70,occurred_at:iso(-1),voided_at:null,
 }]
 const ideas:CardIdea[]=[]
 const deadlines=new Map<string,{id:string;version:number}>()
 const pending=new Map<string,{input:ExamSetup;id:string}>()
 async function apply(sitting:SittingRecord,change:SittingChange){
  const closed=sitting.status==='finished'||sitting.status==='cancelled'
  switch(change.operation){
   case 'activate':
    if(sitting.status!=='planned'&&sitting.status!=='paused')throw new LemmaError('conflict','Only a planned or paused sitting can start.')
    if(sittings.some(row=>row.status==='active'&&row.project_id===sitting.project_id))
     throw new LemmaError('conflict','This path already has active exam prep.')
    sitting.status='active'
    break
   case 'pause':
    if(sitting.status!=='active')throw new LemmaError('conflict','Exam prep is already paused.')
    sitting.status='paused'
    break
   case 'cancel':
   case 'finish':
    if(closed)throw new LemmaError('conflict','This sitting is closed.')
    sitting.status=change.operation==='finish'?'finished':'cancelled'
    if(change.operation==='finish')sitting.finished_at=new Date().toISOString()
    break
   case 'update':
   case 'reopen': {
    if(closed!==(change.operation==='reopen'))throw new LemmaError('conflict','This sitting changed.')
    if(change.patch.blueprint){
     sitting.blueprint=structuredClone(change.patch.blueprint)
     sitting.blueprint_version++
    }
    if(change.patch.starts_at){
     const linked=deadlines.get(sitting.id)
     if(linked){
      const due={kind:'instant' as const,at:change.patch.starts_at}
      deadlines.set(sitting.id,(await getDeadlineApi().updateDeadline(linked.id,linked.version,{due})).record)
     }
     sitting.starts_at=change.patch.starts_at
    }
    if(change.patch.study_minutes!==undefined)sitting.study_minutes=change.patch.study_minutes
    if(change.patch.time_zone)sitting.time_zone=change.patch.time_zone
    if(change.operation==='reopen')sitting.status='paused'
    break
   }
   case 'set_disposition':
    if(closed)throw new LemmaError('conflict','This sitting is closed.')
    for(const entry of change.patch.rows){
     const {key,disposition,reason,reopen}=entry
     if(!sitting.blueprint.some(row=>row.key===key)||
      ((disposition==='skip'||disposition==='defer')&&!reason?.trim())||
      (disposition==='defer'&&!reopen?.trim()))throw new LemmaError('invalid','A valid row, reason and reopen condition are required.')
     if(disposition==='none')delete sitting.ledger[key]
     else sitting.ledger[key]={disposition,reason,reopen,at:new Date().toISOString()}
    }
    break
  }
  sitting.version++
 }
 return {
  mode:'demo',
  async read(projectId){return {pendingSetup:pending.has(projectId),sittings: structuredClone(sittings.filter(row=>row.project_id===projectId&&row.status!=='cancelled'))}},
  async readEvidence(sitting){return {attempts:structuredClone(attempts.filter(attempt=>attempt.sitting_id===sitting.id)),evidence:[]}},
  async readIdeas(projectId){return structuredClone(ideas.filter(idea=>idea.project_id===projectId))},
  async setup(input){
   requireOnline()
   let work=pending.get(input.project_id)
   if(work&&JSON.stringify(work.input)!==JSON.stringify(input))throw new LemmaError('conflict','Retry the original exam setup before editing it.')
   if(!work){
    if(input.activate&&sittings.some(row=>row.project_id===input.project_id&&row.status==='active'))
     throw new LemmaError('conflict','This path already has active exam prep.')
    work={id:crypto.randomUUID(),input:structuredClone(input)}
    pending.set(input.project_id,work)
   }
   if(!deadlines.has(work.id)){
    const receipt=await getDeadlineApi().createDeadline({title:input.title,kind:'exam',due:{kind:'instant',at:input.starts_at},projectId:input.project_id})
    deadlines.set(work.id,receipt.record)
    sittings.unshift({...input,id:work.id,status:input.activate?'active':'planned',phase:'map',ledger:{},blueprint_version:1,version:1})
   }
   pending.delete(input.project_id)
   return work.id
  },
  async resumeSetup(projectId){
   const setup=pending.get(projectId)
   if(!setup)throw new LemmaError('not_found','There is no saved setup to retry.')
   return this.setup(setup.input)
  },
  async resumeCalendar(){requireOnline()},
  async change(sitting,change){
   requireOnline()
   const current=sittings.find(row=>row.id===sitting.id)
   if(!current)throw new LemmaError('not_found','This sitting is no longer available.')
   if(change.operation==='update'&&change.patch.blueprint&&current.version!==sitting.version)
    throw new LemmaError('conflict','The blueprint changed. Open it again to edit the latest version.')
   await apply(current,change)
  },
  async command(command){
   requireOnline()
   const operationId=crypto.randomUUID()
   if(command.resource==='exam_sittings'&&command.operation==='create'){
    const id=await this.setup(command.patch as ExamSetup)
    return {status:'ok',id,operationId}
   }
   if(command.resource==='card_ideas'&&command.operation==='save'){
    const patch=command.patch as Pick<CardIdea,'project_id'|'sitting_id'|'reason'|'target'>
    const old=ideas.find(idea=>idea.project_id===patch.project_id&&idea.target.toLowerCase()===patch.target.toLowerCase()&&idea.status==='saved')
    const idea=old??{...patch,id:crypto.randomUUID(),status:'saved' as const,sightings:0,version:0}
    idea.sightings++
    idea.version++
    if(!old)ideas.push(idea)
    return {status:'ok',operationId,id:idea.id,version:idea.version}
   }
   if(command.resource==='exam_attempts'&&command.operation==='record'){
    const id=crypto.randomUUID(),patch=command.patch as ExamAttempt&{sitting_id:string;delivery_ref?:string}
    const sitting=sittings.find(row=>row.id===patch.sitting_id)
    if(!sitting||!sitting.blueprint.some(row=>row.key===patch.row_key)||sitting.status==='finished'||sitting.status==='cancelled')
     throw new LemmaError('invalid','Choose a live exam sitting and a current blueprint row.')
    const old=patch.delivery_ref&&attempts.find(attempt=>attempt.sitting_id===sitting.id&&attempt.delivery_ref===patch.delivery_ref)
    if(old)return {status:'duplicate',operationId,id:old.id,version:1}
    attempts.push({...patch,id,occurred_at:patch.occurred_at??new Date().toISOString()})
    return {status:'ok',operationId,id,version:1}
   }
   const sitting=sittings.find(row=>row.id===command.target?.id)
   if(command.resource!=='exam_sittings'||!sitting)throw new LemmaError('invalid','Unsupported demo exam command.')
   if(command.expectedVersion!==sitting.version)return {status:'conflict',operationId,conflict:{currentVersion:sitting.version}}
   await apply(sitting,command as SittingChange)
   return {status:'ok',operationId,id:sitting.id,version:sitting.version}
  },
 }
}
