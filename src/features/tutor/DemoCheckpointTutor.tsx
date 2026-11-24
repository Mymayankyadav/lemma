import {Disclosure} from '../../ui/v7/Disclosure';
import {useTutorInk} from './TutorInk';
import {TutorAnswer,tutorAnswerText} from './TutorAnswer';
import {referencedImageIds} from '../../../supabase/functions/_shared/tutor-answer';
import {rasterizeInk} from '../../ui/v7/ink/images';
import {assertTutorInkScope,emptyInk,inkIssueText,removeSubmittedInk,tutorInkIssue,uploadTutorImage,type TutorInkScope} from '../../data/tutor/ink-storage';
import {IMAGE_ONLY_ANSWER,removeTutorImageReferences,type TutorImageDraft} from '../../data/tutor/attachment-types';
import {useCallback,useEffect,useId,useMemo,useRef,useState,useSyncExternalStore} from 'react'
import {Link} from 'react-router'
import {usePlanRelease} from '../../data/usePlanRelease'
import {authGeneration,authOwner,onAccountChange} from '../../data/authBoundary'
import type {TutorComposerDraft,TutorContextSelection} from '../../data/tutor/turn-model'
import {tutorMessageKey,withTutorMessageDeletions,type ManualTutor,type SavedTutorTurn,type TutorMessageRef,type TutorThreadView} from '../../data/tutor/manual-api'
import {getDemoProfile,getMode} from '../../data/mode'
import {addLocalTutorExcerpt,LOCAL_TUTOR_EXCERPT_LIMIT,previewLocalTutorExcerpt} from '../../data/tutor/local-excerpt'
import {openDemoManualTutor} from '../../data/tutor/demo-manual'
import {subscribeTutorLocalCleanup,tutorLocalScopeActive,tutorOwnerDeleted,tutorStorageOwner,writeTutorLocal} from '../../data/tutor/local-storage'
import {isFlagOn} from '../../flags'
import {Button,IconButton,Sheet} from '../../ui/v7/components'
import {SquarePlus} from 'lucide-react'
import {MathText} from '../../ui/MathText'
import {chatLink,studyPrompt} from '../../lib/chat'
import {TutorChat,type SendOptions} from './TutorChat'
import {TutorChatMessage} from './TutorMessageSelection'
import type {TutorPageContext} from './TutorLayout'
import {ReplyActions} from './ReplyActions'
import {QuestionnaireButton,type QuestionnaireBackup} from './TutorQuestionnaire'
import type {TutorQuestionnaire} from '../../../supabase/functions/_shared/tutor-questionnaire'
import type {TutorAnswerAid} from '../../../supabase/functions/_shared/tutor-answer-aids'
import type {TutorFollowUp} from '../../data/tutor/manual-api'
import './replyActions.css'

type Scope = {pathId:string;checkpointId:string;title:string;objective:string;sourceShort?:string|null;linkedSessions?:readonly {number:number;goal:string}[];authScope?:{ownerId:string;generation:number;checkpointId:string}}
type Handoff = {text:string;requestId:string}
type FollowupDraft = {id:string;turnId:string;body:string}
type EntryProps = {initialQuestion?:string;page?:TutorPageContext;connectorUrl?:string;connectorLoading?:boolean;scope:Scope;handoff?:Handoff;onHandoffConsumed?:(id:string)=>void}
const subscribe=(refresh:()=>void)=>{
  const account=onAccountChange(refresh),cleanup=subscribeTutorLocalCleanup(refresh)
  return ()=>{account();cleanup()}
}
const authKey=()=>JSON.stringify([authOwner(),authGeneration(),Boolean(authOwner()&&tutorOwnerDeleted(authOwner()!))])

function useDraft(key:string,live=false) {
  const storage=()=>live?localStorage:sessionStorage
  const captured=useRef({key,ownerId:live?tutorStorageOwner(key):null,generation:authGeneration()}).current
  const active=()=>!live||(captured.key===key&&captured.ownerId!==null&&tutorLocalScopeActive({ownerId:captured.ownerId,generation:captured.generation}))
  const [draft,setDraft] = useState(() => {
    let text=''
    try { if(active())text=storage().getItem(key) ?? '' } catch {/* No stored draft is available. */}
    return {text,unsaved:false}
  })
  function persist(value: string) {
    try {
      if (value&&live)writeTutorLocal({ownerId:captured.ownerId!,generation:captured.generation},key,value)
      else if (value) storage().setItem(key,value)
      else storage().removeItem(key)
      return true
    } catch {return false}
  }
  /** N232: a keystroke's draft is saved when typing pauses (and when the page is hidden or the tutor closes), not on every tap. */
  const waiting=useRef<{value:string;timer:number}|null>(null)
  function flush() {
    const held=waiting.current
    if(!held)return
    window.clearTimeout(held.timer)
    waiting.current=null
    if(active()&&!persist(held.value))setDraft(current=>current.text===held.value?{text:held.value,unsaved:true}:current)
  }
  const flushRef=useRef(flush);flushRef.current=flush
  useEffect(()=>{
    const hide=()=>{if(document.visibilityState==='hidden')flushRef.current()}
    const leave=()=>flushRef.current()
    document.addEventListener('visibilitychange',hide)
    window.addEventListener('pagehide',leave)
    return ()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',leave);flushRef.current()}
  },[])
  /** `change` saves at once (the result says whether it was saved); `typed` is for keystrokes and saves after a short pause. */
  function change(value: string, typed=false) {
    if(!active())return false
    if(typed){
      setDraft({text:value,unsaved:false})
      if(waiting.current)window.clearTimeout(waiting.current.timer)
      waiting.current={value,timer:window.setTimeout(()=>flushRef.current(),600)}
      return true
    }
    if(waiting.current){window.clearTimeout(waiting.current.timer);waiting.current=null}
    const saved=persist(value)
    setDraft({text:value,unsaved:!saved})
    return saved
  }
  function clearIfUnchanged(expected: string) {
    if(!active())return
    flush()
    let cleared=false,failed=false
    try {
      const saved=storage().getItem(key)
      if(saved===expected)storage().removeItem(key)
      cleared=saved===null||saved===expected
    } catch {failed=true}
    setDraft(current=>{
      if(current.text!==expected)return current
      return {text:'',unsaved:failed||(!cleared&&current.unsaved)}
    })
  }
  return {...draft,change,clearIfUnchanged}
}

/** N234: the demo tutor's sample answer aids (a real tutor sets its own over MCP; see docs/current/N234.md). */
const DEMO_ANSWER_AID:TutorAnswerAid={
  id:'00000000-0000-4000-8000-000000000234',turnId:'00000000-0000-4000-8000-000000000235',level:'scaffold',version:1,
  wording:['Let U be an open set in Y.','By the definition of continuity,','which is what we wanted to show.'],
  terms:['preimage','open set','continuous','topological space'],symbols:['f','X','Y','U'],withhold:['complement','finite subcover'],
}

