import {act,useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {createMemoryRouter,RouterProvider} from 'react-router'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import AppShell from '../../../src/app/AppShell'
import {stageOfflineHandoff,saveOfflineSnapshot} from '../../../src/lib/offline-cache'

vi.mock('../../../src/data/mode',()=>({
 getMode:()=> 'demo',
 getDemoProfile:()=> 'stress',
}))
vi.mock('../../../src/lib/offline-cache',async importOriginal=>{
 const actual=await importOriginal<typeof import('../../../src/lib/offline-cache')>()
 return {...actual,stageOfflineHandoff:vi.fn(),saveOfflineSnapshot:vi.fn().mockResolvedValue(undefined)}
})
vi.mock('motion/react',async importOriginal=>({
 ...await importOriginal<typeof import('motion/react')>(),
 useReducedMotion:()=>true,
}))
vi.mock('../../../src/ui/Ground',()=>({Ground:()=>null}))
vi.mock('../../../src/ui/backgrounds/graph/GraphSketch',()=>({GraphSketch:()=>null}))
vi.mock('../../../src/app/TabBar',()=>({default:()=>null}))
vi.mock('../../../src/app/DemoChip',()=>({default:()=>null}))

afterEach(()=>{
 vi.mocked(stageOfflineHandoff).mockClear()
 vi.mocked(saveOfflineSnapshot).mockClear()
})

test('AND-8 pagehide stages successful route queries synchronously before best-effort IDB flush',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const client=new QueryClient()
 const router=createMemoryRouter([{element:<AppShell/>,children:[{path:'/',element:<p>Home</p>}]}])
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 try{
  await act(async()=>root.render(
   <QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>
  ))
  // A successful query can already be in cache when a hard navigation begins.
  // The synchronous pagehide handoff must not wait for idle timers or IDB.
  vi.mocked(stageOfflineHandoff).mockClear()
  client.setQueryData(['projects'],[{slug:'real-analysis',title:'Real Analysis'}])
  // Successful query updates must not synchronously scrub/serialize S/X data
  // during cold paint; the real pagehide is the synchronous handoff boundary.
  expect(stageOfflineHandoff).not.toHaveBeenCalled()
  vi.mocked(saveOfflineSnapshot).mockClear()
  const order:string[]=[]
  vi.mocked(stageOfflineHandoff).mockImplementation(()=>{order.push('stage')})
  vi.mocked(saveOfflineSnapshot).mockImplementation(async()=>{order.push('save')})
  window.dispatchEvent(new Event('pagehide'))
  expect(stageOfflineHandoff).toHaveBeenCalledWith(
   'demo-stress',['projects'],[{slug:'real-analysis',title:'Real Analysis'}],expect.any(Number)
  )
  await vi.waitFor(()=>expect(saveOfflineSnapshot).toHaveBeenCalled())
  expect(order[0]).toBe('stage')
  expect(order).toContain('save')
 }finally{
  await act(async()=>root.unmount())
  router.dispose()
  host.remove()
  client.clear()
 }
})


test('AND-8 registers the pagehide listener before a newly painted route can navigate away',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const client=new QueryClient()
 client.setQueryData(['projects'],[{slug:'real-analysis',title:'Real Analysis'}])
 function ImmediateExit(){
  // Child passive effects run before the parent passive effect. This
  // deliberately reproduces a fast navigation after the route commits:
  // a parent useEffect listener would miss it; useLayoutEffect cannot.
  useEffect(()=>{window.dispatchEvent(new Event('pagehide'))},[])
  return <p>Home</p>
 }
 const router=createMemoryRouter([{element:<AppShell/>,children:[{path:'/',element:<ImmediateExit/>}]}])
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 try{
  vi.mocked(stageOfflineHandoff).mockClear()
  await act(async()=>root.render(
   <QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>
  ))
  expect(stageOfflineHandoff).toHaveBeenCalledWith(
   'demo-stress',['projects'],[{slug:'real-analysis',title:'Real Analysis'}],expect.any(Number)
  )
 }finally{
  await act(async()=>root.unmount())
  router.dispose()
  host.remove()
  client.clear()
 }
})
