import {LemmaError} from '../api'
import {getDemoProfile,getMode} from '../mode'
import {getApi} from '../index'
import type {DemoAdapter} from '../demo/adapter'
import {getDeadlineApi} from '../deadlines'
import {requireOnline} from './commands'
import {examIdeaKey} from './contract'
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
  starts_at:iso(project.days),...(project.status==='active'?{activated_at:iso(-2),bookmark:{checkpoint:'CP9',step:2,capturedAt:iso(-2)}}:{}),
  finished_at:project.status==='finished'?iso(-2):null,time_zone:'UTC',study_minutes:project.status==='active'?1:120,total_marks:60,
  version:1,blueprint_version:1,blueprint:project.id==='project-linear'?linearRows:[],ledger:{},
 }))
 const attempts:Array<ExamAttempt&{sitting_id:string;id:string;delivery_ref?:string}>=[{
  sitting_id:'demo-exam-project-linear',id:'demo-exam-attempt',
  row_key:'change-of-basis',outcome:'correct',
  marks_awarded:12,marks_possible:12,independence:'independent',hint_level:0,novelty:'novel',
  timed:true,seconds:70,occurred_at:iso(-1),voided_at:null,
 }]
 const ideas:CardIdea[]=[]
 const deadlines=new Map<string,{id:string;version:number}>()
 const undo=new Map<number,()=>void>()
 let actionId=0
 const key='lemma.demo-exam:'+getDemoProfile()
 try {
  const saved=JSON.parse(sessionStorage.getItem(key)??'null')
  if(saved?.sittings&&saved?.attempts&&saved?.ideas){
   sittings.splice(0,sittings.length,...saved.sittings)
   attempts.splice(0,attempts.length,...saved.attempts)
   ideas.push(...saved.ideas)
   for(const [id,deadline] of saved.deadlines??[])deadlines.set(id,deadline)
  }
 }catch{/* The tab can still run the demo in memory. */}
 function persist(){
  try{sessionStorage.setItem(key,JSON.stringify({sittings,attempts,ideas,deadlines:[...deadlines]}))}catch{/* Keep the in-memory demo. */}
 }
 const bookmark=(projectId:string,capturedAt:string)=>getMode()==='demo'?(getApi() as DemoAdapter).examStudyBookmark(projectId,capturedAt):{capturedAt}
 const pending=new Map<string,{input:ExamSetup;id:string}>()
 async function apply(sitting:SittingRecord,change:SittingChange){
  const closed=sitting.status==='finished'||sitting.status==='cancelled'
  switch(change.operation){
   case 'activate':
    if(sitting.status!=='planned'&&sitting.status!=='paused')throw new LemmaError('conflict','Only a planned or paused sitting can start.')
    if(sittings.some(row=>row.status==='active'&&row.project_id===sitting.project_id))
     throw new LemmaError('conflict','This path already has active exam prep.')
    sitting.status='active'
    sitting.activated_at=new Date().toISOString()
    sitting.bookmark=bookmark(sitting.project_id,sitting.activated_at)
    break
   case 'pause':
    if(sitting.status!=='active')throw new LemmaError('conflict','Exam prep is already paused.')
    sitting.status='paused'
    sitting.paused_at=new Date().toISOString()
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
  persist()
 }
 return {
  mode:'demo',
  async read(projectId){return {pendingSetup:pending.has(projectId),sittings: structuredClone(sittings.filter(row=>row.project_id===projectId&&row.status!=='cancelled'))}},
  async readEvidence(sitting){return {attempts:structuredClone(attempts.filter(attempt=>attempt.sitting_id===sitting.id)),evidence:[]}},
  async readIdeas(projectId){
   const demo=getApi() as DemoAdapter
   return structuredClone(ideas.filter(idea=>idea.project_id===projectId).map(idea=>{
    const result=idea.proposal_id?demo.examIdeaProposalState(idea.proposal_id):undefined
    return result?{...idea,proposal_status:result.status,...(result.noteNo?{status:'linked' as const,note_no:result.noteNo}:{})}:idea
   }))
  },
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
    sittings.unshift({...input,id:work.id,status:input.activate?'active':'planned',phase:'map',ledger:{},blueprint_version:1,version:1,
     ...(input.activate?{activated_at:new Date().toISOString(),
      bookmark:bookmark(input.project_id,new Date().toISOString())}:{}),
    })
   }
   persist()
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
  async undo(actionNo){
   requireOnline()
   const apply=undo.get(actionNo)
   if(!apply)throw new LemmaError('not_found','This action is unavailable.')
   apply()
   undo.delete(actionNo)
  },
  async command(command){
   requireOnline()
   const operationId=crypto.randomUUID()
   if(command.resource==='exam_sittings'&&command.operation==='create'){
    const id=await this.setup(command.patch as ExamSetup)
    return {status:'ok',id,operationId}
   }
   if(command.resource==='card_ideas'){
    const patch=command.patch as Partial<CardIdea>&{card?:string}
    const op=command.operation
    const target=(patch?.target??'').trim()
    const old=op==='save'?ideas.find(idea=>idea.project_id===patch.project_id&&examIdeaKey(idea.target)===examIdeaKey(target)&&
     (idea.status==='saved'||idea.status==='drafted'))
     :ideas.find(idea=>idea.id===command.target?.id)
    if(op!=='save'&&(!old||old.version!==command.expectedVersion))return {status:'conflict',operationId}
    if(op==='save'&&(!patch.project_id||target.length<3))throw new LemmaError('invalid','Enter a retrieval target.')
    const idea=old??{id:crypto.randomUUID(),project_id:patch.project_id!,sitting_id:patch.sitting_id??null,target,
     reason:patch.reason??null,status:'saved' as const,sightings:0,version:0,created_at:new Date().toISOString()}
    const before=old?structuredClone(old):null
    if(op==='save'){
     idea.sightings++
     idea.evidence=[...new Map([...(idea.evidence??[]),...(patch.evidence??[])].map(item=>[JSON.stringify(item),item])).values()].slice(0,20)
     idea.concept??=patch.concept
    }else if(op==='dismiss')idea.status='dismissed'
    else if(op==='restore')idea.status='saved'
    else if(op==='update')Object.assign(idea,patch)
    else if(op==='link'){idea.status='linked';idea.note_no=Number(patch.card?.slice(1))}
    else if(op==='draft'){
     if(idea.status==='drafted')return {status:'ok',operationId,id:idea.id,version:idea.version}
     const demo=getApi() as DemoAdapter
     idea.proposal_id=await demo.makeExamIdeaProposal(idea.project_id,patch.front??idea.target,patch.back??'',idea.reason)
     idea.proposal_status='pending'
     idea.status='drafted'
    }else throw new LemmaError('invalid','Unknown card idea action.')
    idea.version++
    if(!old)ideas.push(idea)
    const actionNo=++actionId
    const version=idea.version
    undo.set(actionNo,()=>{
     if(idea.version!==version)throw new LemmaError('conflict','This idea has changed.')
     if(before)Object.assign(idea,before)
     else ideas.splice(ideas.indexOf(idea),1)
     persist()
    })
    persist()
    return {status:'ok',operationId,id:idea.id,version:idea.version,actionNo}
   }
   if(command.resource==='exam_attempts'&&command.operation==='record'){
    const id=crypto.randomUUID(),patch=command.patch as ExamAttempt&{sitting_id:string;delivery_ref?:string}
    const sitting=sittings.find(row=>row.id===patch.sitting_id)
    if(!sitting||!sitting.blueprint.some(row=>row.key===patch.row_key)||sitting.status==='finished'||sitting.status==='cancelled')
     throw new LemmaError('invalid','Choose a live exam sitting and a current blueprint row.')
    const old=patch.delivery_ref&&attempts.find(attempt=>attempt.sitting_id===sitting.id&&attempt.delivery_ref===patch.delivery_ref)
    if(old)return {status:'duplicate',operationId,id:old.id,version:1}
    attempts.push({...patch,id,occurred_at:patch.occurred_at??new Date().toISOString()})
    persist()
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
