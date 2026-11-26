import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {authGeneration,publishAuth} from '../../../src/data/authBoundary'
import {openLiveManualTutor} from '../../../src/data/tutor/live-manual'
import type {TutorThreadView} from '../../../src/data/tutor/manual-api'
import {imageReference} from '../../../supabase/functions/_shared/tutor-answer'

const rpc=vi.hoisted(()=>vi.fn())
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({rpc})}))
const open=(ownerId='owner',checkpointId='cp',readOnly=false)=>openLiveManualTutor({ownerId,checkpointId,pathId:'path',generation:authGeneration(),readOnly})
const thread=(head:number,first=head,before:number|null=null):TutorThreadView=>({
 head:{threadId:'thread',lastSequence:head,pendingTurnId:null},canSubmit:true,canConnect:false,before,recoveredDrafts:[],
 turns:Array.from({length:Math.max(0,head-first+1)},(_,i)=>({id:'t'+(first+i),threadId:'thread',sequence:first+i,version:2,status:'cancelled',
  snapshot:{question:'Question '+(first+i),selectedContext:[]}})),
})
const ok=(data:unknown)=>({data,error:null,status:200})
const noNetwork={data:null,error:{code:'',message:'Failed to fetch'},status:0}
beforeEach(()=>{localStorage.clear();publishAuth(null);publishAuth({id:'owner'});rpc.mockReset()})
afterEach(()=>vi.unstubAllGlobals())