export function CheckpointTutor(props:EntryProps) {
  useSyncExternalStore(subscribe,authKey)
  const {scope}=props
  const live=getMode()==='live',released=usePlanRelease('tutorThreads')
  let readOnly=false,entryScope=scope
  if(live){
    const verified=scope.authScope
    if(!isFlagOn('tutorThreads')||!verified||verified.ownerId!==authOwner()||verified.checkpointId!==scope.checkpointId||tutorOwnerDeleted(verified.ownerId))return null
    // A cached checkpoint proves only which owner's saved history to read. Fresh
    // checkpoint authorization and the release capability are both needed to write.
    readOnly=!released||verified.generation!==authGeneration()
    entryScope={...scope,authScope:{...verified,generation:authGeneration()}}
  }else if(!props.page&&!isFlagOn('tutorManualDemo'))return null
  const account=live?[entryScope.authScope!.ownerId,entryScope.authScope!.generation]:[getDemoProfile()]
  return <TutorEntry key={JSON.stringify([live,...account,scope.pathId,scope.checkpointId])} {...props} scope={entryScope} live={live} readOnly={readOnly}/>
}

function TutorEntry(props:EntryProps & {live:boolean;readOnly:boolean}) {
  const [open,setOpen] = useState(false)
  useEffect(()=>{if(props.handoff)setOpen(true)},[props.handoff])
  if(props.page)return <TutorBody key={String(props.readOnly)} {...props}/>
  return <section className="v7-learn-card" aria-label={props.live?'Checkpoint tutor':'Manual tutor preview'}>
    <Button onClick={()=>setOpen(true)}>{props.live?'Open checkpoint tutor':'Open manual tutor'}</Button>
    <Sheet title={props.live?'Checkpoint tutor':'Manual tutor'} eyebrow={props.live?undefined:'Demo preview'} open={open} onClose={()=>setOpen(false)}>
      {open && <TutorBody key={String(props.readOnly)} {...props}/>}
    </Sheet>
  </section>
}

