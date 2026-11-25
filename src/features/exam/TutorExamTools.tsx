import {useId,useState,type FormEvent} from 'react'
import {Link,useNavigate} from 'react-router'
import {BookmarkPlus} from 'lucide-react'
import type {CardIdea,SittingChange,SittingRecord} from '../../data/exam/contract'
import {getExamApi,useRefreshExam} from '../../data/exam/queries'
import type {ProjectDetail} from '../../data/types'
import {Button,Field,IconButton,Sheet} from '../../ui/v7/components'
import {useToast} from '../../ui/Toast'
import {formatDuration} from '../../lib/format'
import {instantInZone} from '../calendar/block-sheet/BlockSheet'
import {tutorHref} from '../tutor/tutorHref'
import {usePathExam} from './usePathExam'
import {LedgerTab} from './LedgerTab'
import {remainingTime} from './model'
import {deferExamQuestion} from './PassedExamBanner'
import {useOnline} from '../../ui/v7/savedCopy'
import './exam.css'

export function TutorExamHeader({sitting,open,onOpen}:{
 sitting:SittingRecord;open:boolean;onOpen:()=>void;
}){
 const time=remainingTime(sitting.starts_at)
 return <Button className="v7-exam-tutor-chip" aria-haspopup="dialog" aria-expanded={open} data-phase={sitting.phase} onClick={onOpen}>
  {sitting.status==='finished'?'Exam finished':'Exam prep'} · {sitting.title}{time?' · '+time:''}{sitting.study_minutes!=null?' · '+formatDuration(sitting.study_minutes)+' left':''}
 </Button>
}

export type TutorExamPanel='ledger'|'finish'|'postpone'|'budget'
export function TutorExamControl({project,sitting,activePanel,onClose}:{
 project:ProjectDetail;sitting:SittingRecord;activePanel:TutorExamPanel;onClose:()=>void
}){
 const slug=project.project.slug,exam=usePathExam(project.project.id,slug,sitting.id,true),navigate=useNavigate(),online=useOnline()
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[panel,setPanel]=useState(activePanel)
 const formId=useId()
 const path='/p/'+encodeURIComponent(slug)
 async function work(change:SittingChange,destination?:string){
  if(!online||busy)return
  try{setBusy(true);setError('');await exam.change(change);onClose();if(destination)navigate(destination)}
  catch(reason){setError(reason instanceof Error?reason.message:'Could not update exam prep.')}
  finally{setBusy(false)}
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const fields=new FormData(event.currentTarget)
  if(panel==='budget'){void work({operation:'update',patch:{study_minutes:Number(fields.get('minutes'))}});return}
  const start=instantInZone(String(fields.get('start')),sitting.time_zone)
  if(!start||Date.parse(start)<=Date.now()){setError('Choose a future exam time.');return}
  void work({operation:'update',patch:{starts_at:start,time_zone:sitting.time_zone}})
 }
 return <Sheet open title={panel==='ledger'?'Exam coverage':panel==='finish'?'Finish exam':panel==='budget'?'Study time left':'New exam date'} onClose={()=>{if(!busy)onClose()}}
   footer={panel==='budget'||panel==='postpone'?<Button variant="primary" type="submit" form={formId} disabled={busy||!online}>Save</Button>:undefined}>
  {panel==='ledger'&&<>
   {exam.sitting&&exam.plan&&<LedgerTab sitting={exam.sitting} plan={exam.plan} project={project} now={exam.now} disabled onChange={async()=>{}}/>}
   <Link className="v7-button v7-secondary" to={path+'?tab=exam&examSitting='+encodeURIComponent(sitting.id)}>Open in Path</Link>
  </>}
  {panel==='finish'&&<>
   <p>Did {sitting.title} take place?</p>
   <div className="v7-exam-actions">
    <Button onClick={()=>{void work({operation:'finish',patch:{happened:true}},path+'?examSitting='+encodeURIComponent(sitting.id))}} disabled={busy||!online}>Yes</Button>
    <Button onClick={()=>setPanel('postpone')} disabled={busy||!online}>Postponed</Button>
    <Button onClick={()=>{if(exam.owner)deferExamQuestion(exam.owner,sitting);onClose()}} disabled={busy}>Not yet</Button>
   </div>
  </>}
  {(panel==='budget'||panel==='postpone')&&<form id={formId} className="v7-exam-form" onSubmit={submit}>
   {panel==='budget'?<Field label="Minutes available" name="minutes" type="number" min={0} max={20000} defaultValue={sitting.study_minutes??0} required/>
    :<Field label="New date and time" name="start" type="datetime-local" hint={sitting.time_zone} required/>}
  </form>}
  {error&&<p role="alert">{error}</p>}
 </Sheet>
}

