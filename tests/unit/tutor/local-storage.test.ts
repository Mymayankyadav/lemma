import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {authGeneration,publishAuth} from '../../../src/data/authBoundary'
import {openLiveManualTutor} from '../../../src/data/tutor/live-manual'
import {removeDeletedOwnerTutorData,tutorLocalScopeActive,tutorOwnerDeleted,tutorStorageOwner,writeTutorLocal} from '../../../src/data/tutor/local-storage'
import type {TutorThreadView} from '../../../src/data/tutor/manual-api'

const mocks=vi.hoisted(()=>({mode:'live',rpc:vi.fn()}))
vi.mock('../../../src/data/mode',()=>({getMode:()=>mocks.mode}))
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({rpc:mocks.rpc})}))
let owner:string,sequence=0
const tuple=(id=owner,path='path',checkpoint='cp')=>JSON.stringify([id,path,checkpoint])
const keys=(id=owner)=>[
 'lemma.tutor.confirmed.v1:'+tuple(id),
 'lemma.tutor.pending.v1:'+tuple(id)+':operation',
 'lemma.tutor.connector.v1:'+tuple(id)+':turn',
 ...['question','context','source','attached-local','reply:turn'].map(field=>'lemma.tutor.draft:'+tuple(id)+':'+field),
]
const saved:TutorThreadView={head:{threadId:'thread',lastSequence:1,pendingTurnId:null},canSubmit:true,canConnect:false,
 turns:[{id:'turn',threadId:'thread',sequence:1,version:2,status:'cancelled',snapshot:{question:'Private question',selectedContext:[]}}],recoveredDrafts:[]}
const ok=(data:unknown)=>({data,error:null,status:200})
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();mocks.mode='live';mocks.rpc.mockReset()
 owner='deleted-tutor-owner-'+(++sequence);publishAuth(null);publishAuth({id:owner})
})
afterEach(()=>{vi.restoreAllMocks();publishAuth(null)})

