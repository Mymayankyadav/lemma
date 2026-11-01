import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {createMemoryRouter,RouterProvider} from 'react-router'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'

type Session={user:{id:string}}|null
type Snapshot={v:1;savedAt:number;entries:{key:string[];data:unknown;savedAt:number}[]}
const auth=vi.hoisted(()=>({
 id:'owner-a',
 callback:null as null|((event:string,session:{user:{id:string}}|null)=>void),
}))
const offline=vi.hoisted(()=>({
 snapshots:new Map<string,{v:1;savedAt:number;entries:{key:string[];data:unknown;savedAt:number}[]}>(),
 reads:[] as string[],
 deletes:[] as string[],
 delayed:new Map<string,Promise<unknown>>(),
}))
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live',getDemoProfile:()=> 'default'}))
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({auth:{
  getSession:async()=>({data:{session:auth.id?{user:{id:auth.id}}:null}}),
  onAuthStateChange:(callback:(event:string,session:Session)=>void)=>{
   auth.callback=callback
   return {data:{subscription:{unsubscribe:()=>{auth.callback=null}}}}
  },
 }}),
}))
vi.mock('../../../src/lib/offline-cache',()=>({
 isOfflineKey:(key:unknown[])=>key.length===1&&key[0]==='home',
 readOfflineSnapshot:async(owner:string)=>{
  offline.reads.push(owner)
  return offline.delayed.get(owner)??offline.snapshots.get(owner)??null
 },
 saveOfflineSnapshot:async()=>{},
 deleteOfflineSnapshot:async(owner:string)=>{
  offline.deletes.push(owner)
  offline.snapshots.delete(owner)
 },
}))
vi.mock('motion/react',async importOriginal=>({
 ...await importOriginal<typeof import('motion/react')>(),
 useReducedMotion:()=>true,
}))
vi.mock('../../../src/ui/Ground',()=>({Ground:()=>null}))
vi.mock('../../../src/ui/backgrounds/graph/GraphSketch',()=>({GraphSketch:()=>null}))
vi.mock('../../../src/app/TabBar',()=>({default:()=>null}))
vi.mock('../../../src/app/DemoChip',()=>({default:()=>null}))

import AppShell from '../../../src/app/AppShell'

const snapshot=(title:string):Snapshot=>{
 const savedAt=Date.now()
 return {v:1,savedAt,entries:[{key:['home'],data:{title},savedAt}]}
}
async function flush(){
 await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve()})
}
afterEach(()=>{
 auth.id='owner-a'
 auth.callback=null
 offline.snapshots.clear()
 offline.reads.length=0
 offline.deletes.length=0
 offline.delayed.clear()
})

test('AND-8 authenticated A to B switch never hydrates A into B; sign-out erases B',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const oldOnline=Object.getOwnPropertyDescriptor(navigator,'onLine')
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false})
 offline.snapshots.set('owner-a',snapshot('Only A'))
 offline.snapshots.set('owner-b',snapshot('Only B'))
 const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const router=createMemoryRouter([{element:<AppShell/>,children:[{path:'/',element:<p>Offline</p>}]}])
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 try{
  await act(async()=>root.render(
   <QueryClientProvider client={queryClient}><RouterProvider router={router}/></QueryClientProvider>
  ))
  await flush()
  expect(queryClient.getQueryData(['home'])).toEqual({title:'Only A'})
  expect(offline.reads).toContain('owner-a')
  expect(auth.callback).toBeTypeOf('function')

  // A real Supabase SIGNED_IN event for a different account must clear the
  // old in-memory React Query cache before hydrating B's own IndexedDB store.
  auth.id='owner-b'
  await act(async()=>{auth.callback?.('SIGNED_IN',{user:{id:'owner-b'}})})
  await flush()
  expect(queryClient.getQueryData(['home'])).toEqual({title:'Only B'})
  expect(offline.reads).toContain('owner-b')
  expect(offline.deletes).toContain('owner-a')
  expect(offline.snapshots.has('owner-a')).toBe(false)

  await act(async()=>{auth.callback?.('SIGNED_OUT',null)})
  await flush()
  expect(queryClient.getQueryData(['home'])).toBeUndefined()
  expect(offline.deletes).toContain('owner-b')
  expect(offline.snapshots.has('owner-b')).toBe(false)
  expect(document.documentElement.dataset.offlineSavedAt).toBeUndefined()

  // A later account cannot accidentally resurrect B from either cache.
  auth.id='owner-a'
  await act(async()=>{auth.callback?.('SIGNED_IN',{user:{id:'owner-a'}})})
  await flush()
  expect(queryClient.getQueryData(['home'])).toBeUndefined()
  expect(offline.reads.at(-1)).toBe('owner-a')
 }finally{
  await act(async()=>root.unmount())
  router.dispose()
  host.remove()
  queryClient.clear()
  if(oldOnline)Object.defineProperty(navigator,'onLine',oldOnline)
  else Reflect.deleteProperty(navigator,'onLine')
  delete document.documentElement.dataset.offlineSavedAt
 }
})

test('AND-8 delayed A IndexedDB read cannot overwrite B after an auth switch',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const oldOnline=Object.getOwnPropertyDescriptor(navigator,'onLine')
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false})
 let finishA:(snapshot:Snapshot)=>void=()=>{}
 offline.delayed.set('owner-a',new Promise<Snapshot>(resolve=>{finishA=resolve}))
 offline.snapshots.set('owner-b',snapshot('Only B'))
 const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const router=createMemoryRouter([{element:<AppShell/>,children:[{path:'/',element:<p>Offline</p>}]}])
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 try{
  await act(async()=>root.render(
   <QueryClientProvider client={queryClient}><RouterProvider router={router}/></QueryClientProvider>
  ))
  await flush()
  expect(offline.reads).toContain('owner-a')
  expect(queryClient.getQueryData(['home'])).toBeUndefined()

  auth.id='owner-b'
  await act(async()=>{auth.callback?.('SIGNED_IN',{user:{id:'owner-b'}})})
  await flush()
  expect(queryClient.getQueryData(['home'])).toEqual({title:'Only B'})
  // deleteDatabase would be blocked while A's IDB read still owns its
  // connection; account-switch cleanup must wait for that read to finish.
  expect(offline.deletes).not.toContain('owner-a')

  // IndexedDB can resolve an earlier read after the account has changed.
  // The identity check must discard that result rather than rehydrate A.
  await act(async()=>{finishA(snapshot('Only A'))})
  await flush()
  expect(queryClient.getQueryData(['home'])).toEqual({title:'Only B'})
  expect(offline.reads).toContain('owner-b')
  expect(offline.deletes).toContain('owner-a')
 }finally{
  await act(async()=>root.unmount())
  router.dispose()
  host.remove()
  queryClient.clear()
  if(oldOnline)Object.defineProperty(navigator,'onLine',oldOnline)
  else Reflect.deleteProperty(navigator,'onLine')
  delete document.documentElement.dataset.offlineSavedAt
 }
})