export function BackToStudy({project,sitting,callback}:{project:ProjectDetail;sitting:SittingRecord;callback?:()=>void}){
 const notify=useToast(),refresh=useRefreshExam(),navigate=useNavigate(),online=useOnline()
 const [busy,setBusy]=useState(false)
 const slug=project.project.slug
 async function go(){
  if(busy||!online)return
  try{
   setBusy(true)
   if(sitting.status==='active')await getExamApi().change(sitting,{operation:'pause'})
   await refresh()
   callback?.()
   navigate('/p/'+encodeURIComponent(slug)+'?examSitting='+encodeURIComponent(sitting.id))
  }catch(error){notify(error instanceof Error?error.message:'Could not pause exam prep.',{tone:'danger'})}
  finally{setBusy(false)}
 }
 return <Button disabled={busy||!online} onClick={()=>{void go()}}>Back to study</Button>
}

export function ExamChatNotice({sitting,slug}:{sitting:SittingRecord;slug:string}){
 const [dismissed,setDismissed]=useState(false)
 if(dismissed)return null
 return <div className="v7-exam-panel" aria-label="Active exam prep">
  <p>Exam prep is active for this subject.</p>
  <div className="v7-exam-actions"><Link to={tutorHref(slug)+'?exam='+encodeURIComponent(sitting.id)}>Open exam chat</Link>
   <Button onClick={()=>setDismissed(true)}>Dismiss</Button></div>
 </div>
}

export function TutorIdeaAction({sitting,slug,turnId,ideas,disabled,body}:{
 sitting:SittingRecord;slug:string;turnId:string;ideas:CardIdea[];disabled:boolean;body:string
}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const notify=useToast(),refresh=useRefreshExam()
 const formId=useId()
 const existing=ideas.filter(idea=>idea.status!=='dismissed'&&idea.evidence?.some(item=>item.turn===turnId))
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(disabled||busy)return
  const fields=new FormData(event.currentTarget)
  const target=String(fields.get('target')).trim(),reason=String(fields.get('reason')).trim(),concept=String(fields.get('concept')??'')
  if(target.length<3){setError('Enter a retrieval target of at least 3 characters.');return}
  try{
   setBusy(true);setError('')
   const api=getExamApi(),receipt=await api.command({resource:'card_ideas',operation:'save',patch:{
    project_id:sitting.project_id,sitting_id:sitting.id,target, ...(reason?{reason}:{}),...(concept?{concept}:{}),evidence:[{turn:turnId}],
   }})
   if(receipt.status==='conflict')throw new Error('An idea changed. Try saving again.')
   await refresh()
   setOpen(false)
   notify('Saved for after the exam.',{tone:'success',duration:6000,...(receipt.actionNo?{action:{label:'Undo',onClick:()=>{
    void api.undo(receipt.actionNo!).then(refresh).catch(()=>notify('Could not undo this idea.',{tone:'danger'}))
   }}}:{})})
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not save this idea.')}
  finally{setBusy(false)}
 }
 const concepts=[...new Set(sitting.blueprint.flatMap(row=>row.concepts??[]))]
 const diagnosis=/^(?:why|diagnosis):\s*([^\n]{1,300})/im.exec(body)?.[1]?.trim()
 const suggestion=/(?:card idea|save for later)\s*[:·]\s*([^\n]{3,300})/i.exec(body)?.[1]?.trim()
 return <>
  {sitting.card_mode!=='quiet'&&<IconButton label="Save for later" data-saved={existing.length?'true':undefined} disabled={disabled} onClick={()=>{setError('');setOpen(true)}}><BookmarkPlus aria-hidden="true"/></IconButton>}
  {existing.map(idea=><Link className="tutor-reply-chip" key={idea.id} to={'/p/'+encodeURIComponent(slug)+'?tab=cards&cards=ideas&idea='+encodeURIComponent(idea.id)}>Idea saved: {idea.target.slice(0,30)}</Link>)}
  {open&&<Sheet open title="Save for later" onClose={()=>{if(!busy)setOpen(false)}}
   footer={<Button variant="primary" type="submit" form={formId} disabled={busy||disabled}>Save idea</Button>}>
   <form id={formId} className="v7-exam-form" onSubmit={submit}>
    <Field name="target" label="What should be retrievable?" minLength={3} maxLength={300} defaultValue={suggestion} required/>
    <Field name="reason" label="Why?" maxLength={300} defaultValue={existing[0]?.reason??diagnosis??''} optional/>
    {!!concepts.length&&<label className="v7-field-group">Concept<select className="v7-field" name="concept"><option value="">Choose a concept</option>{concepts.map(concept=><option key={concept}>{concept}</option>)}</select></label>}
    {error&&<p role="alert">{error}</p>}
   </form>
  </Sheet>}
 </>
}