function TutorBody({initialQuestion,page,connectorUrl,connectorLoading,scope,live,readOnly,handoff:padHandoff,onHandoffConsumed}:EntryProps & {live:boolean;readOnly:boolean}) {
  const {pathId,checkpointId}=scope;
  const {ownerId,generation}=scope.authScope??{};
  const profile=live?undefined:getDemoProfile();
  const draftKey=(live?'lemma.tutor.draft:':'lemma.demo-tutor:')+
    JSON.stringify([live?ownerId:profile,pathId,checkpointId])
  const scratchEnabled=Boolean(page&&isFlagOn('tutorScratch'));
  const inkScope=useMemo<TutorInkScope>(()=>({pathId,checkpointId,...(live?{ownerId:ownerId!,generation:generation!}:{profile:profile!})}),
    [live,ownerId,generation,profile,pathId,checkpointId]);
  const ink=useTutorInk(inkScope,scratchEnabled);
  const question=useDraft(draftKey+':question',live), context=useDraft(draftKey+':context',live)
  const followupDraft=useDraft(draftKey+':followup',live)
  function editQuestion(text:string) {
    if(followupDraft.text&&text.trim()!==question.text.trim())followupDraft.clearIfUnchanged(followupDraft.text)
    return question.change(text,true)
  }
  const capturedQuestion=useRef(false);
  useEffect(()=>{
    if(!initialQuestion||capturedQuestion.current||readOnly)return;
    capturedQuestion.current=true;
    if(!question.text)question.change(initialQuestion);
  },[initialQuestion,readOnly,question.text]);
  const [sourcePage,setSourcePage]=useState('1')
  const [sourcePreview,setSourcePreview]=useState<TutorContextSelection>()
  const sourceDraft=useDraft(draftKey+':source',live)
  let attachedSource:TutorContextSelection|undefined
  try {attachedSource=sourceDraft.text?JSON.parse(sourceDraft.text):undefined} catch {/* Restore only a saved selection. */}
  const [selectedLocal,setSelectedLocal]=useState('')
  const attachedLocal=useDraft(draftKey+':attached-local',live)
  const draftWarning=followupDraft.unsaved&&followupDraft.text
    ?'Sending is paused because this device could not save the follow-up for retry. Keep this draft open and try Send again.'
    :question.unsaved||context.unsaved||attachedLocal.unsaved||sourceDraft.unsaved
    ?'Some draft changes could not be saved on this device and may be lost on reload.':undefined
  const [preview,setPreview]=useState<ReturnType<typeof previewLocalTutorExcerpt>>()
  const [session,setSession]=useState<{api:ManualTutor; thread:TutorThreadView}>()
  // N228: the tutor's quick questionnaires on this thread, shown in each reply's row.
  const questionnaireApi=session?.api.questionnaires
  const [questionnaires,setQuestionnaires]=useState<readonly TutorQuestionnaire[]>([])
  useEffect(()=>{
    if(!questionnaireApi){setQuestionnaires([]);return}
    let current=true
    void questionnaireApi.list().then(list=>{if(current)setQuestionnaires(list)},()=>undefined)
    return ()=>{current=false}
  },[questionnaireApi,session?.thread.readAt])
  // N228 (Owner: "allow posting of messages even when tutor is not"): extra messages on the turn waiting for the tutor.
  const followupApi=session?.api.followups
  const [followups,setFollowups]=useState<readonly TutorFollowUp[]>([])
  const loadFollowups=useCallback(async()=>{
    if(!followupApi){setFollowups([]);return}
    try{setFollowups(await followupApi.list())}catch{/* They are shown when the thread reloads. */}
  },[followupApi])
  useEffect(()=>{void loadFollowups()},[loadFollowups,session?.thread.readAt])
  // N234: the tutor's answer aids (behind tutorAnswerAids): the latest set on this thread shapes the strip while the learner
  // writes the next answer. The demo tutor has a sample bank, so the feature can be tried without a connected tutor.
  const answerAidApi=session?.api.answerAids
  const [threadAids,setThreadAids]=useState<readonly TutorAnswerAid[]>([])
  useEffect(()=>{
    if(!answerAidApi||!isFlagOn('tutorAnswerAids')){setThreadAids([]);return}
    let current=true
    void answerAidApi.list().then(list=>{if(current)setThreadAids(list)},()=>undefined)
    return ()=>{current=false}
  },[answerAidApi,session?.thread.readAt])
  const answerAid=useMemo<TutorAnswerAid|undefined>(()=>{
    if(!isFlagOn('tutorAnswerAids'))return undefined
    if(threadAids.length)return threadAids[threadAids.length-1]
    return live?undefined:DEMO_ANSWER_AID
  },[threadAids,live])
  // A stand-in for the Atlas's evidence until it is wired in: a demonstrated checkpoint is well known, an open one grows with its steps.
  const mastery=page?(page.detail.view.demonstratedAt?.9:Math.min(.6,page.detail.view.currentStep/Math.max(1,page.detail.view.stepsTotal)*.6)):undefined
  const replaceQuestionnaire=useCallback((next:TutorQuestionnaire)=>setQuestionnaires(list=>list.map(item=>item.id===next.id&&item.version<=next.version?next:item)),[])
  const questionnaireBackup=useMemo<QuestionnaireBackup>(()=>{
    const key=(id:string)=>draftKey+':questionnaire:'+id
    return {
      read(id){
        try {
          const kept:unknown=JSON.parse(localStorage.getItem(key(id))??'null')
          if(!kept||typeof kept!=='object')return null
          const answers='edits' in kept?kept.edits:'base' in kept&&typeof kept.base==='number'&&'answers' in kept?kept.answers:null
          return answers&&typeof answers==='object'&&!Array.isArray(answers)?kept as ReturnType<QuestionnaireBackup['read']>:null
        } catch {return null}
      },
      write(id,edits,expected){
        try {
          if(live&&!tutorLocalScopeActive({ownerId:ownerId!,generation:generation!}))return false
          // A late acknowledgement must leave any newer draft written by another tab in place.
          if(expected!==undefined&&(localStorage.getItem(key(id))??'null')!==JSON.stringify(expected))return false
          if(!Object.keys(edits).length){localStorage.removeItem(key(id));return true}
          const value=JSON.stringify({edits})
          if(live)writeTutorLocal({ownerId:ownerId!,generation:generation!},key(id),value)
          else localStorage.setItem(key(id),value)
          return true
        } catch {return false}
      },
    }
  },[draftKey,live,ownerId,generation])
  const [busy,setBusy]=useState(false)
  const [queueSaving,setQueueSaving]=useState(false)
  const [error,setError]=useState('')
  const questionId=useId(),copyId=useId(),selectionId=useId()
  const [copyStatus,setCopyStatus]=useState('')
  const excerpt=scope.objective
  const [history,setHistory]=useState<TutorThreadView['turns']>([])
  const [deletedMessages,setDeletedMessages]=useState<ReadonlySet<string>>(()=>new Set())
  const [historyDrafts,setHistoryDrafts]=useState<TutorThreadView['recoveredDrafts']>([])
  const [historyCursor,setHistoryCursor]=useState<number|null>()
  const loadedHistoryCursors=useRef(new Set<number>())
  const rememberDeletions=useCallback((turns:TutorThreadView['turns'])=>{
    const keys:string[]=[]
    for(const turn of turns){
      if(turn.questionDeleted)keys.push(tutorMessageKey({kind:'question',id:turn.id}))
      if(turn.replyDeleted&&turn.status==='completed')keys.push(tutorMessageKey({kind:'reply',id:turn.finalReply.messageId}))
    }
    if(keys.length)setDeletedMessages(current=>keys.every(key=>current.has(key))?current:new Set([...current,...keys]))
  },[])
  useEffect(()=>{setHistoryCursor(undefined)},[session?.thread.before])
  const [draftNext,setDraftNext]=useState(false)
  const [showLocal,setShowLocal]=useState(false)
  const [grant,setGrant]=useState<{token:string;endpoint:string;grantId:string}>()
  const consumed=useRef('')
  useEffect(()=>{
    if(readOnly||!padHandoff||consumed.current===padHandoff.requestId)return
    consumed.current=padHandoff.requestId
    setDraftNext(true);setShowLocal(true);setSelectedLocal(padHandoff.text);setPreview(previewLocalTutorExcerpt(padHandoff.text))
    onHandoffConsumed?.(padHandoff.requestId)
  },[readOnly,padHandoff,onHandoffConsumed])
  const [connectionVersion,setConnectionVersion]=useState(0)
  const readVersion=useRef(0)
  const refresh=useCallback(async(api:ManualTutor,reconcile=Boolean(connectorUrl),revalidateHistory=false)=>{
    const request=++readVersion.current
    const thread=await api.resume(undefined,reconcile,connectorUrl)
    if(request!==readVersion.current)return
    rememberDeletions(thread.turns)
    setSession({api,thread});setError('')
    // A deletion does not advance a turn's sequence. Re-read the pages already
    // on screen, and keep confirmed flags even if an overlapping page is older.
    if(revalidateHistory&&!thread.offline)for(const before of [...loadedHistoryCursors.current]){
      const older=await api.resume(before)
      if(request!==readVersion.current)return
      if(older.head.threadId===thread.head.threadId)rememberDeletions(older.turns)
    }
  },[connectorUrl,rememberDeletions])
  useEffect(()=>{
    let active=true,api:ManualTutor|undefined
    async function connect() {
      try {
        api=live?(await import('../../data/tutor/live-manual')).openLiveManualTutor({
          pathId,checkpointId,ownerId:ownerId!,generation:generation!,readOnly,
        }):await openDemoManualTutor({pathId,checkpointId})
        if(!active){api.close();return}
        await refresh(api,true)
      } catch {if(active)setError('Could not open the saved conversation. Try again.')}
    }
    void connect()
    return ()=>{active=false;readVersion.current++;api?.close()}
  },[pathId,checkpointId,live,readOnly,ownerId,generation,refresh,connectionVersion])
  const activeApi=session?.api
  const processed=useRef<TutorThreadView|undefined>(undefined)
  useEffect(()=>{
    const thread=session?.thread
    if(!thread?.reconciled?.length||processed.current===thread)return
    if(live&&(!ownerId||generation===undefined||!tutorLocalScopeActive({ownerId,generation})))return
    processed.current=thread
    for(const item of thread.reconciled){
      if(item.operation==='start'&&item.status==='submitted'){
        question.clearIfUnchanged(item.text)
        if(item.localExcerpt)attachedLocal.clearIfUnchanged(item.localExcerpt)
        if(item.source)sourceDraft.clearIfUnchanged(JSON.stringify(item.source))
      }
      if(item.operation==='manual'&&['completed','already-completed'].includes(item.status)){
        const key=draftKey+':reply:'+item.turnId
        try {if(localStorage.getItem(key)===item.text)localStorage.removeItem(key)} catch {/* Keep the existing draft on failure. */}
      }
      if(item.status==='conflict'||item.status==='turn-pending')setError('A saved submission conflicted. Your draft was kept.')
    }
  },[session,draftKey,question,attachedLocal,sourceDraft,live,ownerId,generation])
  const pendingId=session?.thread.head.pendingTurnId
  useEffect(()=>{setGrant(undefined)},[pendingId])
  useEffect(()=>{
    if(!scratchEnabled||!ink.ready||!session)return;
    const submitted=new Set(session.thread.turns.flatMap(turn=>turn.snapshot.attachments?.map(image=>image.id)??[]));
    if(submitted.size)void ink.update(current=>removeSubmittedInk(current,submitted)).catch(()=>{});
  },[scratchEnabled,session,ink.ready,ink.draft]);
  useEffect(()=>{
    if(!live||!activeApi)return
    let active=true,refreshing=false
    const update=()=>{if(!refreshing&&document.visibilityState!=='hidden'){refreshing=true;void refresh(activeApi,true,true).catch(()=>{
      if(active)setError('Could not refresh. Showing the last confirmed conversation.')
    }).finally(()=>{refreshing=false})}}
    window.addEventListener('focus',update);window.addEventListener('online',update);window.addEventListener('offline',update)
    document.addEventListener('visibilitychange',update)
    const timer=window.setInterval(update,pendingId?3000:10000)
    return ()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);document.removeEventListener('visibilitychange',update)}
  },[live,activeApi,pendingId,refresh])
  async function saveQuestion(text=question.text,options:SendOptions={}) {
    const recovery=scratchEnabled&&!options.keepDraft?ink.snapshot():undefined;
    const issue=tutorInkIssue(text,recovery);
    if(issue){setError(inkIssueText[issue]);return;}
    const inkDraft=recovery?.status==='ready'?recovery.draft:emptyInk;
    const ids=referencedImageIds(text),inline=inkDraft.inlineImages||ids.length>0;
    if(inline&&(inkDraft.strokes.length||inkDraft.editingDrawing&&ids.includes(inkDraft.editingDrawing.id))) {
      setError('Insert or cancel the current drawing before sending.');return;
    }
    const hasImages=Boolean(inline?ids.length:inkDraft.strokes.length||inkDraft.photos.length);
    if((session?.thread.offline||session?.thread.head.pendingTurnId)&&hasImages&&!readOnly&&!busy&&!options.keepDraft) {
      setBusy(true);setQueueSaving(true);setError('');
      try {
        await ink.update(current=>current===inkDraft?{...current,queuedText:text}:current);
        if(ink.snapshot().draft.queuedText!==text)throw new Error('The answer changed before it could be queued.');
      } catch {
        if(text!==question.text)question.change(text);
        setError('Could not queue this answer. Your answer and images are still here.');
        await ink.update(current=>current.queuedText===text?{...current,queuedText:undefined}:current).catch(()=>{});
      } finally {setQueueSaving(false);setBusy(false);}
      return;
    }
    const body=text.trim()
    let retry:FollowupDraft|undefined
    try {
      const stored:FollowupDraft|null=JSON.parse(followupDraft.text||'null')
      if(stored?.body===body&&typeof stored.id==='string'&&typeof stored.turnId==='string')retry=stored
    } catch {/* Treat an unreadable attempt as a new draft. */}
    // A committed follow-up remains retrievable by ID even if the tutor replied before the retry.
    const waiting=retry?.turnId??session?.thread.head.pendingTurnId
    if (waiting && followupApi && session && !busy && !readOnly && !session.thread.offline && session.thread.canSubmit!==false && !session.thread.outbox?.length) {
      // N228: the tutor has not replied yet. The message joins the waiting question (text only; pictures wait for the reply).
      if (hasImages) {setError('Pictures can be sent once the tutor has replied. Remove them to post this now.');return}
      if (!body || text.length>2000 || text.includes('□')) return
      const attempt=retry??{id:crypto.randomUUID(),turnId:waiting,body}
      const stored=JSON.stringify(attempt)
      // A failed write still leaves the ID in memory. Require a durable ID before every send.
      if(!followupDraft.change(stored)){setError('');return}
      setBusy(true);setError('')
      try {
        const saved=await followupApi.add(attempt.turnId,attempt.id,attempt.body)
        setFollowups(list=>list.some(item=>item.id===saved.id)?list:[...list,saved])
        question.clearIfUnchanged(text)
        followupDraft.clearIfUnchanged(stored)
      } catch (err) {
        if(err instanceof Error&&'code' in err&&err.code==='40001')followupDraft.clearIfUnchanged(stored)
        await refresh(session.api).catch(()=>{})
        setError(err instanceof Error?err.message:'Your message was not saved. It is still in the box.')
      } finally {setBusy(false)}
      return
    }
    if (!session || busy || readOnly || session.thread.offline || session.thread.canSubmit===false ||
      session.thread.head.pendingTurnId || session.thread.outbox?.length || !text.trim()&&!hasImages || text.length>2000 ||
      (page && !options.keepDraft && text.includes('□')) || connectorLoading) return
    setBusy(true);setError('');setCopyStatus('')
    try {
      const local=!options.keepDraft && attachedLocal.text ? previewLocalTutorExcerpt(attachedLocal.text) : undefined
      const includeObjective=options.includeObjective || (!options.keepDraft && Boolean(context.text))
      const images:TutorImageDraft[]=inline?ids.map(id=>inkDraft.photos.find(image=>image.id.toLowerCase()===id)!):[...inkDraft.photos];
      if(hasImages&&!inline&&inkDraft.strokes.length) {
        const drawingId=inkDraft.drawingId??crypto.randomUUID();
        if(!inkDraft.drawingId)await ink.update(current=>current.strokes===inkDraft.strokes?({...current,drawingId}):current);
        images.push({id:drawingId,kind:'drawing',mimeType:'image/png',blob:await rasterizeInk(inkDraft.strokes,inkDraft.width,inkDraft.accent)});
      }
      const assertCurrent=()=>assertTutorInkScope(inkScope);
      assertCurrent();
      const attachments=hasImages?await Promise.all(images.map(file=>uploadTutorImage(ownerId??'',file,assertCurrent))):[];
      assertCurrent();
      const draft:TutorComposerDraft={
        question:text.trim()?text:IMAGE_ONLY_ANSWER,
        ...(attachments.length&&{attachments}),
        ...(local?.kind==='preview' ? {localExcerpt:addLocalTutorExcerpt(local)} : {}),
        selectedContext:[...(includeObjective && excerpt ? [{kind:'checkpoint' as const,refId:checkpointId,version:'demo',excerpt}] : []),
          ...(!options.keepDraft && attachedSource?[attachedSource]:[])],
      }
      const id=crypto.randomUUID(),sequence=session.thread.head.lastSequence
      const result=session.thread.canConnect && connectorUrl && session.api.submitToConnector
        ? await session.api.submitToConnector(id,draft,sequence,connectorUrl)
        : await session.api.submit(id,draft,sequence)
      if(result.kind==='submitted' && !options.keepDraft) {
        question.clearIfUnchanged(text);attachedLocal.clearIfUnchanged(attachedLocal.text);sourceDraft.clearIfUnchanged(sourceDraft.text)
        if(hasImages)await ink.update(current=>removeSubmittedInk(current,new Set(attachments.map(image=>image.id)))).catch(()=>{})
      }
      await refresh(session.api).catch(()=>setError('Question confirmed. Reconnect to refresh the conversation.'))
      if(result.kind!=='submitted')setError('The question was not saved. Your draft was kept.')
    } catch (err) {
      await refresh(session.api).catch(()=>{})
      setError(err instanceof Error?err.message:'Could not confirm the saved question. Check its pending submission.')
    }
    finally {setBusy(false)}
  }

  async function confirm(body:string,turnId:string,version:number,draftId:string) {
    if (!session || busy || readOnly) return false
    setBusy(true);setError('')
    try {
      const result=await session.api.confirmImport(turnId,version,draftId,body)
      await refresh(session.api).catch(()=>setError('Reply confirmed. Reconnect to refresh the conversation.'))
      if (result.kind==='completed') return true
      if (result.kind==='already-completed') {
        setError('Another reply was already imported. Your paste was kept under Recoverable replies.')
        return true
      }
      setError('The reply was not confirmed. Your paste was kept.')
      return false
    } catch (err) {
      await refresh(session.api).catch(()=>{})
      setError(err instanceof Error?err.message:'Could not confirm the saved reply. Your paste was kept.')
      return false
    }
    finally {setBusy(false)}
  }

  const thread=session?.thread,last=thread?.turns.at(-1)
  const recoveryOnly=readOnly||Boolean(thread?.offline)
  const allTurns=withTutorMessageDeletions(
    Array.from(new Map([...history,...(thread?.turns??[])].map(t=>[t.id,t])).values()).sort((a,b)=>a.sequence-b.sequence),
    deletedMessages,
  )
  const visibleFollowups=followups.filter(item=>!deletedMessages.has(tutorMessageKey({kind:'followup',id:item.id})))
  const recovered=Array.from(new Map([...historyDrafts,...(thread?.recoveredDrafts??[])].map(d=>[d.draftId??d.messageId,d])).values())
  const pending=last?.status==='awaiting-tutor'?last:null
  useEffect(()=>{
    const queued=ink.draft.queuedText;
    if(!scratchEnabled||!ink.ready||queued===undefined||tutorInkIssue(queued,ink)||!session||session.thread.offline||
      session.thread.head.pendingTurnId||session.thread.outbox?.length||readOnly||busy||connectorLoading)return;
    // Send the queued answer when the tutor is ready and the network is available.
    if(!error)void saveQuestion(queued);
  },[scratchEnabled,ink.status,ink.draft,session?.thread.offline,session?.thread.head.pendingTurnId,session?.thread.outbox?.length,busy,readOnly,error,connectorLoading])
  const localExcerpt=pending?.snapshot.localExcerpt
  const handoff=pending?[tutorAnswerText(pending.snapshot.question,pending.snapshot.attachments),...pending.snapshot.selectedContext.map(x=>x.excerpt),
    ...(localExcerpt ? ['Local excerpt (learner-provided; not a citation):\n'+localExcerpt.text] : []),
  ].join('\n\n'):''
  async function action(run:()=>Promise<unknown>) {
    if(!session||busy)return false
    setBusy(true);setError('')
    try {
      await run()
      await refresh(session.api).catch(()=>setError('Operation confirmed. Reconnect to refresh the conversation.'))
      return true
    }
    catch (err){await refresh(session.api).catch(()=>{});setError(err instanceof Error?err.message:'This operation could not be confirmed.');return false}
    finally {setBusy(false)}
  }
  async function copy() {
    try { await navigator.clipboard.writeText(handoff);setCopyStatus('Question copied.') }
    catch { setCopyStatus('Clipboard unavailable. Select and copy the text yourself.') }
  }
  async function deleteMessages(messages:readonly TutorMessageRef[]) {
    if(!session?.api.deleteMessages||recoveryOnly||busy)throw new Error('Reconnect to the conversation and try again.')
    setBusy(true)
    try {
      await session.api.deleteMessages(messages)
      setDeletedMessages(current=>new Set([...current,...messages.map(tutorMessageKey)]))
      await refresh(session.api).catch(()=>{})
      void loadFollowups()
    } finally {setBusy(false)}
  }
  const canConnect=Boolean(thread?.canConnect && !recoveryOnly && connectorUrl && session?.api.connectTurn)
  const delivery=thread?.connectorDelivery
  const clientName=page?.client==='chatgpt'?'ChatGPT':'Claude'
  const tutorLink=page && delivery && delivery.turnId===pending?.id && canConnect
    ? chatLink(page.client,'Continue this checkpoint in Lemma. Use the Lemma MCP get tool with '+
      JSON.stringify({what:'tutor_turn',id:delivery.reference})+
      '. Follow its claim and reply instructions. Send your feedback and next question back to the learner in Lemma.')
    : undefined
  const claimed=pending?.claimExpiresAt && Date.parse(pending.claimExpiresAt)>Date.now()
  const connectionStatus=pending && <>
    <p>{recoveryOnly?'Showing the last confirmed turn.':!live?'Saved in this demo. Import a tutor reply to continue.':
      claimed?'Your tutor is responding…':tutorLink?'Answer ready for your tutor in Lemma MCP.':
      canConnect?'Answer saved. Connect your tutor to this turn.':'Answer saved. You can import a reply in Tutor connection.'}</p>
    {tutorLink && !claimed && <>
      <p>Open {clientName} if your tutor session is idle. Its reply will appear here.</p>
      <a className="v7-button v7-primary" href={tutorLink} target="_blank" rel="noopener noreferrer">Open {clientName}</a>
    </>}
    {!tutorLink && canConnect && !claimed && <Button disabled={busy} onClick={()=>void action(
      ()=>session!.api.connectTurn!(pending.id,pending.version,connectorUrl!)
    )}>Send to tutor</Button>}
  </>
  // N223 (Owner: "too many words"): one line per control, the kit's fields, no instructions the controls already say.
  const contextControls=<div className="tutor-context">
      {excerpt&&<label className="tutor-context-check">
        <input type="checkbox" checked={Boolean(context.text)} disabled={busy}
          onChange={e=>context.change(e.currentTarget.checked?'yes':'')}/> Include this checkpoint’s objective
      </label>}
      {Boolean(context.text)&&excerpt&&<p>{excerpt}</p>}
      {scope.sourceShort&&session?.api.previewSource&&<Disclosure label={'Add a page from '+scope.sourceShort}>
        <div className="tutor-context-row">
          <label className="tutor-context-field">Page<input className="v7-field" type="number" inputMode="numeric" min={1} step={1} value={sourcePage} disabled={busy}
            onChange={e=>{setSourcePage(e.currentTarget.value);setSourcePreview(undefined)}}/></label>
          <Button disabled={busy||!Number.isInteger(Number(sourcePage))||Number(sourcePage)<1}
            onClick={()=>void action(async()=>setSourcePreview(await session?.api.previewSource!(Number(sourcePage))))}>Preview page</Button>
        </div>
        {sourcePreview&&<section aria-label="Source excerpt preview"><p style={{whiteSpace:'pre-wrap'}}>{sourcePreview.excerpt}</p>
          <Button disabled={busy} onClick={()=>{sourceDraft.change(JSON.stringify(sourcePreview));setSourcePreview(undefined)}}>Add source excerpt</Button>
        </section>}
      </Disclosure>}
      {attachedSource&&<section aria-label="Attached source excerpt"><p>{scope.sourceShort}, page {attachedSource.page}</p>
        <p style={{whiteSpace:'pre-wrap'}}>{attachedSource.excerpt}</p><Button disabled={busy} onClick={()=>sourceDraft.change('')}>Remove source excerpt</Button>
      </section>}
      <Disclosure open={showLocal} onOpen={setShowLocal} label="Add an excerpt">
        <div className="tutor-context-label"><label htmlFor={selectionId}>Excerpt</label><small>{selectedLocal.length}/{LOCAL_TUTOR_EXCERPT_LIMIT}</small></div>
        <textarea id={selectionId} className="v7-field" rows={3} value={selectedLocal} disabled={busy} placeholder="Paste the text you selected"
          onChange={e=>{setSelectedLocal(e.currentTarget.value);setPreview(undefined)}}/>
        <Button disabled={busy||!selectedLocal.trim()} onClick={()=>setPreview(previewLocalTutorExcerpt(selectedLocal))}>
          Preview excerpt
        </Button>
        {preview?.kind==='too-long'&&<p role="alert">Select a shorter excerpt before adding it.</p>}
        {preview?.kind==='preview'&&<section aria-label="Local excerpt preview">
          <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.text}</p>
          <Button disabled={busy} onClick={()=>setPreview(undefined)}>Cancel excerpt preview</Button>
          <Button disabled={busy} onClick={()=>{
            attachedLocal.change(addLocalTutorExcerpt(preview).text)
            setSelectedLocal('');setPreview(undefined)
          }}>Add local excerpt</Button>
        </section>}
      </Disclosure>
      {attachedLocal.text&&<section aria-label="Attached local excerpt">
        <p>Local excerpt added</p>
        <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{attachedLocal.text}</p>
        <Button disabled={busy} onClick={()=>attachedLocal.change('')}>Remove local excerpt</Button>
      </section>}
  </div>
  const statusControls=<>
    {readOnly&&<p role="status">Tutor changes are unavailable. You can read saved history and check pending submissions without sending anything new.</p>}
    {error&&<div role="alert"><p>{error}</p>{!session&&<Button onClick={()=>setConnectionVersion(v=>v+1)}>Try again</Button>}</div>}
    {thread?.offline&&<p role="status">{thread.confirmedAt?'Offline. Conversation last checked '+new Date(thread.confirmedAt).toLocaleString()+'.':'Offline. Reconnect to read the conversation.'}</p>}
    {!session&&!error&&<p role="status">Opening your conversation…</p>}
    {session?.thread.outbox?.map(item=><section key={item.operationId} aria-label="Pending tutor submission">
      <p>A saved submission is waiting for confirmation.</p><p style={{whiteSpace:'pre-wrap'}}>{item.text}</p>
      <Button disabled={busy||Boolean(thread?.offline)} onClick={()=>void action(async()=>{
        const status=await session.api.retry?.(item.operationId)
        if(status==='submitted'){
          question.clearIfUnchanged(item.text)
          if(item.localExcerpt)attachedLocal.clearIfUnchanged(item.localExcerpt)
          if(item.source)sourceDraft.clearIfUnchanged(JSON.stringify(item.source))
        }
        if(status==='unconfirmed')throw new Error('No saved receipt was found. Your submission is still kept on this device.')
        if(status==='conflict'||status==='turn-pending')throw new Error('The submission conflicted. Your draft was kept.')
      })}>{readOnly?'Check saved receipt':'Check and retry submission'}</Button>
    </section>)}
  </>
  const manualControls=<>
    {pending&&<div className="v7-field-group">
      <p role="status">{pending.claimExpiresAt?'Tutor is answering until '+new Date(pending.claimExpiresAt).toLocaleTimeString()+'.':'Saved. Waiting for a reply.'}</p>
      <label htmlFor={copyId}>Text for your tutor</label>
      <textarea id={copyId} className="v7-field" value={handoff} rows={4} readOnly/>
      <Button onClick={()=>{void copy()}}>Copy for tutor</Button>
      {copyStatus&&<p role="status">{copyStatus}</p>}
      {live&&session&&<>
        <Button disabled={busy} onClick={()=>void action(()=>Promise.resolve())}>Check for reply</Button>
        {!recoveryOnly&&<>
        {thread?.canConnect&&session.api.issueGrant&&<Button disabled={busy} onClick={()=>void action(async()=>{
          setGrant(await session.api.issueGrant!(pending.id,pending.version))
        })}>Create a connector grant for this question</Button>}
        {grant&&<section aria-label="Private tutor connector grant">
          <p>Use this address and bearer token with a compatible host. The grant covers this question for one day.</p>
          <label>Connector address<input value={grant.endpoint} readOnly/></label>
          <label>Turn reference<input value={pending.id} readOnly/></label>
          <Button disabled={busy} onClick={()=>void action(async()=>{await session.api.revokeGrant!(pending.id,pending.version,grant.grantId);setGrant(undefined)})}>Revoke this grant</Button>
          <Button onClick={()=>void navigator.clipboard.writeText(grant.token).then(()=>setCopyStatus('Bearer token copied.')).catch(()=>setCopyStatus('Clipboard unavailable.'))}>Copy bearer token</Button>
        </section>}
        <Button disabled={busy} onClick={()=>void action(async()=>{await session.api.stopGrants?.(pending.id,pending.version);setGrant(undefined)})}>Revoke access and switch tutor</Button>
        <Button disabled={busy} onClick={()=>void action(()=>session.api.cancel!(pending.id,pending.version))}>Cancel question</Button>
        </>}
      </>}

    </div>}
    {pending&&<ReplyEditor live={live} key={pending.id} draftKey={draftKey+':reply:'+pending.id} busy={busy}
      completed={false} readOnly={recoveryOnly} onConfirm={(body,id)=>confirm(body,pending.id,pending.version,id)}/>}
  </>
  const loadEarlier=session&&thread?.before!=null&&thread.before>0&&<Button onClick={()=>void action(async()=>{
    const before=historyCursor??thread.before!
    const older=await session.api.resume(before)
    loadedHistoryCursors.current.add(before)
    rememberDeletions(older.turns)
    setHistory(seen=>[...older.turns,...seen])
    setHistoryDrafts(seen=>[...older.recoveredDrafts,...seen])
    setHistoryCursor(older.before??null)
  })} disabled={busy||historyCursor===null}>Load earlier questions</Button>
  const lastReplyId=allTurns.filter(turn=>turn.status==='completed').at(-1)?.id
  function learnerMessages(turn:SavedTutorTurn) {
    const extra=visibleFollowups.filter(item=>item.turnId===turn.id)
    if(turn.questionDeleted&&!extra.length)return null
    const {question:answer,attachments}=turn.snapshot
    return <div className="ans">
      {!turn.questionDeleted&&<TutorChatMessage message={{kind:'question',id:turn.id}} text={tutorAnswerText(answer,attachments)}>
        <TutorAnswer question={answer} attachments={attachments} owner={ownerId??''}/>
      </TutorChatMessage>}
      {extra.map(item=><TutorChatMessage key={item.id} message={{kind:'followup',id:item.id}} text={item.body}>
        <TutorAnswer question={item.body} owner={ownerId??''}/>
      </TutorChatMessage>)}
      {turn.status!=='completed'&&<span className="ctag">{turn.status==='cancelled'?'Cancelled':extra.some(item=>item.seen)?'Tutor has read your messages':'Saved'}</span>}
    </div>
  }
  const transcript=<>
    {page&&loadEarlier}
    {allTurns.map(turn=>{
      const learner=page?learnerMessages(turn):null
      if(turn.status!=='completed')return learner?<div key={turn.id}>{learner}</div>:null
      if(turn.replyDeleted){
        if(page)return learner?<article className="turn" key={turn.id} aria-label="Your messages">{learner}</article>:null
        return !turn.questionDeleted?<TutorAnswer key={turn.id} question={turn.snapshot.question} attachments={turn.snapshot.attachments} owner={ownerId??''}/>:null
      }
      return <article key={turn.id} className={page?"turn":undefined} aria-label={turn.finalReply.provenance.kind==='manual-import'?'Imported reply':'Tutor reply'}>
      {learner}
      {page?<TutorChatMessage message={{kind:'reply',id:turn.finalReply.messageId}} text={turn.finalReply.body} latest={turn.id===lastReplyId}>
        <MathText source={turn.finalReply.body}/>
      </TutorChatMessage>:<div>
        <h3>{turn.finalReply.provenance.kind==='manual-import'?'Imported by you':'Tutor reply'}</h3>
        {turn.finalReply.provenance.kind==='connector'&&turn.finalReply.provenance.reportedHost&&<p>The connector reports {turn.finalReply.provenance.reportedHost} as its host (unverified).</p>}
        {!turn.questionDeleted&&<TutorAnswer question={turn.snapshot.question} attachments={turn.snapshot.attachments} owner={ownerId??''}/>}
        <div className="bd"><MathText source={turn.finalReply.body}/></div>
      </div>}
      <div className={page?"tutor-details":undefined}>
      {!!turn.finalReply.citations.length&&<Disclosure label="Selected citations">
        <ul>{turn.finalReply.citations.map((citation,index)=>{
          const selection=turn.snapshot.selectedContext.find(s=>s.kind===citation.kind&&s.refId===citation.refId&&s.version===citation.version&&s.page===citation.page)
          return selection&&<li key={index}>{selection.kind==='source'?'Source page '+selection.page:'Checkpoint objective'} · version {selection.version}
            <p style={{whiteSpace:'pre-wrap'}}>{selection.excerpt}</p></li>
        })}</ul>
      </Disclosure>}
      {/* N227 (Owner): under a reply, one quiet row of icons for this chat: Copy, Good and Bad reply, Make a card, then
          what the tutor suggested (a card, a change) as small chips. The row is where chat-specific things go later. */}
      <ReplyActions id={turn.id} body={turn.finalReply.body}>
        {session?.api.proposeCard&&!recoveryOnly&&<CardSuggestion disabled={busy} onPropose={(front,back)=>action(()=>session.api.proposeCard!(turn.id,turn.version,front,back))}/>}
        {questionnaireApi&&questionnaires.filter(item=>item.turnId===turn.id).map(item=><QuestionnaireButton key={item.id} questionnaire={item}
          api={questionnaireApi} backup={questionnaireBackup} onChange={replaceQuestionnaire}/>)}
        {turn.finalReply.suggestions.filter(suggestion=>suggestion.status!=='rejected').map(suggestion=><span key={suggestion.intentId} className="tutor-reply-chip" data-status={suggestion.status}>
          <span className="tutor-reply-chip-text">{suggestion.summary}</span>
          {suggestion.proposalId&&(suggestion.status==='pending'
            ?<Link to={suggestion.kind==='card'||suggestion.kind==='card_edit'?'/proposals?card='+encodeURIComponent(suggestion.proposalId):'/proposals/'+encodeURIComponent(suggestion.proposalId)}>Review proposal</Link>
            :<small>{suggestion.status}</small>)}
        </span>)}
      </ReplyActions>
      {live&&!!scope.linkedSessions?.length&&<Disclosure label="Linked study sessions">
        <p>Open the session to record your own evidence or summary.</p>
        <ul>{scope.linkedSessions.map(study=><li key={study.number}><Link to={'/s/'+encodeURIComponent(scope.pathId)+'/'+study.number}>
          Session {study.number} · {study.goal}</Link></li>)}</ul>
      </Disclosure>}
      <ReplyEditor live={live} draftKey={draftKey+':reply:'+turn.id} busy={busy} completed onConfirm={async()=>false}/>
      </div>
      </article>
    })}
    {!page&&allTurns.filter(t=>t.status==='cancelled'&&!t.questionDeleted).map(t=><p key={t.id}>Cancelled question · {t.snapshot.question}</p>)}
    {!page&&loadEarlier}
    {!!recovered.length&&<Disclosure label="Recoverable replies">
      {recovered.map((item,i)=><div key={item.draftId??item.messageId} className="v7-field-group">
        <textarea className="v7-field" aria-label={'Recoverable reply '+(i+1)} readOnly value={item.body}/>
      </div>)}
    </Disclosure>}  </>
  if(page)return <TutorChat page={page} turns={allTurns} draft={ink.draft.queuedText??question.text} onChange={editQuestion} answerAid={answerAid} mastery={mastery}
    onSend={saveQuestion} ink={scratchEnabled?ink:undefined} canQueueImage={Boolean(thread&&!readOnly&&!busy&&!connectorLoading&&!thread.outbox?.length&&
      (pending&&thread.canSubmit!==false||thread.offline&&!pending))} readOnly={readOnly||busy} pending={!!pending} offline={!!thread?.offline}
    draftWarning={draftWarning} hasContext={!!(context.text||attachedLocal.text||attachedSource)}
    canSend={!!session&&!recoveryOnly&&!busy&&!connectorLoading&&(!pending||!!followupApi)&&!thread?.outbox?.length&&thread?.canSubmit!==false&&preview?.kind!=='preview'}
    listenerSeenAt={thread?.listenerSeenAt} resumePrompt={delivery
      ? 'Continue my Lemma tutor session. Use get(what=tutor_turn, id='+delivery.reference+').'
      : 'Continue my Lemma tutor session. Use get(what=tutor_turn) to find my answer.'}
    pendingStatus={recoveryOnly?'Offline · Saved conversation':!live?'Demo: import a reply to continue':claimed?'Replying…':'Waiting for '+clientName}
    status={<>{queueSaving?<p role="status">Saving queued answer…</p>:ink.draft.queuedText!==undefined&&<p role="status">{tutorInkIssue(ink.draft.queuedText,ink)?'Queued answer needs its images.':
      pending?'Answer queued. It will send after the tutor replies.':thread?.offline?'Answer queued. It will send when you reconnect.':'Answer queued.'}
      <Button small disabled={readOnly||busy||!ink.ready} onClick={()=>{
        const queued=ink.snapshot().draft.queuedText;
        if(queued===undefined||!question.change(queued))return;
        void ink.update(current=>({...current,queuedText:undefined})).catch(()=>{});
      }}>Keep as draft</Button>
    </p>}{statusControls}{thread?.canSubmit===false&&!thread.offline&&!readOnly&&<p role="status">New tutor questions are currently paused.</p>}
      {live&&thread&&!thread.offline&&(readOnly||!thread.canSubmit)&&!pending&&
        <a href={chatLink(page.client,studyPrompt(page.project.project.title,page.detail.view.code,page.detail.view.title))}
          className="v7-button v7-secondary v7-small" rel="noopener noreferrer" target="_blank">Study in {clientName}</a>}
      {live&&thread?.canSubmit&&!recoveryOnly&&!connectorLoading&&!canConnect&&
        <p role="status">MCP delivery is unavailable. You can save a question and import a reply through Tutor connection.</p>}</>}
    context={<>{readOnly||thread?.offline?<p>Reconnect to add context.</p>:contextControls}</>}
    connection={<>
      {!live&&<p>This demo saves the conversation in this browser. You can import a reply to try the conversation.</p>}
      {!pending&&<p>{recoveryOnly?'Your saved conversation is available to read.':'Send an answer to open the next turn for your tutor.'}</p>}
      {live&&pending&&connectionStatus}
      {tutorLink&&delivery&&<Disclosure label="Reference">
        <label>Reference for this turn<input className="v7-field" value={delivery.reference} readOnly onFocus={e=>e.currentTarget.select()}/></label>
      </Disclosure>}
      {live&&pending?<Disclosure label="Manual handoff and recovery">{manualControls}</Disclosure>:manualControls}
    </>} transcript={transcript} onDeleteMessages={session?.api.deleteMessages?deleteMessages:undefined}/>
  return <>
    <p>{scope.title}{live?'':'. This demo stays in this browser. Nothing is sent to a tutor.'}</p>
    {statusControls}
    {recoveryOnly&&question.text&&<section aria-label="Saved question draft"><p>Unsent question draft</p>
      <textarea className="v7-field" aria-label="Saved question draft" readOnly value={question.text}/>
      {attachedLocal.text&&<p style={{whiteSpace:'pre-wrap'}}>{attachedLocal.text}</p>}
      {attachedSource&&<p style={{whiteSpace:'pre-wrap'}}>{attachedSource.excerpt}</p>}
    </section>}
    {session?.thread.canSubmit===false&&!session.thread.offline&&!pending&&<p>New tutor questions are unavailable.</p>}
    {live&&pending&&!draftNext&&!recoveryOnly&&<Button onClick={()=>setDraftNext(true)}>Draft next question</Button>}
    {session&&!recoveryOnly&&(!pending||(live&&draftNext))&&session.thread.canSubmit!==false&&<div className="v7-field-group">
      <label htmlFor={questionId}>Question</label>
      <textarea id={questionId} className="v7-field" rows={4} maxLength={2000} value={question.text}
        disabled={busy} onChange={e=>editQuestion(e.currentTarget.value)}/>
      {tutorInkIssue(question.text)&&<p role="alert">{inkIssueText.unavailable}
        <Button small disabled={busy} onClick={()=>question.change(removeTutorImageReferences(question.text))}>Remove image references</Button>
      </p>}
      {contextControls}
      <Button disabled={busy||!!pending||!!thread?.outbox?.length||preview?.kind==='preview'||!question.text.trim()||Boolean(tutorInkIssue(question.text))} onClick={()=>{void saveQuestion()}}>Save question</Button>
    </div>}
    {draftWarning&&<p role="alert">{draftWarning}</p>}
    {manualControls}
    {transcript}
  </>
}

