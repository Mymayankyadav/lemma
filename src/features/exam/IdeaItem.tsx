import {useEffect,useId,useState,type FormEvent} from 'react'
import {Link,useSearchParams} from 'react-router'
import {getApi} from '../../data'
import {useQuery} from '@tanstack/react-query'
import type {CardIdea} from '../../data/exam/contract'
import {getExamApi,useRefreshExam} from '../../data/exam/queries'
import {Button,Field,Sheet} from '../../ui/v7/components'
import {useToast} from '../../ui/Toast'

type Edit = 'draft'|'link'|'update'

export function IdeaItem({idea,slug,canEdit}:{idea:CardIdea;slug:string;canEdit:boolean}){
 const [params,setParams]=useSearchParams(),notify=useToast(),refresh=useRefreshExam()
 const [edit,setEdit]=useState<Edit|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [later,setLater]=useState(false)
 const [search,setSearch]=useState(''),[card,setCard]=useState<number>()
 const formId=useId()
 const waiting=idea.status==='drafted'&&idea.proposal_status!=='rejected'&&idea.proposal_status!=='withdrawn'
 useEffect(()=>{
  if(waiting&&edit==='draft'){setEdit(null);setError('')}
 },[waiting,edit])
 const cards=useQuery({queryKey:['exam-link-search',slug,search],enabled:edit==='link'&&search.trim().length>=2,
  queryFn:()=>getApi().searchCards(search.trim(),slug)})
 async function apply(operation:string,patch?:object){
  if(!canEdit||busy)return
  try{
   setBusy(true);setError('')
   const api=getExamApi(),receipt=await api.command({resource:'card_ideas',operation,target:{id:idea.id},expectedVersion:idea.version,patch})
   if(receipt.status==='conflict')throw new Error('This idea changed. Review its latest version and retry.')
   await refresh()
   setEdit(null)
   const message=operation==='draft'?'Waiting in Inbox':operation==='dismiss'?'Idea dismissed':operation==='link'?'Card linked':'Idea updated'
   notify(message,{tone:'success',...(operation==='dismiss'&&receipt.actionNo?{action:{label:'Undo',onClick:()=>{
    void api.undo(receipt.actionNo!).then(refresh).catch(()=>notify('Could not undo this dismissal.',{tone:'danger'}))
   }}}:{})})
  }catch(reason){
   setError(reason instanceof Error?reason.message:'Could not update this idea.')
   await refresh()
  }finally{setBusy(false)}
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const fields=new FormData(event.currentTarget)
  if(edit==='draft')void apply('draft',{front:String(fields.get('front')).trim(),back:String(fields.get('back')).trim(),type:'basic',kind:'other'})
  if(edit==='update')void apply('update',{target:String(fields.get('target')).trim(),reason:String(fields.get('reason')).trim()})
  if(edit==='link'&&card)void apply('link',{card:'N'+card})
 }
 return <li className="v7-exam-panel" id={'idea-'+idea.id}>
  <h3 className="v7-subhead">{idea.target}</h3>
  {idea.sightings>1&&<p>Seen {idea.sightings} times</p>}
  {idea.reason&&<p>{idea.reason}</p>}
  {idea.evidence?.some(item=>item.turn||item.attempt)&&<p>{idea.evidence.length} saved evidence {idea.evidence.length===1?'reference':'references'}</p>}
  {idea.note_no?<Link to={'/cards/'+idea.note_no}>Added as N{idea.note_no}</Link>:waiting&&idea.proposal_id?<Link to={'/proposals?card='+encodeURIComponent(idea.proposal_id)}>Waiting in Inbox</Link>:null}
  {idea.status!=='linked'&&later&&<div className="v7-exam-actions"><Button onClick={()=>setLater(false)}>Manage idea</Button></div>}
  {idea.status!=='linked'&&!later&&<div className="v7-exam-actions">
   {!waiting&&<>
    <Button disabled={!canEdit||busy} onClick={()=>setEdit('draft')}>Draft</Button>
    <Button disabled={!canEdit||busy} onClick={()=>setEdit('link')}>Link to card</Button>
    <Button disabled={!canEdit||busy} onClick={()=>setEdit('update')}>Edit idea</Button>
   </>}
   {!waiting&&<Button disabled={!canEdit||busy} onClick={()=>{
    setLater(true)
    if(params.get('idea')===idea.id){const next=new URLSearchParams(params);next.delete('idea');setParams(next)}
   }}>Later</Button>}
   <Button disabled={!canEdit||busy} onClick={()=>{void apply('dismiss')}}>Dismiss</Button>
  </div>}
  {error&&!edit&&<p role="alert">{error}</p>}
  {edit&&<Sheet open title={edit==='draft'?'Draft card':edit==='link'?'Link to card':'Edit idea'} onClose={()=>{if(!busy)setEdit(null)}}
    footer={<Button variant="primary" type="submit" form={formId} disabled={!canEdit||busy||(edit==='link'&&!card)}>{edit==='draft'?'Send to Inbox':'Save'}</Button>}>
   <form id={formId} className="v7-exam-form" onSubmit={submit}>
    {edit==='draft'&&<>
     <Field label="Front" name="front" defaultValue={idea.front??idea.target} maxLength={1500} required/>
     <label className="v7-field-group">Back<textarea className="v7-field" name="back" defaultValue={idea.back??''} maxLength={3000}/></label>
    </>}
    {edit==='update'&&<>
     <Field label="Retrieval target" name="target" defaultValue={idea.target} minLength={3} maxLength={300} required/>
     <Field label="Reason" name="reason" defaultValue={idea.reason??''} maxLength={300}/>
    </>}
    {edit==='link'&&<>
     <Field label="Search cards in this Path" value={search} onChange={event=>{setSearch(event.target.value);setCard(undefined)}}/>
     {(cards.data??[]).filter(item=>item.status==='active').slice(0,12).map(item=><label key={item.noteNo} className="v7-exam-check">
      <input type="radio" name="card" checked={item.noteNo===card} onChange={()=>setCard(item.noteNo)}/> N{item.noteNo} · {item.front}
     </label>)}
    </>}
    {error&&<p role="alert">{error}</p>}
   </form>
  </Sheet>}
 </li>
}
