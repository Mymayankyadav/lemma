import {beforeEach,describe,expect,it,vi} from 'vitest'
import {authGeneration,publishAuth} from '../../../src/data/authBoundary'
import {openLiveManualTutor} from '../../../src/data/tutor/live-manual'
import type {TutorThreadView} from '../../../src/data/tutor/manual-api'

const rpc=vi.hoisted(()=>vi.fn())
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({rpc})}))
const open=(ownerId='owner',checkpointId='cp')=>openLiveManualTutor({ownerId,checkpointId,pathId:'path',generation:authGeneration()})
const thread=(head:number,first=head,before:number|null=null):TutorThreadView=>({
 head:{threadId:'thread',lastSequence:head,pendingTurnId:null},canSubmit:true,canConnect:false,before,recoveredDrafts:[],
 turns:Array.from({length:Math.max(0,head-first+1)},(_,i)=>({id:'t'+(first+i),threadId:'thread',sequence:first+i,version:2,status:'cancelled',
  snapshot:{question:'Question '+(first+i),selectedContext:[]}})),
})
const ok=(data:unknown)=>({data,error:null,status:200})
const noNetwork={data:null,error:{code:'',message:'Failed to fetch'},status:0}
beforeEach(()=>{localStorage.clear();publishAuth(null);publishAuth({id:'owner'});rpc.mockReset()})

describe('live tutor persistence',()=>{
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