function CardSuggestion({disabled,onPropose}:{disabled:boolean;onPropose:(front:string,back:string)=>Promise<boolean>}) {
  const [front,setFront]=useState(''),[back,setBack]=useState(''),[open,setOpen]=useState(false)
  // N227 (Owner: "just use an icon for making cards"): a flashcard from this reply, proposed for review like the tutor's
  // own, written in a sheet.
  return <>
    <IconButton label="Make a card" title="Make a card from this reply" disabled={disabled} onClick={()=>setOpen(true)}><SquarePlus aria-hidden="true"/></IconButton>
    <Sheet open={open} onClose={()=>setOpen(false)} title="Make a card">
      <div className="tutor-card-draft">
        <label>Front<textarea className="v7-field" rows={2} disabled={disabled} value={front} maxLength={1500} onChange={e=>setFront(e.target.value)}/></label>
        <label>Back<textarea className="v7-field" rows={3} disabled={disabled} value={back} maxLength={3000} onChange={e=>setBack(e.target.value)}/></label>
        <Button variant="primary" disabled={disabled||!front.trim()} onClick={()=>void onPropose(front,back).then(saved=>{if(saved){setFront('');setBack('');setOpen(false)}})}>Propose card</Button>
      </div>
    </Sheet>
  </>
}