describe('owner-scoped tutor local cleanup',()=>{
 it('removes every live tutor record for the exact owner and preserves other owners and demo storage',()=>{
  const removed=[...keys(),'lemma.tutor.draft:'+tuple(owner,'a]:"\\path','c:p]')+':reply:turn:two']
  const retained=[...keys(owner+'-other'),...keys('other'),
   'lemma.demo-tutor:'+tuple()+':question','unrelated:'+owner]
  for(const key of [...removed,...retained])localStorage.setItem(key,'private content')
  sessionStorage.setItem('lemma.demo-tutor:'+tuple()+':question','demo content')
  expect(removeDeletedOwnerTutorData(owner,authGeneration())).toBe(true)
  for(const key of removed)expect(localStorage.getItem(key)).toBeNull()
  for(const key of retained)expect(localStorage.getItem(key)).toBe('private content')
  expect(sessionStorage.getItem('lemma.demo-tutor:'+tuple()+':question')).toBe('demo content')
  expect(tutorOwnerDeleted(owner)).toBe(true)
  expect(tutorOwnerDeleted('other')).toBe(false)
 })
 it('parses quoted tuple delimiters but never treats malformed or unrelated keys as an owner match',()=>{
  const unusual='owner]:"\\with:separators'
  expect(tutorStorageOwner('lemma.tutor.pending.v1:'+tuple(unusual,'p]',':c')+':op')).toBe(unusual)
  const malformed=['lemma.tutor.confirmed.v1:'+tuple()+':extra',
   'lemma.tutor.pending.v1:'+tuple()+':','lemma.tutor.connector.v1:'+tuple()+':','lemma.tutor.draft:'+tuple()+':reply:',
   'lemma.tutor.draft:'+tuple()+':unknown','lemma.tutor.draft:'+JSON.stringify([owner,'path'])+':question',
   'lemma.tutor.draft:'+JSON.stringify([owner,{path:'path'},'cp'])+':question',
   'lemma.tutor.draft:["'+owner+'",broken]:question','lemma.demo-tutor:'+tuple()+':question']
  for(const key of malformed){expect(tutorStorageOwner(key)).toBeNull();localStorage.setItem(key,'keep')}
  removeDeletedOwnerTutorData(owner,authGeneration())
  for(const key of malformed)expect(localStorage.getItem(key)).toBe('keep')
 })
 it.each(['different owner','new generation','demo mode'])('does nothing for a stale deletion scope: %s',kind=>{
  const generation=authGeneration(),stored=keys()
  for(const key of stored)localStorage.setItem(key,'keep')
  if(kind==='different owner')publishAuth({id:'other'})
  if(kind==='new generation'){publishAuth(null);publishAuth({id:owner})}
  if(kind==='demo mode')mocks.mode='demo'
  expect(removeDeletedOwnerTutorData(owner,generation)).toBe(false)
  expect(tutorOwnerDeleted(owner)).toBe(false)
  for(const key of stored)expect(localStorage.getItem(key)).toBe('keep')
 })
 it('keeps the deletion fence and tries the remaining keys when an individual removal fails',()=>{
  const [blocked,...removed]=keys(),remove=Storage.prototype.removeItem
  for(const key of [blocked,...removed])localStorage.setItem(key,'content')
  vi.spyOn(Storage.prototype,'removeItem').mockImplementation(function(this:Storage,key:string){
   if(key===blocked)throw new DOMException('Storage is unavailable','SecurityError')
   remove.call(this,key)
  })
  expect(removeDeletedOwnerTutorData(owner,authGeneration())).toBe(false)
  expect(localStorage.getItem(blocked)).toBe('content')
  for(const key of removed)expect(localStorage.getItem(key)).toBeNull()
  expect(tutorLocalScopeActive({ownerId:owner,generation:authGeneration()})).toBe(false)
 })
 it('retries a full-store deletion marker after removing the owner content',()=>{
  const stored=keys()[0],set=Storage.prototype.setItem
  localStorage.setItem(stored,'content')
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){
   if(key.startsWith('lemma.tutor.deleted.v1:')&&this.getItem(stored)!==null)throw new DOMException('Full','QuotaExceededError')
   set.call(this,key,value)
  })
  expect(removeDeletedOwnerTutorData(owner,authGeneration())).toBe(true)
  expect(localStorage.getItem('lemma.tutor.deleted.v1:'+JSON.stringify(owner))).toBe('1')
 })
 it('reports a missing durable fence while blocking same-tab writes when browser storage rejects it',()=>{
  const key=keys()[0],scope={ownerId:owner,generation:authGeneration()},set=Storage.prototype.setItem
  localStorage.setItem(key,'content')
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){
   if(key.startsWith('lemma.tutor.deleted.v1:'))throw new DOMException('Denied','SecurityError')
   set.call(this,key,value)
  })
  expect(removeDeletedOwnerTutorData(owner,scope.generation)).toBe(false)
  expect(localStorage.getItem(key)).toBeNull()
  expect(()=>writeTutorLocal(scope,key,'late private content')).toThrow('account changed')
  expect(localStorage.getItem(key)).toBeNull()
 })
 it('honors a deletion marker from another tab and cannot write across owner scopes',()=>{
  const scope={ownerId:owner,generation:authGeneration()},key=keys()[0]
  expect(()=>writeTutorLocal(scope,keys('other')[0],'wrong owner')).toThrow('account changed')
  localStorage.setItem('lemma.tutor.deleted.v1:'+JSON.stringify(owner),'1')
  expect(()=>writeTutorLocal(scope,key,'late')).toThrow('account changed')
  expect(localStorage.getItem(key)).toBeNull()
 })
 it('removes a cross-tab late write even when deletion occurs between its guard and the storage write',()=>{
  const scope={ownerId:owner,generation:authGeneration()},key=keys()[0],set=Storage.prototype.setItem
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,storageKey:string,value:string){
   if(storageKey===key)set.call(this,'lemma.tutor.deleted.v1:'+JSON.stringify(owner),'1')
   set.call(this,storageKey,value)
  })
  expect(()=>writeTutorLocal(scope,key,'late')).toThrow('account changed')
  expect(localStorage.getItem(key)).toBeNull()
 })
 it('rejects an in-flight conversation read after deletion without recreating its confirmed cache',async()=>{
  let resolve!:(value:unknown)=>void
  mocks.rpc.mockReturnValue(new Promise(done=>{resolve=done}))
  const api=openLiveManualTutor({ownerId:owner,generation:authGeneration(),pathId:'path',checkpointId:'cp'})
  const read=api.resume()
  removeDeletedOwnerTutorData(owner,authGeneration())
  resolve(ok(saved))
  await expect(read).rejects.toThrow('account changed')
  expect(localStorage.getItem(keys()[0])).toBeNull()
  await expect(api.resume()).rejects.toThrow('account changed')
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
 })
 it('removes a pending submission and rejects its late receipt and any further writes after deletion',async()=>{
  let resolve!:(value:unknown)=>void
  mocks.rpc.mockReturnValue(new Promise(done=>{resolve=done}))
  const api=openLiveManualTutor({ownerId:owner,generation:authGeneration(),pathId:'path',checkpointId:'cp'})
  const submission=api.submit('operation',{question:'Private question',selectedContext:[]},0)
  expect(localStorage.getItem(keys()[1])).toContain('Private question')
  removeDeletedOwnerTutorData(owner,authGeneration())
  resolve(ok({operationId:'operation',status:'submitted'}))
  await expect(submission).rejects.toThrow('account changed')
  await expect(api.submit('later',{question:'Late question',selectedContext:[]},0)).rejects.toThrow('account changed')
  for(const key of keys())expect(localStorage.getItem(key)).toBeNull()
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
 })
})
