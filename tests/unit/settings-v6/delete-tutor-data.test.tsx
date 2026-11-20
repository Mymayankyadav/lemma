import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {authGeneration,publishAuth} from '../../../src/data/authBoundary'
import {removeDeletedOwnerTutorData,tutorOwnerDeleted} from '../../../src/data/tutor/local-storage'
import DeleteAccount,{DELETE_CONFIRMATION} from '../../../src/features/settings/v6/DeleteAccount'
import {CheckpointTutor} from '../../../src/features/tutor/DemoCheckpointTutor'

const mocks=vi.hoisted(()=>({invoke:vi.fn(),signOut:vi.fn(),navigate:vi.fn(),notify:vi.fn(),pads:vi.fn(),rpc:vi.fn()}))
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live',getDemoProfile:()=> 'default'}))
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({rpc:mocks.rpc,functions:{invoke:mocks.invoke},auth:{signOut:mocks.signOut}})}))
vi.mock('../../../src/features/pad/padCheckpoint',()=>({removeDeletedOwnerPads:(...args:unknown[])=>mocks.pads(...args)}))
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>mocks.notify}))
vi.mock('../../../src/flags',()=>({isFlagOn:()=>true}))
vi.mock('react-router',async original=>({...await original<typeof import('react-router')>(),useNavigate:()=>mocks.navigate}))
let root:Root,host:HTMLDivElement,client:QueryClient,owner:string,sequence=0
const scopeKey=(id=owner)=>JSON.stringify([id,'path','cp'])
const localKeys=(id=owner)=>['lemma.tutor.confirmed.v1:'+scopeKey(id),'lemma.tutor.pending.v1:'+scopeKey(id)+':operation',
 ...['question','context','source','attached-local','reply:turn'].map(field=>'lemma.tutor.draft:'+scopeKey(id)+':'+field)]
const showModal=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal')
const close=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'close')
const emptyThread={head:{threadId:null,lastSequence:0,pendingTurnId:null},canSubmit:true,canConnect:false,turns:[],recoveredDrafts:[]}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve}}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 localStorage.clear();sessionStorage.clear();owner='delete-tutor-hook-owner-'+(++sequence)
 publishAuth(null);publishAuth({id:owner})
 for(const mock of Object.values(mocks))mock.mockReset()
 mocks.signOut.mockResolvedValue({error:null});mocks.pads.mockResolvedValue(true)
 mocks.rpc.mockImplementation(async name=>({data:name==='lemma_plan_released'?true:emptyThread,error:null,status:200}))
 client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true}})
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false}})
})
afterEach(async()=>{
 await act(async()=>root.unmount());client.clear();host.remove();vi.restoreAllMocks();publishAuth(null)
 if(showModal)Object.defineProperty(HTMLDialogElement.prototype,'showModal',showModal)
 else Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal')
 if(close)Object.defineProperty(HTMLDialogElement.prototype,'close',close)
 else Reflect.deleteProperty(HTMLDialogElement.prototype,'close')
})
async function render(){
 await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter>
  <DeleteAccount onExport={()=>{}}/><CheckpointTutor scope={{pathId:'path',checkpointId:'cp',title:'Checkpoint',objective:'Objective',
   authScope:{ownerId:owner,generation:authGeneration(),checkpointId:'cp'}}}/>
 </MemoryRouter></QueryClientProvider>))
 await act(async()=>{await vi.dynamicImportSettled()})
}
function button(text:string){
 const node=[...host.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent===text)
 if(!node)throw new Error('Missing button '+text)
 return node
}
function setValue(input:HTMLInputElement|HTMLTextAreaElement,value:string){
 const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype
 Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(input,value)
 input.dispatchEvent(new Event('input',{bubbles:true}))
}
async function confirm(){
 await act(async()=>setValue(host.querySelector<HTMLInputElement>('input[aria-label="Type delete confirmation"]')!,DELETE_CONFIRMATION))
 await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
}
async function openTutor(){
 await act(async()=>button('Open checkpoint tutor').click())
 await act(async()=>{await vi.dynamicImportSettled()})
 await vi.waitFor(()=>expect([...host.querySelectorAll('label')].some(label=>label.textContent==='Question')).toBe(true))
 const label=[...host.querySelectorAll('label')].find(label=>label.textContent==='Question')!
 return document.getElementById(label.htmlFor) as HTMLTextAreaElement
}