function ReplyEditor({draftKey,live,busy,completed,readOnly=false,onConfirm}:{
  live:boolean;draftKey:string;busy:boolean;completed:boolean;readOnly?:boolean;onConfirm:(body:string,id:string)=>Promise<boolean>;
}) {
  const draft=useDraft(draftKey,live)
  const labelId=useId()
  const [preview,setPreview]=useState<{body:string;id:string}>()
  if ((completed||readOnly)&&!draft.text&&!preview) return null
  return <div className="v7-field-group">
    {(completed||readOnly)&&<p>{completed?'A reply is already saved.':'Reply imports are unavailable.'} You can still copy your unfinished paste.</p>}
    <label htmlFor={labelId}>Paste reply</label>
    <textarea id={labelId} className="v7-field" rows={5} maxLength={12000} value={draft.text}
      onChange={e=>draft.change(e.currentTarget.value)} readOnly={readOnly} disabled={busy||Boolean(preview)}/>
    {draft.unsaved&&<p role="alert">This draft may not survive a reload.</p>}
    {!preview&&!completed&&!readOnly&&<Button disabled={busy||!draft.text.trim()}
      onClick={()=>setPreview({body:draft.text,id:crypto.randomUUID()})}>Preview import</Button>}
    {preview&&<section aria-label="Import preview">
      <p>Imported by you</p>
      <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.body}</p>
      <Button disabled={busy} onClick={()=>setPreview(undefined)}>Cancel import</Button>
      <Button disabled={busy||completed||readOnly} onClick={()=>{
        void onConfirm(preview.body,preview.id).then(saved=>{
          if(saved){draft.clearIfUnchanged(preview.body);setPreview(undefined)}
        })
      }}>Confirm import</Button>
    </section>}
  </div>
}
