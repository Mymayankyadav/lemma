import {act} from 'react'
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
  client.setQueryData(['projects'],[{slug:'real-analysis',title:'Real Analysis'}])
  vi.mocked(stageOfflineHandoff).mockClear()
  vi.mocked(saveOfflineSnapshot).mockClear()
  window.dispatchEvent(new Event('pagehide'))
  expect(stageOfflineHandoff).toHaveBeenCalledWith(
   'demo-stress',['projects'],[{slug:'real-analysis',title:'Real Analysis'}],expect.any(Number)
  )
  await vi.waitFor(()=>expect(saveOfflineSnapshot).toHaveBeenCalled())
 }finally{
  await act(async()=>root.unmount())
  router.dispose()
  host.remove()
  client.clear()
 }
})