describe('confirmed account deletion cleans local tutor data',()=>{
 it.each(['unverified','server error','network failure'])('preserves tutor data and authorization after %s',async failure=>{
  for(const key of localKeys())localStorage.setItem(key,'keep this draft')
  if(failure==='network failure')mocks.invoke.mockRejectedValue(new Error('Network unavailable'))
  else mocks.invoke.mockResolvedValue(failure==='unverified'?{data:{deleted:false},error:null}:{data:null,error:{status:503}})
  await render();await confirm()
  await act(async()=>button('Delete account permanently').click())
  await vi.waitFor(()=>expect(host.querySelector('[role=alert]')).not.toBeNull())
  for(const key of localKeys())expect(localStorage.getItem(key)).toBe('keep this draft')
  expect(tutorOwnerDeleted(owner)).toBe(false)
  expect(mocks.pads).not.toHaveBeenCalled();expect(mocks.signOut).not.toHaveBeenCalled();expect(mocks.navigate).not.toHaveBeenCalled()
 })
 it('fences and hides tutor data before asynchronous Pad cleanup and signs out only after cleanup',async()=>{
  const pads=deferred<boolean>()
  mocks.invoke.mockResolvedValue({data:{deleted:true},error:null});mocks.pads.mockReturnValue(pads.promise)
  await render();await confirm()
  const question=await openTutor()
  await act(async()=>setValue(question,'A private unsent question'))
  const mine=localKeys(),other=localKeys('other'),demo='lemma.demo-tutor:'+scopeKey()+':question'
  for(const key of [...mine,...other])localStorage.setItem(key,'private content')
  sessionStorage.setItem(demo,'demo content')
  await act(async()=>button('Delete account permanently').click())
  await act(async()=>{await vi.dynamicImportSettled()})
  await vi.waitFor(()=>expect(mocks.pads).toHaveBeenCalledWith(owner,authGeneration()))
  expect(tutorOwnerDeleted(owner)).toBe(true)
  for(const key of mine)expect(localStorage.getItem(key)).toBeNull()
  for(const key of other)expect(localStorage.getItem(key)).toBe('private content')
  expect(sessionStorage.getItem(demo)).toBe('demo content')
  expect(host.textContent).not.toContain('Open checkpoint tutor')
  expect(host.querySelector('textarea')).toBeNull()
  expect(mocks.signOut).not.toHaveBeenCalled()
  await act(async()=>pads.resolve(true))
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(mocks.navigate).toHaveBeenCalledWith('/sign-in',{replace:true})
 })
 it.each(['another owner','the same owner signing in again'])('does not clean a stale request after switching to %s',async kind=>{
  const deletion=deferred<{data:{deleted:true};error:null}>()
  mocks.invoke.mockReturnValue(deletion.promise)
  for(const key of [...localKeys(),...localKeys('other')])localStorage.setItem(key,'keep')
  await render();await confirm()
  await act(async()=>button('Delete account permanently').click())
  await act(async()=>{
   if(kind==='another owner')publishAuth({id:'other'})
   else {publishAuth(null);publishAuth({id:owner})}
   deletion.resolve({data:{deleted:true},error:null})
  })
  for(const key of [...localKeys(),...localKeys('other')])expect(localStorage.getItem(key)).toBe('keep')
  expect(tutorOwnerDeleted(owner)).toBe(false)
  expect(mocks.pads).not.toHaveBeenCalled();expect(mocks.signOut).not.toHaveBeenCalled();expect(mocks.navigate).not.toHaveBeenCalled()
 })
 it('does not sign out a new owner who arrived while the confirmed deletion cleanup was pending',async()=>{
  const pads=deferred<boolean>(),other=localKeys('next-owner')
  mocks.invoke.mockResolvedValue({data:{deleted:true},error:null});mocks.pads.mockReturnValue(pads.promise)
  for(const key of [...localKeys(),...other])localStorage.setItem(key,'content')
  await render();await confirm()
  await act(async()=>button('Delete account permanently').click())
  await act(async()=>{await vi.dynamicImportSettled()})
  await vi.waitFor(()=>expect(mocks.pads).toHaveBeenCalledTimes(1))
  await act(async()=>{publishAuth({id:'next-owner'});pads.resolve(true)})
  for(const key of localKeys())expect(localStorage.getItem(key)).toBeNull()
  for(const key of other)expect(localStorage.getItem(key)).toBe('content')
  expect(mocks.signOut).not.toHaveBeenCalled();expect(mocks.navigate).not.toHaveBeenCalled()
 })
 it('reports incomplete local cleanup without exposing the deleted owner again',async()=>{
  mocks.invoke.mockResolvedValue({data:{deleted:true},error:null})
  const key=localKeys()[0],remove=Storage.prototype.removeItem
  localStorage.setItem(key,'retained private content')
  vi.spyOn(Storage.prototype,'removeItem').mockImplementation(function(this:Storage,name:string){
   if(name===key)throw new DOMException('Denied','SecurityError')
   remove.call(this,name)
  })
  await render();await confirm()
  await act(async()=>button('Delete account permanently').click())
  await act(async()=>{await vi.dynamicImportSettled()})
  await vi.waitFor(()=>expect(mocks.navigate).toHaveBeenCalledTimes(1))
  expect(mocks.notify).toHaveBeenCalledWith(expect.stringContaining('remaining local Pad and tutor data'),{tone:'normal'})
  expect(tutorOwnerDeleted(owner)).toBe(true)
  expect(host.textContent).not.toContain('Open checkpoint tutor')
 })
 it('blocks an already queued draft input after the same-tab deletion fence is set',async()=>{
  await render()
  const question=await openTutor(),key='lemma.tutor.draft:'+scopeKey()+':question'
  await act(async()=>setValue(question,'Draft before deletion'))
  expect(localStorage.getItem(key)).toBe('Draft before deletion')
  await act(async()=>{
   removeDeletedOwnerTutorData(owner,authGeneration())
   setValue(question,'Queued input after deletion')
  })
  expect(localStorage.getItem(key)).toBeNull()
  expect(host.textContent).not.toContain('Open checkpoint tutor')
 })
 it('hides an open owner tutor when another tab confirms its deletion',async()=>{
  await render();await openTutor()
  await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:'lemma.tutor.deleted.v1:'+JSON.stringify('other'),newValue:'1',storageArea:localStorage})))
  expect(host.textContent).toContain('Open checkpoint tutor')
  await act(async()=>{
   const key='lemma.tutor.deleted.v1:'+JSON.stringify(owner)
   localStorage.setItem(key,'1')
   window.dispatchEvent(new StorageEvent('storage',{key,newValue:'1',storageArea:localStorage}))
  })
  expect(host.textContent).not.toContain('Open checkpoint tutor')
  expect(host.querySelector('textarea')).toBeNull()
 })
})
