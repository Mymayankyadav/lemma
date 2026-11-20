import {authGeneration,authOwner} from '../authBoundary'
import {liveClient} from '../live/client'
import {supabaseUrl} from '../env'
import type {TutorContextSelection} from './turn-model'
import type {ManualTutor,TutorThreadView} from './manual-api'

type Scope={ownerId:string;generation:number;pathId:string;checkpointId:string}
type Command={operation:string;operationId:string;[key:string]:unknown}
type RpcResult={status:string;operationId:string;grantId?:string}

export function tutorScopeActive(scope:Pick<Scope,'ownerId'|'generation'>) {
 return authOwner()===scope.ownerId && authGeneration()===scope.generation
}

export function openLiveManualTutor(scope:Scope):ManualTutor {
 const client=liveClient()
 const scopeKey=JSON.stringify([scope.ownerId,scope.pathId,scope.checkpointId])
 const prefix='lemma.tutor.pending.v1:'+scopeKey+':',cacheKey='lemma.tutor.confirmed.v1:'+scopeKey
 let closed=false
 function active(){
  if(closed||!tutorScopeActive(scope))throw new Error('The account changed. Reopen the tutor.')
 }
 const target={p_owner:scope.ownerId,p_slug:scope.pathId,p_checkpoint:scope.checkpointId}
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
 function offlineState():TutorThreadView {
  const saved=cached()
  return {...saved,head:saved?.head??{threadId:null,lastSequence:0,pendingTurnId:null},
   turns:saved?.turns??[],recoveredDrafts:saved?.recoveredDrafts??[],canSubmit:saved?.canSubmit??false,canConnect:false,offline:true,outbox:outbox()}
 }
 async function dispatch(command:Command,persist=false):Promise<RpcResult>{
  active()
  if(persist){
   // One immutable entry per operation. Another tab cannot replace this request.
   const key=prefix+command.operationId, serialized=JSON.stringify(command)
   const remembered=localStorage.getItem(key)
   if(remembered===null && pending().length)throw new Error('Check the pending submission before sending another.')
   if(remembered!==null && remembered!==serialized)throw new Error('This pending operation changed.')
   localStorage.setItem(key,serialized)
  }
  const {data,error}=await client.rpc('tutor_owner_command',{...target,p_command:command})
  active()
  if(error){
   // Database rejection has no partial effect. Keep unknown transport outcomes retriable.
   if(persist&&['40001','22023','42501','23505','55000','P0001'].includes(error.code))localStorage.removeItem(prefix+command.operationId)
   throw new Error(error.code==='40001'?'The turn changed. Reopen it to review the latest version.':
    error.code==='55000'?'This tutor capability is unavailable. Your draft was kept.':'Could not confirm this tutor operation.')
  }
  const result=data as RpcResult
  if(!result||result.operationId!==command.operationId||typeof result.status!=='string')throw new Error('Unconfirmed tutor response.')
  if(persist)localStorage.removeItem(prefix+command.operationId)
  return result
 }
 function write(operation:string,turnId:string,version:number,patch:Record<string,unknown>={}):Command {
  return {operation,operationId:crypto.randomUUID(),turnId,expectedVersion:version,...patch}
 }
 return {
  close(){closed=true},
  async resume(before,reconcile=false){
   active()
   async function read(cursor?:number):Promise<TutorThreadView> {
    const response=await client.rpc('tutor_thread_state',{...target,p_before:cursor??null})
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
    if(before===undefined && error instanceof TypeError)return offlineState()
    throw error
   }
   if(before!==undefined)return thread
   const previous=cached()
   const reconciled:NonNullable<TutorThreadView['reconciled']>[number][]=[]
   if(reconcile){
    for(const operation of pending()){
     try {
      const {status}=await dispatch(operation,true)
      reconciled.push({operation:operation.operation,status,text:String(operation.question??operation.body??operation.front??''),
       turnId:typeof operation.turnId==='string'?operation.turnId:undefined,
       ...(typeof operation.localExcerpt==='string'?{localExcerpt:operation.localExcerpt}:{}),
       ...(operation.source?{source:operation.source as TutorContextSelection}:{})})
     } catch {active()}
    }
    if(reconciled.length)thread=await read()
   }
   // A foreground read can jump farther than one history page after a long absence.
   // Keep paging to the previous confirmed head, without losing the continuation cursor.
   const lastSeen=previous?.head.threadId===thread.head.threadId?previous?.head.lastSequence:undefined
   while(lastSeen!==undefined && thread.before && thread.before>lastSeen+1){
    const older=await read(thread.before)
    if(!older.turns.length || (older.before && older.before>=thread.before))break
    thread={...thread,turns:[...older.turns,...thread.turns],recoveredDrafts:[...older.recoveredDrafts,...thread.recoveredDrafts],before:older.before}
   }
   thread={...thread,confirmedAt:new Date().toISOString()}
   try {localStorage.setItem(cacheKey,JSON.stringify(thread))} catch {/* Outbox and drafts take priority over a cached read. */}
   return {...thread,outbox:outbox(),reconciled}
  },
  async submit(id,draft,sequence){
   const objective=draft.selectedContext.find(s=>s.kind==='checkpoint')?.excerpt
   const source=draft.selectedContext.find(s=>s.kind==='source')
   const {status}=await dispatch({operation:'start',operationId:id,expectedVersion:sequence,question:draft.question,
    ...(draft.localExcerpt?{localExcerpt:draft.localExcerpt.text}:{}),...(objective?{objective}:{}),...(source?{source}:{})},true)
   return {kind:status}
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
  async retry(operationId){
   const command=pending().find(c=>c.operationId===operationId)
   if(!command)return 'resolved'
   return (await dispatch(command,true)).status
  },
  async issueGrant(turnId,version){
   active()
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
   if((await dispatch(write('revoke',turnId,version,{grantId}))).status!=='revoke')throw new Error('Could not revoke this grant.')
  },
  async stopGrants(turnId,version){
   if((await dispatch(write('switch',turnId,version))).status!=='switch')throw new Error('Could not revoke this turn’s grants.')
  },
  async cancel(turnId,version){
   if((await dispatch(write('cancel',turnId,version))).status!=='cancel')throw new Error('Could not cancel this turn.')
  },
  async proposeCard(turnId,version,front,back){
   if((await dispatch(write('suggest_card',turnId,version,{front,back}),true)).status!=='proposed')throw new Error('Card proposal was not saved.')
  },
 }
}
