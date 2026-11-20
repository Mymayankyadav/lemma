import {useEffect,useId,useState} from 'react'
import {getDemoProfile,getMode} from '../../data/mode'
import {openDemoManualTutor} from '../../data/tutor/demo-manual'
import {isFlagOn} from '../../flags'
import {Button,Sheet} from '../../ui/v7/components'

type Scope = { pathId: string; checkpointId: string; title: string; objective: string }
type Tutor = Awaited<ReturnType<typeof openDemoManualTutor>>
type Thread = Awaited<ReturnType<Tutor['resume']>>

function useDraft(key: string) {
  const [text,setText] = useState(() => {
    try { return sessionStorage.getItem(key) ?? '' } catch { return '' }
  })
  const [unsaved,setUnsaved] = useState(false)
  function change(value: string) {
    setText(value)
    try {
      if (value) sessionStorage.setItem(key,value)
      else sessionStorage.removeItem(key)
      setUnsaved(false)
    } catch { setUnsaved(true) }
  }
  function clearIfUnchanged(expected: string) {
    setText(current=>current===expected?'':current)
    try {
      if(sessionStorage.getItem(key)===expected) sessionStorage.removeItem(key)
    } catch {setUnsaved(true)}
  }
  return {text,change,clearIfUnchanged,unsaved}
}

export function DemoCheckpointTutor({scope}:{scope:Scope}) {
  if (!isFlagOn('tutorManualDemo') || getMode() !== 'demo') return null
  return <TutorEntry key={JSON.stringify([getDemoProfile(),scope.pathId,scope.checkpointId])} scope={scope}/>
}

function TutorEntry({scope}:{scope:Scope}) {
  const [open,setOpen] = useState(false)
  return <section className="v7-learn-card" aria-label="Manual tutor preview">
    <Button onClick={()=>setOpen(true)}>Open manual tutor</Button>
    <Sheet title="Manual tutor" eyebrow="Demo preview" open={open} onClose={()=>setOpen(false)}>
      {open && <TutorBody scope={scope}/>}
    </Sheet>
  </section>
}

