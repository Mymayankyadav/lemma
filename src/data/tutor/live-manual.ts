import {liveClient} from '../live/client'
import {supabaseUrl} from '../env'
import {tutorConnectorGrantHash} from '../../../supabase/functions/_shared/tutor-connector'
import {unresolvedTutorImageIds,type TutorAttachment} from './attachment-types'
import {tutorLocalScopeActive,writeTutorLocal} from './local-storage'
import type {TutorComposerDraft,TutorContextSelection} from './turn-model'
import {tutorMessageKey,withTutorMessageDeletions,type ConnectorDelivery,type ManualTutor,type QuestionnaireSave,type TutorFollowUp,type TutorThreadView} from './manual-api'
import type {TutorQuestionnaire} from '../../../supabase/functions/_shared/tutor-questionnaire'
import {readTutorAcceptedSpans,type TutorAcceptedSpan} from '../../../supabase/functions/_shared/tutor-answer'
import {readAnswerAid, type TutorAnswerAid} from '../../../supabase/functions/_shared/tutor-answer-aids'

type Scope={ownerId:string;generation:number;pathId:string;checkpointId:string;sittingId?:string;readOnly?:boolean}
type Command={operation:string;operationId:string;connectorOperationId?:string;attachments?:readonly TutorAttachment[];acceptedSpans?:readonly TutorAcceptedSpan[];[key:string]:unknown}
type RpcResult={status:string;operationId:string;grantId?:string;turnId?:string;version?:number;expiresAt?:string}
type ConnectorReceipt=Pick<ConnectorDelivery,'grantId'|'expiresAt'>
type ConnectorIntent={operationId:string;version:number;receipt?:ConnectorReceipt}|{stopped:true}
const connectorLocks=new Map<string,Promise<unknown>>()
class TutorRpcError extends Error {
 constructor(readonly code:string,message:string){super(message)}
}

function hasUnresolvedImages(command:Command):boolean {
 return command.operation==='start'&&typeof command.question==='string'&&unresolvedTutorImageIds(command.question,command.attachments).length>0
}

export function tutorScopeActive(scope:Pick<Scope,'ownerId'|'generation'>) {
 return tutorLocalScopeActive(scope)
}