describe('live tutor persistence',()=>{
 it('opens the last confirmed conversation immediately with writes disabled and fences account changes',async()=>{
  rpc.mockResolvedValue(ok(thread(2)))
  await open().resume()
  const next=open()
  rpc.mockClear()
  expect(next.readSaved?.()).toMatchObject({head:{lastSequence:2},canSubmit:false,canConnect:false})
  expect(open('owner','other-checkpoint').readSaved?.()).toBeUndefined()
  expect(rpc).not.toHaveBeenCalled()
  publishAuth({id:'other-owner'})
  expect(()=>next.readSaved?.()).toThrow(/account changed/i)
 })
 it('rejects every unbound answer reference before either submit API writes an outbox entry or an RPC',async()=>{
  const first='12345678-0123-4123-8123-123456789abc',second='87654321-0123-4123-8123-123456789abc'
  const attachment={id:first,kind:'drawing' as const,mimeType:'image/png' as const}
  const draft={question:'Before '+imageReference(first)+imageReference(second)+' after',selectedContext:[],attachments:[attachment]}
  const api=open()
  await expect(api.submit('unbound',draft,0)).rejects.toThrow('image is unavailable')
  await expect(api.submitToConnector!('connector',draft,0,'https://example.invalid')).rejects.toThrow('image is unavailable')
  expect(rpc).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(0)
  rpc.mockResolvedValue(ok({operationId:'bound',status:'submitted'}))
  const attachments=[attachment,{...attachment,id:second}]
  await expect(api.submit('bound',{...draft,attachments},0)).resolves.toEqual({kind:'submitted'})
  expect(rpc).toHaveBeenCalledWith('tutor_owner_ink_command',expect.objectContaining({p_attachments:attachments}))
 })
 it('checks an old unbound outbox entry by receipt without resubmitting it on reconnect or retry',async()=>{
  const key='lemma.tutor.pending.v1:'+JSON.stringify(['owner','path','cp'])+':unbound'
  const question='My answer '+imageReference('12345678-0123-4123-8123-123456789abc')
  const command=JSON.stringify({operation:'start',operationId:'unbound',expectedVersion:1,question})
  localStorage.setItem(key,command)
  rpc.mockImplementation(async name=>ok(name==='tutor_thread_state'?thread(1):{operationId:'unbound',status:'unconfirmed'}))
  const api=open()
  const recovered=await api.resume(undefined,true)
  expect(recovered.outbox).toMatchObject([{operationId:'unbound',text:question}])
  await expect(api.retry!('unbound')).resolves.toBe('unconfirmed')
  expect(rpc.mock.calls.map(([name])=>name)).toEqual(['tutor_thread_state','tutor_owner_receipt','tutor_owner_receipt'])
  expect(localStorage.getItem(key)).toBe(command)
 })
 it('reopens a lost submission, replays its exact operation and keeps additional typing separate',async()=>{
  const draft={question:'One question',selectedContext:[]}
  const api=open()
  let state=thread(1),writes=0
  rpc.mockImplementation(async(name,args)=>{
   if(name==='tutor_thread_state')return ok(state)
   ++writes;state=thread(2)
   return writes===1?noNetwork:ok({operationId:args.p_command.operationId,status:'submitted'})
  })
  await api.resume()
  await expect(api.submit('same-id',draft,1)).rejects.toThrow('confirm')
  await expect(api.submit('new-id',{...draft,question:'A later draft'},1)).rejects.toThrow('pending submission')
  api.close()
  const reopened=open()
  const recovered=await reopened.resume(undefined,true)
  expect(recovered.head.lastSequence).toBe(2)
  expect(recovered.outbox).toEqual([])
  expect(recovered.reconciled).toEqual([{operation:'start',status:'submitted',text:draft.question,turnId:undefined}])
  const calls=rpc.mock.calls.filter(call=>call[0]==='tutor_owner_command')
  expect(calls).toHaveLength(2);expect(calls[0][1]).toEqual(calls[1][1])
 })
 it('uses only this owner and checkpoint’s last confirmed conversation offline',async()=>{
  rpc.mockResolvedValueOnce(ok(thread(3))).mockResolvedValue(noNetwork)
  await open().resume()
  expect(await open().resume()).toMatchObject({offline:true,head:{lastSequence:3},canConnect:false})
  expect(await open('owner','cp-2').resume()).toMatchObject({offline:true,turns:[],canSubmit:false})
  publishAuth({id:'other'})
  expect(await open('other').resume()).toMatchObject({offline:true,turns:[]})
 })
 it('never accepts a late response from a previous local account generation',async()=>{
  let resolve!:(value:unknown)=>void
  rpc.mockReturnValue(new Promise(done=>{resolve=done}))
  const api=open(),read=api.resume()
  publishAuth(null);publishAuth({id:'owner'})
  resolve(ok(thread(8)))
  await expect(read).rejects.toThrow('account changed')
  await expect(api.retry!('missing')).rejects.toThrow('account changed')
  expect(localStorage.length).toBe(0)
 })
 it('keeps the newest confirmed conversation offline when foreground reads finish out of order',async()=>{
  let older!:(value:unknown)=>void,newer!:(value:unknown)=>void
  rpc.mockImplementationOnce(()=>new Promise(resolve=>{older=resolve}))
   .mockImplementationOnce(()=>new Promise(resolve=>{newer=resolve}))
   .mockResolvedValue(noNetwork)
  const api=open(),first=api.resume(),second=api.resume()
  newer(ok(thread(2)))
  expect((await second).head.lastSequence).toBe(2)
  older(ok(thread(1)))
  await first
  expect(await api.resume()).toMatchObject({offline:true,head:{lastSequence:2}})
 })
 it.each(['sequence','version','readAt'] as const)('does not regress the shared cache across adapters by %s',async(kind)=>{
  let older!:(value:unknown)=>void,newer!:(value:unknown)=>void
  rpc.mockImplementationOnce(()=>new Promise(resolve=>{older=resolve}))
   .mockImplementationOnce(()=>new Promise(resolve=>{newer=resolve})).mockResolvedValue(noNetwork)
  const old=thread(1),latest=thread(kind==='sequence'?2:1)
  if(kind==='version')old.turns=[{...old.turns[0],version:1}]
  if(kind==='readAt'){
   old.readAt='2026-11-20T10:00:00.000001Z';latest.readAt='2026-11-20T10:00:00.000002Z'
  }
  const first=open().resume(),second=open().resume()
  newer(ok(latest));await second
  older(ok(old));await first
  expect(await open().resume()).toMatchObject({offline:true,head:latest.head,turns:latest.turns,
   ...(latest.readAt?{readAt:latest.readAt}:{})})
 })
 it('checks only committed receipts in read-only mode and retains every unconfirmed operation',async()=>{
  const command={operation:'start',operationId:'saved-id',expectedVersion:0,question:'Keep this question'}
  const key='lemma.tutor.pending.v1:'+JSON.stringify(['owner','path','cp'])+':saved-id'
  localStorage.setItem(key,JSON.stringify(command))
  let confirmed=false
  rpc.mockImplementation(async(name,args)=>{
   if(name==='tutor_thread_state')return ok(thread(1))
   expect(name).toBe('tutor_owner_receipt');expect(args.p_command).toEqual(command)
   return ok({operationId:'saved-id',status:confirmed?'submitted':'unconfirmed'})
  })
  const api=open('owner','cp',true)
  expect(await api.resume(undefined,true)).toMatchObject({canSubmit:false,canConnect:false,outbox:[{operationId:'saved-id'}],reconciled:[]})
  expect(await api.retry!('saved-id')).toBe('unconfirmed')
  expect(localStorage.getItem(key)).toBe(JSON.stringify(command))
  const writes=[()=>api.submit('new',{question:'New question',selectedContext:[]},1),
   ()=>api.confirmImport('t1',2,'reply','A reply'),()=>api.issueGrant!('t1',2),
   ()=>api.cancel!('t1',2),()=>api.proposeCard!('t1',2,'Front','Back')]
  for(const write of writes)await expect(write()).rejects.toThrow('read-only')
  expect(rpc.mock.calls.some(call=>call[0]==='tutor_owner_command')).toBe(false)
  confirmed=true
  expect(await api.resume(undefined,true)).toMatchObject({outbox:[],reconciled:[{operation:'start',status:'submitted',text:command.question}]})
  expect(localStorage.getItem(key)).toBeNull()
 })
 it('retains a pending receipt when its read-only check is rejected or unavailable',async()=>{
  const command={operation:'manual',operationId:'pending',turnId:'t1',body:'My retained paste'}
  const key='lemma.tutor.pending.v1:'+JSON.stringify(['owner','path','cp'])+':pending'
  localStorage.setItem(key,JSON.stringify(command))
  rpc.mockImplementation(async name=>name==='tutor_thread_state'?ok(thread(1)):
   {data:null,error:{code:'42501'},status:403})
  expect(await open('owner','cp',true).resume(undefined,true)).toMatchObject({outbox:[{text:command.body}],reconciled:[]})
  expect(localStorage.getItem(key)).toBe(JSON.stringify(command))
 })
 it('fills a multi-page sequence gap through the previous confirmed head',async()=>{
  rpc.mockResolvedValueOnce(ok(thread(1))).mockResolvedValueOnce(ok(thread(121,82,82)))
   .mockResolvedValueOnce(ok(thread(81,42,42))).mockResolvedValueOnce(ok(thread(41,2,2)))
  const api=open()
  await api.resume()
  const updated=await api.resume(undefined,true)
  expect(updated.turns.map(t=>t.sequence)).toEqual(Array.from({length:120},(_,i)=>i+2))
  expect(updated.head.lastSequence).toBe(121);expect(updated.before).toBe(2)
  expect(rpc.mock.calls.map(c=>c[1].p_before)).toEqual([null,null,82,42])
 })
})