function TutorBody({scope}:{scope:Scope}) {
  const draftKey='lemma.demo-tutor:'+JSON.stringify([getDemoProfile(),scope.pathId,scope.checkpointId])
  const question=useDraft(draftKey+':question'), context=useDraft(draftKey+':context')
  const [session,setSession]=useState<{api:Tutor; thread:Thread}>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const questionId=useId(),copyId=useId()
  const [copyStatus,setCopyStatus]=useState('')
  const {pathId,checkpointId}=scope
  const excerpt=scope.objective.slice(0,1200)
  useEffect(()=>{
    let active=true
    let api:Tutor|undefined
    async function connect() {
      try {
        api=await openDemoManualTutor({pathId,checkpointId})
        if (!active) {api.close();return}
        const thread=await api.resume()
        if (active) setSession({api,thread})
      } catch { if (active) setError('Could not open the tutor preview. Close it and try again.') }
    }
    void connect()
    return ()=>{active=false;api?.close()}
  },[pathId,checkpointId])

  async function saveQuestion() {
    if (!session || busy || !question.text.trim()) return
    setBusy(true);setError('');setCopyStatus('')
    try {
      const result=await session.api.submit(crypto.randomUUID(),{
        question:question.text,
        selectedContext:context.text && excerpt ? [{kind:'checkpoint',refId:checkpointId,version:'demo',excerpt}] : [],
      })
      if(result.kind==='submitted') question.clearIfUnchanged(question.text)
      else setError('A question is already waiting. Your new text was kept.')
      const thread=await session.api.resume()
      setSession({api:session.api,thread})
    } catch { setError('Could not confirm the saved question. Reopen to check before retrying.') }
    finally {setBusy(false)}
  }

  async function confirm(body:string,turnId:string,version:number,draftId:string) {
    if (!session || busy) return false
    setBusy(true);setError('')
    try {
      const result=await session.api.confirmImport(turnId,version,draftId,body)
      const thread=await session.api.resume()
      setSession({api:session.api,thread})
      if (result.kind==='completed') return true
      if (result.kind==='already-completed') {
        setError('Another reply was already imported. Your paste was kept under Recoverable replies.')
        return true
      }
      setError('The reply was not confirmed. Your paste was kept.')
      return false
    } catch { setError('Could not confirm the saved reply. Reopen to check before retrying.');return false }
    finally {setBusy(false)}
  }

  const thread=session?.thread,last=thread?.turns.at(-1)
  const pending=last?.status==='awaiting-tutor'?last:null
  const handoff=pending?[pending.snapshot.question,...pending.snapshot.selectedContext.map(x=>x.excerpt)].join('\n\n'):''
  async function copy() {
    try { await navigator.clipboard.writeText(handoff);setCopyStatus('Question copied.') }
    catch { setCopyStatus('Clipboard unavailable. Select and copy the text yourself.') }
  }
  return <>
    <p>{scope.title}. This demo stays in this browser. Nothing is sent to a tutor.</p>
    {error&&<p role="alert">{error}</p>}
    {!session&&!error&&<p role="status">Opening saved tutor preview…</p>}
    {session&&!pending&&<div className="v7-field-group">
      <label htmlFor={questionId}>Question</label>
      <textarea id={questionId} className="v7-field" rows={4} maxLength={2000} value={question.text}
        disabled={busy} onChange={e=>question.change(e.currentTarget.value)}/>
      {excerpt&&<label>
        <input type="checkbox" checked={Boolean(context.text)} disabled={busy}
          onChange={e=>context.change(e.currentTarget.checked?'yes':'')}/> Include this checkpoint’s objective
      </label>}
      {Boolean(context.text)&&excerpt&&<p>{excerpt}</p>}
      <Button disabled={busy||!question.text.trim()} onClick={()=>{void saveQuestion()}}>Save question</Button>
      {(question.unsaved||context.unsaved)&&<p role="alert">This draft may not survive a reload.</p>}
    </div>}
    {pending&&<div className="v7-field-group">
      <p role="status">Saved. Waiting for a reply.</p>
      <label htmlFor={copyId}>Text for your tutor</label>
      <textarea id={copyId} className="v7-field" value={handoff} rows={4} readOnly/>
      <Button onClick={()=>{void copy()}}>Copy for tutor</Button>
      {copyStatus&&<p role="status">{copyStatus}</p>}
    </div>}
    {pending&&<ReplyEditor key={pending.id} draftKey={draftKey+':reply:'+pending.id} busy={busy}
      completed={false} onConfirm={(body,id)=>confirm(body,pending.id,pending.version,id)}/>}
    {thread?.turns.map(turn=>turn.status==='completed'&&<article key={turn.id} aria-label="Imported reply">
      <h3>Imported by you</h3>
      <p className="v7-field-hint">{turn.snapshot.question}</p>
      <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{turn.finalReply.body}</p>
      <ReplyEditor draftKey={draftKey+':reply:'+turn.id} busy={busy} completed onConfirm={async()=>false}/>
    </article>)}
    {!!thread?.recoveredDrafts.length&&<details><summary>Recoverable replies</summary>
      {thread.recoveredDrafts.map((item,i)=><div key={i} className="v7-field-group">
        <textarea className="v7-field" aria-label={'Recoverable reply '+(i+1)} readOnly value={item.body}/>
      </div>)}
    </details>}
  </>
}

function ReplyEditor({draftKey,busy,completed,onConfirm}:{
  draftKey:string;busy:boolean;completed:boolean;onConfirm:(body:string,id:string)=>Promise<boolean>;
}) {
  const draft=useDraft(draftKey)
  const labelId=useId()
  const [preview,setPreview]=useState<{body:string;id:string}>()
  if (completed&&!draft.text&&!preview) return null
  return <div className="v7-field-group">
    {completed&&<p>A reply is already saved. You can still copy your unfinished paste.</p>}
    <label htmlFor={labelId}>Paste reply</label>
    <textarea id={labelId} className="v7-field" rows={5} maxLength={12000} value={draft.text}
      onChange={e=>draft.change(e.currentTarget.value)} disabled={busy||Boolean(preview)}/>
    {draft.unsaved&&<p role="alert">This draft may not survive a reload.</p>}
    {!preview&&!completed&&<Button disabled={busy||!draft.text.trim()}
      onClick={()=>setPreview({body:draft.text,id:crypto.randomUUID()})}>Preview import</Button>}
    {preview&&<section aria-label="Import preview">
      <p>Imported by you</p>
      <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.body}</p>
      <Button disabled={busy} onClick={()=>setPreview(undefined)}>Cancel import</Button>
      <Button disabled={busy||completed} onClick={()=>{
        void onConfirm(preview.body,preview.id).then(saved=>{
          if(saved){draft.clearIfUnchanged(preview.body);setPreview(undefined)}
        })
      }}>Confirm import</Button>
    </section>}
  </div>
}