export function openLiveManualTutor(scope:Scope):ManualTutor {
 const client=liveClient()
 const scopeKey=JSON.stringify([scope.ownerId,scope.pathId,scope.checkpointId])
 const prefix='lemma.tutor.pending.v1:'+scopeKey+':',cacheKey='lemma.tutor.confirmed.v1:'+scopeKey
 const connectorPrefix='lemma.tutor.connector.v1:'+scopeKey+':'
 const removedKey='lemma.tutor.draft:'+scopeKey+':removed-messages'
 const acknowledgedRemovals=new Set<string>()
 let closed=false
 let readSequence=0,confirmedRead=0
 function active(){
  if(closed||!tutorScopeActive(scope))throw new Error('The account changed. Reopen the tutor.')
 }
 function writable(){
  active()
  if(scope.readOnly)throw new Error('The tutor is read-only. Your draft was kept.')
 }
 async function withConnectorLock<T>(task:()=>Promise<T>):Promise<T>{
  const run=()=>{active();return task()}
  if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request(connectorPrefix,run)
  const before=connectorLocks.get(connectorPrefix)
  const next=before?before.then(run,run):run()
  connectorLocks.set(connectorPrefix,next)
  try{return await next}
  finally{if(connectorLocks.get(connectorPrefix)===next)connectorLocks.delete(connectorPrefix)}
 }
 const target={p_owner:scope.ownerId,p_slug:scope.pathId,p_checkpoint:scope.sittingId?null:scope.checkpointId,...(scope.sittingId?{p_sitting:scope.sittingId}:{})}
 const tutorRpcName=(name:string)=>scope.sittingId?'exam_'+name:name
 function pending(){
  active()
  const rows:Command[]=[]
  try {
   for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i)
    if(!key?.startsWith(prefix))continue
    try {
     const command:Command=JSON.parse(localStorage.getItem(key)??'null')
     if(command && key===prefix+command.operationId && ['start','manual','suggest_card'].includes(command.operation))rows.push(command)
    } catch {/* Leave an unreadable entry on disk without hiding confirmed history. */}
   }
  } catch {/* Reads remain available when the browser disables local storage. */}
  return rows
 }
 function outbox(){
  return pending().map(c=>({operation:c.operation,operationId:c.operationId,text:String(c.body??c.question??c.front??''),
   turnId:typeof c.turnId==='string'?c.turnId:undefined,localExcerpt:typeof c.localExcerpt==='string'?c.localExcerpt:undefined,source:c.source as TutorContextSelection|undefined}))
 }
 function cached():TutorThreadView|undefined {
  try {return JSON.parse(localStorage.getItem(cacheKey)??'null')??undefined} catch {return undefined}
 }
 function removedMessages(){
  let saved:unknown
  try {saved=JSON.parse(localStorage.getItem(removedKey)??'null')}catch{/* The server also filters confirmed removals. */}
  return new Set([...acknowledgedRemovals,...(Array.isArray(saved)?saved.filter((key):key is string=>typeof key==='string'):[])])
 }
 function offlineState():TutorThreadView {
  const saved=cached()
  return {...saved,head:saved?.head??{threadId:null,lastSequence:0,pendingTurnId:null},
   turns:saved?.turns??[],recoveredDrafts:saved?.recoveredDrafts??[],canSubmit:false,canConnect:false,offline:true,outbox:outbox()}
 }
 function usable(thread:TutorThreadView):TutorThreadView {
  const removed=removedMessages()
  const flags=scope.readOnly?{canSubmit:false,canConnect:false}:{}
  return {...thread,...flags,turns:withTutorMessageDeletions(thread.turns,removed)}
 }
 function readTime(value:string){
  const fraction=/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/.exec(value)?.[1]??''
  return Date.parse(value)*1000+Number(fraction.padEnd(6,'0').slice(3,6))
 }
 function regresses(thread:TutorThreadView,previous?:TutorThreadView){
  if(!previous)return false
  if(previous.readAt&&thread.readAt&&readTime(thread.readAt)<readTime(previous.readAt))return true
  if(previous.head.threadId!==thread.head.threadId)return Boolean(previous.head.threadId&&!thread.head.threadId)
  if(thread.head.lastSequence<previous.head.lastSequence)return true
  return thread.turns.some(turn=>previous.turns.some(old=>old.id===turn.id&&old.version>turn.version))
 }
 function savedConnector(turnId:string):ConnectorIntent|undefined {
  try {return JSON.parse(localStorage.getItem(connectorPrefix+turnId)??'null')??undefined}
  catch {return undefined}
 }
 function saveConnector(turnId:string,intent:ConnectorIntent){
  writeTutorLocal(scope,connectorPrefix+turnId,JSON.stringify(intent))
 }
 function stopDelivery(turnId:string){
  try {saveConnector(turnId,{stopped:true})}
  catch {active() /* A storage failure must still allow server-side revocation. */}
 }
 function finishPending(command:Command,result:RpcResult){
  if(command.operation==='start'&&command.connectorOperationId&&result.status==='submitted'){
   const {turnId,version}=result
   if(!turnId||typeof version!=='number')throw new Error('Could not confirm the saved tutor turn.')
   if(!savedConnector(turnId))saveConnector(turnId,{operationId:command.connectorOperationId,version})
  }
  localStorage.removeItem(prefix+command.operationId)
 }
 function rpcCommand(command:Command){
  const {connectorOperationId:_,attachments:__,acceptedSpans:___,...request}=command
  return request
 }
 async function dispatch(command:Command,persist=false):Promise<RpcResult>{
  writable()
  if(hasUnresolvedImages(command))throw new Error('An inserted image is unavailable. Your answer was kept.')
  if(persist){
   // One immutable entry per operation. Another tab cannot replace this request.
   const key=prefix+command.operationId, serialized=JSON.stringify(command)
   const remembered=localStorage.getItem(key)
   if(remembered===null && pending().length)throw new Error('Check the pending submission before sending another.')
   if(remembered!==null && remembered!==serialized)throw new Error('This pending operation changed.')
   writeTutorLocal(scope,key,serialized)
  }
  const {data,error}=!scope.sittingId&&command.acceptedSpans?.length
   ?await client.rpc('tutor_owner_assisted_start',{...target,p_command:rpcCommand(command),p_attachments:command.attachments??null,p_spans:command.acceptedSpans})
   :command.attachments
   ?await client.rpc(tutorRpcName('tutor_owner_ink_command'),{...target,p_command:rpcCommand(command),p_attachments:command.attachments})
   :await client.rpc(tutorRpcName('tutor_owner_command'),{...target,p_command:rpcCommand(command)})
  active()
  if(error){
   // Database rejection has no partial effect. Keep unknown transport outcomes retriable.
   if(persist&&['40001','22023','42501','23505','55000','P0001'].includes(error.code))localStorage.removeItem(prefix+command.operationId)
   throw new TutorRpcError(error.code,error.code==='40001'?'The turn changed. Reopen it to review the latest version.':
    error.code==='55000'?'This tutor capability is unavailable. Your draft was kept.':'Could not confirm this tutor operation.')
  }
  const result=data as RpcResult
  if(!result||result.operationId!==command.operationId||typeof result.status!=='string')throw new Error('Unconfirmed tutor response.')
  if(persist)finishPending(command,result)
  return result
 }
 async function recover(command:Command):Promise<RpcResult>{
  active()
  // This endpoint only reads committed receipts. It cannot submit an unseen operation.
  const {data,error}=await client.rpc(tutorRpcName('tutor_owner_receipt'),{...target,p_command:rpcCommand(command)})
  active()
  if(error)throw new TutorRpcError(error.code,'Could not check the saved tutor receipt. Your submission was kept.')
  const result=data as RpcResult
  if(!result||result.operationId!==command.operationId||typeof result.status!=='string')throw new Error('Unconfirmed tutor response.')
  if(['submitted','completed','already-completed','proposed','turn-pending'].includes(result.status))finishPending(command,result)
  return result
 }
 function resolvePending(command:Command):Promise<RpcResult>{
  // Older clients could save an unresolved reference. Check its receipt without replaying it.
  return scope.readOnly||hasUnresolvedImages(command)?recover(command):dispatch(command,true)
 }
 function write(operation:string,turnId:string,version:number,patch:Record<string,unknown>={}):Command {
  return {operation,operationId:crypto.randomUUID(),turnId,expectedVersion:version,...patch}
 }
 function start(id:string,draft:TutorComposerDraft,sequence:number):Command {
  const objective=draft.selectedContext.find(selection=>selection.kind==='checkpoint')?.excerpt
  const source=draft.selectedContext.find(selection=>selection.kind==='source')
  const acceptedSpans=readTutorAcceptedSpans(draft.question,draft.acceptedSpans)
  return {operation:'start',operationId:id,expectedVersion:sequence,question:draft.question,
   ...(!scope.sittingId&&acceptedSpans.length?{acceptedSpans}:{}),
   ...(draft.answerMeta?{answerMeta:draft.answerMeta}:{}),
   ...(draft.attachments?.length?{attachments:draft.attachments}:{}),
   ...(draft.localExcerpt?{localExcerpt:draft.localExcerpt.text}:{}),...(objective?{objective}:{}),...(source?{source}:{})}
 }
 async function confirmDelivery(turnId:string,{grantId,expiresAt}:ConnectorReceipt,operationId:string):Promise<ConnectorDelivery|undefined>{
  const grant=await client.rpc('tutor_owner_grant_active',{p_turn_id:turnId,p_grant_id:grantId,p_grant_operation_id:operationId})
  active()
  if(grant.error||typeof grant.data!=='boolean')throw new Error('Could not check the connector grant.')
  return grant.data?{turnId,grantId,expiresAt,reference:turnId+'.'+operationId}:undefined
 }
 async function deliver(turnId:string,intent:Exclude<ConnectorIntent,{stopped:true}>,connectorUrl:string):Promise<ConnectorDelivery|undefined>{
  writable()
  const {operationId,version}=intent
  if(intent.receipt)return confirmDelivery(turnId,intent.receipt,operationId)
  let tokenHash:string
  try {tokenHash=await tutorConnectorGrantHash(connectorUrl,turnId,operationId)}
  catch {active();throw new Error('Could not prepare the configured Lemma connector.')}
  const command={operation:'grant',operationId,turnId,expectedVersion:version,tokenHash}
  try {
   // An unconfirmed grant replays the same command, including the verifier
   // derived again from Settings.
   const result=await dispatch(command)
   const {status,grantId,expiresAt}=result
   if(status==='conflict'){
    stopDelivery(turnId)
    return undefined
   }
   if(status!=='granted'||result.turnId!==turnId||!grantId||!expiresAt)throw new Error('The connector grant was not confirmed.')
   const receipt={grantId,expiresAt}
   saveConnector(turnId,{...intent,receipt})
   return await confirmDelivery(turnId,receipt,operationId)
  }catch(error){
   active()
   if(error instanceof TutorRpcError&&['40001','22023','23505','42501'].includes(error.code))saveConnector(turnId,{stopped:true})
   throw error
  }
 }
 async function continueDelivery(turnId:string|null,connectorUrl?:string):Promise<ConnectorDelivery|undefined>{
  if(!turnId||!connectorUrl||scope.readOnly)return undefined
  try {
   const intent=savedConnector(turnId)
   return intent&&!('stopped' in intent)?await deliver(turnId,intent,connectorUrl):undefined
  }catch {active();return undefined}
 }
 return {
  close(){closed=true},
  async resume(before,reconcile=false,connectorUrl){
   active()
   const request=++readSequence
   async function read(cursor?:number):Promise<TutorThreadView> {
    const response=await client.rpc(tutorRpcName('tutor_thread_state'),{...target,p_before:cursor??null})
    active()
    if(response.error){
     if(!response.status || response.status>=500)throw new TypeError('Tutor is offline.')
     throw new Error('Could not open the saved tutor thread.')
    }
    return response.data as TutorThreadView
   }
   let thread:TutorThreadView
   try {thread=await read(before)}
   catch (error){
    active()
    if(before===undefined && error instanceof TypeError)return usable(offlineState())
    throw error
   }
   if(before!==undefined)return usable(thread)
   const previous=cached()
   const reconciled:NonNullable<TutorThreadView['reconciled']>[number][]=[]
   let connectorDelivery:ConnectorDelivery|undefined
   if(reconcile)await withConnectorLock(async()=>{
    for(const operation of pending()){
     try {
      const {status,turnId}=await resolvePending(operation)
      if(status==='unconfirmed')continue
      reconciled.push({operation:operation.operation,status,text:String(operation.question??operation.body??operation.front??''),
       turnId:operation.connectorOperationId?turnId:typeof operation.turnId==='string'?operation.turnId:undefined,
       ...(typeof operation.localExcerpt==='string'?{localExcerpt:operation.localExcerpt}:{}),
       ...(operation.source?{source:operation.source as TutorContextSelection}:{})})
     } catch {active()}
    }
    if(reconciled.length)thread=await read()
    if(thread.canConnect)connectorDelivery=await continueDelivery(thread.head.pendingTurnId,connectorUrl)
   })
   // A foreground read can jump farther than one history page after a long absence.
   // Keep paging to the previous confirmed head, without losing the continuation cursor.
   const lastSeen=previous?.head.threadId===thread.head.threadId?previous?.head.lastSequence:undefined
   while(lastSeen!==undefined && thread.before && thread.before>lastSeen+1){
    const older=await read(thread.before)
    if(!older.turns.length || (older.before && older.before>=thread.before))break
    thread={...thread,turns:[...older.turns,...thread.turns],recoveredDrafts:[...older.recoveredDrafts,...thread.recoveredDrafts],before:older.before}
   }
   thread={...thread,confirmedAt:new Date().toISOString()}
   // Compare authoritative versions inside a cross-tab lock where available.
   // Response arrival order alone cannot determine which snapshot is newest.
   const remember=()=>{
    active()
    if(request>confirmedRead&&!regresses(thread,cached())){
     confirmedRead=request
     try {writeTutorLocal(scope,cacheKey,JSON.stringify(thread))} catch {active() /* Outbox and drafts take priority over a cached read. */}
    }
   }
   if(typeof navigator!=='undefined'&&navigator.locks)await navigator.locks.request(cacheKey,remember)
   else remember()
   return {...usable(thread),outbox:outbox(),reconciled,...(connectorDelivery?{connectorDelivery}:{})}
  },
  async submit(id,draft,sequence){
   const {status}=await dispatch(start(id,draft,sequence),true)
   return {kind:status}
  },
  async submitToConnector(id,draft,sequence,connectorUrl){
   return withConnectorLock(async()=>{
    const connectorOperationId=pending().find(command=>command.operationId===id)?.connectorOperationId??crypto.randomUUID()
    const saved=await dispatch({...start(id,draft,sequence),connectorOperationId},true)
    if(saved.status==='turn-pending')return {kind:'turn-pending'}
    if(saved.status!=='submitted'||!saved.turnId)throw new Error('Could not confirm the saved tutor turn.')
    const delivery=await continueDelivery(saved.turnId,connectorUrl)
    return {kind:'submitted',turnId:saved.turnId,...(delivery?{delivery}:{})}
   })
  },
  async connectTurn(turnId,version,connectorUrl){
   return withConnectorLock(async()=>{
    writable()
    const saved=savedConnector(turnId)
    if(saved&&!('stopped' in saved)){
     try {
      const delivery=await deliver(turnId,saved,connectorUrl)
      if(delivery)return delivery
     }catch(error){
      if(!(error instanceof TutorRpcError&&(error.code==='23505'||(error.code==='40001'&&saved.version!==version))))throw error
     }
    }
    const intent={operationId:crypto.randomUUID(),version}
    saveConnector(turnId,intent)
    const delivery=await deliver(turnId,intent,connectorUrl)
    if(!delivery)throw new Error('The connector grant is no longer active. Reopen the turn to try again.')
    return delivery
   })
  },
  async confirmImport(turnId,version,messageId,body){
   const {status}=await dispatch({operation:'manual',operationId:messageId,turnId,messageId,expectedVersion:version,body},true)
   return {kind:status}
  },
  async previewSource(page){
   active()
   const {data,error}=await client.rpc('tutor_source_preview',{...target,p_page:page})
   active()
   if(error)throw new Error('Could not open that page of the linked source.')
   return data as TutorContextSelection
  },
  async retry(operationId){return withConnectorLock(async()=>{
   const command=pending().find(c=>c.operationId===operationId)
   if(!command)return 'resolved'
   return (await resolvePending(command)).status
  })},
  async issueGrant(turnId,version){
   writable()
   const bytes=crypto.getRandomValues(new Uint8Array(32))
   const hex=(input:Uint8Array)=>Array.from(input,b=>b.toString(16).padStart(2,'0')).join('')
   const token=hex(bytes)
   const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))
   const cmd=write('grant',turnId,version,{tokenHash:hex(digest)})
   const {status,grantId}=await dispatch(cmd)
   if(status!=='granted'||!grantId)throw new Error('The connector grant was not issued.')
   return {token,endpoint:supabaseUrl+'/functions/v1/mcp/tutor',grantId}
  },
  async revokeGrant(turnId,version,grantId){
   await withConnectorLock(async()=>{
    writable()
    const intent=savedConnector(turnId)
    if(intent&&!('stopped' in intent)&&intent.receipt?.grantId===grantId)stopDelivery(turnId)
    if((await dispatch(write('revoke',turnId,version,{grantId}))).status!=='revoke')throw new Error('Could not revoke this grant.')
   })
  },
  async stopGrants(turnId,version){
   await withConnectorLock(async()=>{
    writable()
    stopDelivery(turnId)
    if((await dispatch(write('switch',turnId,version))).status!=='switch')throw new Error('Could not revoke this turn’s grants.')
   })
  },
  async cancel(turnId,version){
   await withConnectorLock(async()=>{
    writable()
    stopDelivery(turnId)
    if((await dispatch(write('cancel',turnId,version))).status!=='cancel')throw new Error('Could not cancel this turn.')
   })
  },
  async proposeCard(turnId,version,front,back){
   if((await dispatch(write('suggest_card',turnId,version,{front,back}),true)).status!=='proposed')throw new Error('Card proposal was not saved.')
  },
  async deleteMessages(messages){
   writable()
   const {data,error}=await client.rpc(tutorRpcName('tutor_delete_messages'),{...target,p_messages:messages})
   active()
   if(error||data!==true)throw new Error('Could not confirm the message deletion. Try again.')
   for(const message of messages)acknowledgedRemovals.add(tutorMessageKey(message))
   try {writeTutorLocal(scope,removedKey,JSON.stringify([...removedMessages()]))}catch{active()}
  },
  followups:{
   async list(){
    active()
    const {data,error}=await client.rpc(tutorRpcName('tutor_followup_state'),target)
    active()
    if(error)throw new Error('Could not open your extra messages.')
    const removed=removedMessages()
    return Array.isArray(data)?(data as TutorFollowUp[]).filter(message=>!removed.has(tutorMessageKey({kind:'followup',id:message.id}))):[]
   },
   async add(turnId,messageId,body){
    writable()
    const {data,error}=await client.rpc(tutorRpcName('tutor_followup_add'),{...target,p_turn:turnId,p_message:messageId,p_body:body})
    active()
    if(error)throw new TutorRpcError(String(error.code??''),error.code==='40001'
     ?'The tutor has just replied. Send this as your next answer.'
     :error.code==='22023'?'Wait for the tutor to reply before posting more.':'Could not confirm your message. It is still in the box.')
    return (data as {followup:TutorFollowUp}).followup
   },
  },
  /** N234: the tutor's answer aids on this thread, oldest turn first. */
  answerAids:scope.sittingId?undefined:{
   async list(){
    active()
    const {data,error}=await client.rpc('tutor_answer_aid_state',target)
    active()
    if(error)throw new Error('Could not open the tutor\'s answer aids.')
    return Array.isArray(data)?data.map(readAnswerAid).filter((aid):aid is TutorAnswerAid=>aid!==undefined):[]
   },
  },
  questionnaires:{
   async list(){
    active()
    const {data,error}=await client.rpc(tutorRpcName('tutor_questionnaire_state'),target)
    active()
    if(error)throw new Error('Could not open the tutor\'s questionnaires.')
    return Array.isArray(data)?data as TutorQuestionnaire[]:[]
   },
   async save(id,expectedVersion,answers,submit){
    writable()
    const {data,error}=await client.rpc('tutor_questionnaire_save',{p_owner:scope.ownerId,p_questionnaire:id,
     p_expected_version:expectedVersion,p_answers:answers,p_submit:submit})
    active()
    if(error)throw new TutorRpcError(String(error.code??''),error.code==='22023'?'Answer every question before submitting.':'Your answers were not saved yet.')
    return data as QuestionnaireSave
   },
  },
 }
}
