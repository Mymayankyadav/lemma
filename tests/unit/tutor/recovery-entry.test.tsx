import {act,type ComponentProps} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {authGeneration,publishAuth} from '../../../src/data/authBoundary'
import {CheckpointTutor} from '../../../src/features/tutor/DemoCheckpointTutor'
import type {TutorThreadView} from '../../../src/data/tutor/manual-api'

const rpc=vi.hoisted(()=>vi.fn())
const flags=vi.hoisted(()=>({enabled:true}))
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({rpc})}))
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live',getDemoProfile:()=> 'default'}))
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flags.enabled}))
const saved:TutorThreadView={head:{threadId:'thread',lastSequence:1,pendingTurnId:null},canSubmit:true,canConnect:true,
 turns:[{id:'turn',threadId:'thread',sequence:1,version:2,status:'completed',snapshot:{question:'A saved question',selectedContext:[]},
  finalReply:{turnId:'turn',messageId:'reply',body:'An owner-only saved reply',provenance:{kind:'manual-import',label:'Imported by you'},citations:[],suggestions:[]}}],recoveredDrafts:[]}
let root:Root,host:HTMLDivElement,client:QueryClient
const scope=(generation=authGeneration()):ComponentProps<typeof CheckpointTutor>['scope']=>({
 pathId:'path',checkpointId:'cp',title:'Checkpoint',objective:'Objective',authScope:{ownerId:'owner',checkpointId:'cp',generation},
})
async function render(props:ComponentProps<typeof CheckpointTutor>){
 await act(async()=>{root.render(<QueryClientProvider client={client}><MemoryRouter><CheckpointTutor {...props}/></MemoryRouter></QueryClientProvider>)})
 await act(async()=>{await vi.dynamicImportSettled()})
}
async function open(){
 const button=[...host.querySelectorAll('button')].find(node=>node.textContent==='Open checkpoint tutor')
 expect(button).toBeDefined()
 await act(async()=>button!.click())
 await act(async()=>{await vi.dynamicImportSettled()})
 await vi.waitFor(()=>expect(host.textContent).toContain('An owner-only saved reply'))
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 localStorage.clear();publishAuth(null);publishAuth({id:'owner'});rpc.mockReset();flags.enabled=true
 client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true}})
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false}})
})
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove()})

describe('tutor read and recovery entry',()=>{
 it('keeps owner history available during a global hold without exposing new write controls',async()=>{
  rpc.mockImplementation(async name=>({data:name==='lemma_plan_released'?false:saved,error:null,status:200}))
  await render({scope:scope()});await open()
  expect(host.textContent).toContain('without sending anything new')
  expect(host.textContent).not.toContain('Draft a card from this reply')
  expect(host.textContent).not.toContain('Save question')
  expect(rpc.mock.calls.some(call=>call[0]==='tutor_owner_command')).toBe(false)
 })
 it('reads a previously authorized checkpoint cache after its generation changes and release cannot be fetched',async()=>{
  const previous=scope(),consumed=vi.fn()
  localStorage.setItem('lemma.tutor.confirmed.v1:'+JSON.stringify(['owner','path','cp']),JSON.stringify(saved))
  publishAuth(null);publishAuth({id:'owner'})
  rpc.mockResolvedValue({data:null,error:{code:'',message:'Failed to fetch'},status:0})
  await render({scope:previous,handoff:{requestId:'selection',text:'Do not attach this automatically'},onHandoffConsumed:consumed})
  await vi.waitFor(()=>expect(host.textContent).toContain('An owner-only saved reply'))
  expect(host.textContent).toContain('Offline.')
  expect(consumed).not.toHaveBeenCalled()
  expect(rpc.mock.calls.some(call=>call[0]==='tutor_owner_command')).toBe(false)
  await act(async()=>publishAuth({id:'other'}))
  expect(host.textContent).not.toContain('An owner-only saved reply')
  expect(host.textContent).not.toContain('Open checkpoint tutor')
 })
 it('keeps the build flag off even when owner history is cached',async()=>{
  flags.enabled=false
  localStorage.setItem('lemma.tutor.confirmed.v1:'+JSON.stringify(['owner','path','cp']),JSON.stringify(saved))
  await render({scope:scope()})
  expect(host.textContent).not.toContain('Open checkpoint tutor')
  expect(rpc).not.toHaveBeenCalled()
 })
})