describe('ordinary connector delivery',()=>{
 const turnId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
 const answerId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
 const secret='abc123'.repeat(8)
 const connectorUrl='https://lemma.example/functions/v1/mcp/'+secret
 const draft={question:'My partial proof',selectedContext:[]}
 const pending:TutorThreadView={
  head:{threadId:'thread',lastSequence:1,pendingTurnId:turnId},canSubmit:true,canConnect:true,recoveredDrafts:[],
  turns:[{id:turnId,threadId:'thread',sequence:1,version:1,status:'awaiting-tutor',snapshot:draft}],
 }
 const grantId='cccccccc-cccc-4ccc-cccc-cccccccccccc'
 const expiresAt='2099-01-01T00:00:00.000Z'
 function server({lostStart=false,lostGrant=false}={}){
  let state=thread(0),grantActive=true
  const issued=new Map<string,string>()
  const grants:Record<string,unknown>[]=[]
  rpc.mockImplementation(async(name,args)=>{
   if(name==='tutor_thread_state')return ok(state)
   if(name==='tutor_owner_grant_active'){
    expect(args).toEqual({p_turn_id:turnId,p_grant_id:grantId,p_grant_operation_id:grants.at(-1)?.operationId})
    return ok(grantActive)
   }
   const command=args.p_command
   expect(command).not.toHaveProperty('connectorOperationId')
   if(command.operation==='start'){
    state=pending
    if(lostStart){lostStart=false;return noNetwork}
    return ok({status:'submitted',operationId:command.operationId,turnId,version:1})
   }
   if(command.operation==='grant'){
    grants.push(command)
    if(issued.has(command.operationId)&&issued.get(command.operationId)!==command.tokenHash)
     return ok({status:'conflict',operationId:command.operationId})
    if(!issued.has(command.operationId)){
     issued.set(command.operationId,command.tokenHash)
     grantActive=true
    }
    if(lostGrant){lostGrant=false;return noNetwork}
    return ok({status:'granted',operationId:command.operationId,turnId,grantId,expiresAt})
   }
   if(command.operation==='switch')grantActive=false
   return ok({status:command.operation,operationId:command.operationId})
  })
  return {grants,revoke(){grantActive=false}}
 }
 beforeEach(()=>vi.stubGlobal('crypto',webcrypto))

 it('reopens a lost start and grant with the original commands and no local verifier',async()=>{
  const {grants}=server({lostStart:true,lostGrant:true})
  const initial=open()
  await expect(initial.submitToConnector!(answerId,draft,0,connectorUrl)).rejects.toThrow('confirm')
  initial.close()
  const reopened=open()
  const recovered=await reopened.resume(undefined,true,connectorUrl)
  expect(recovered).toMatchObject({outbox:[],reconciled:[{operation:'start',status:'submitted',turnId}]})
  expect(recovered.connectorDelivery).toBeUndefined()
  reopened.close()
  const resumed=await open().resume(undefined,true,connectorUrl)
  expect(resumed.connectorDelivery).toEqual({turnId,grantId,expiresAt,reference:turnId+'.'+grants[0].operationId})
  expect(grants).toEqual([grants[0],grants[0]])
  const starts=rpc.mock.calls.filter(([,args])=>args.p_command?.operation==='start')
  expect(starts).toHaveLength(2)
  expect(starts[0]).toEqual(starts[1])
  const stored=Object.entries(localStorage).flat().join(' ')
  expect(stored).not.toContain(secret)
  expect(stored).not.toContain(String(grants[0].tokenHash))
  expect(stored).not.toContain('tokenHash')
 })

 it('uses one grant receipt across concurrent sends and stops offering remotely revoked handoffs',async()=>{
  const {grants,revoke}=server()
  const [first,second]=await Promise.all([open().submitToConnector!(answerId,draft,0,connectorUrl),open().submitToConnector!(answerId,draft,0,connectorUrl)])
  expect(first).toEqual(second)
  expect(rpc.mock.calls.filter(([name,args])=>name==='tutor_owner_command'&&args.p_command.operation==='grant')).toHaveLength(1)
  revoke()
  expect((await open().resume(undefined,true,connectorUrl)).connectorDelivery).toBeUndefined()
  expect(grants).toHaveLength(1)
  const replacement=await open().connectTurn!(turnId,1,connectorUrl)
  expect(replacement.reference).not.toEqual(turnId+'.'+grants[0].operationId)
  expect(grants.at(-1)?.tokenHash).not.toEqual(grants[0].tokenHash)
 })

 it('requires explicit reauthorization when recovering an unconfirmed grant after rotation',async()=>{
  const {grants}=server({lostGrant:true})
  const initial=open()
  await initial.submitToConnector!(answerId,draft,0,connectorUrl)
  const rotated=connectorUrl.replace(secret,'def456'.repeat(8))
  const reopened=open()
  expect((await reopened.resume(undefined,true,rotated)).connectorDelivery).toBeUndefined()
  expect(grants).toHaveLength(2)
  expect(grants[1].operationId).toBe(grants[0].operationId)
  const replacement=await reopened.connectTurn!(turnId,1,rotated)
  expect(replacement.reference).not.toEqual(turnId+'.'+grants[0].operationId)
 })

 it('stops an unconfirmed grant before switching, with no replay on the next foreground read',async()=>{
  const {grants}=server({lostGrant:true})
  const api=open()
  await expect(api.submitToConnector!(answerId,draft,0,connectorUrl)).resolves.toEqual({kind:'submitted',turnId})
  await api.stopGrants!(turnId,1)
  expect((await open().resume(undefined,true,connectorUrl)).connectorDelivery).toBeUndefined()
  expect(grants).toHaveLength(1)
 })

 it('drops the grant acknowledgement when the owner changes while it is in flight',async()=>{
  let resolveGrant!:(response:unknown)=>void
  let beginGrant!:(operationId:string)=>void
  const grantStarted=new Promise<string>(resolve=>{beginGrant=resolve})
  rpc.mockImplementation(async(name,args)=>{
   expect(name).toBe('tutor_owner_command')
   const {operation,operationId}=args.p_command
   if(operation==='start')return ok({status:'submitted',operationId,turnId,version:1})
   return new Promise(resolve=>{resolveGrant=resolve;beginGrant(operationId)})
  })
  const send=open().submitToConnector!(answerId,draft,0,connectorUrl)
  const operationId=await grantStarted
  publishAuth({id:'other'})
  resolveGrant(ok({status:'granted',operationId,turnId,grantId,expiresAt}))
  await expect(send).rejects.toThrow('account changed')
  expect(rpc).toHaveBeenCalledTimes(2)
  expect(Object.entries(localStorage).flat().join(' ')).not.toContain(grantId)
 })
})
