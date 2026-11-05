import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter} from 'react-router'
import {describe,expect,it,vi} from 'vitest'
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter'
import type {DemoCheckpoint,DemoStore} from '../../../src/data/demo/model'
import Today from '../../../src/features/home/Page'

// Use the actual Today page, its real hooks, and real component selection.
// Only supply a deterministic DemoAdapter fixture through getApi.
let selectedApi:DemoAdapter
vi.mock('../../../src/data',()=>({getApi:()=>selectedApi}))
vi.mock('../../../src/data/mode',()=>({
 getMode:()=> 'demo',
 getDemoProfile:()=> 'default',
}))

/** Build real demo adapter summaries at the 14/15/40 boundary instead of
 * passing fabricated ProjectSummary objects straight into chosen components.
 * This tests the Today page's actual selector and its large-card fallback. */
function boundaryDemo():DemoAdapter{
 const fixture=structuredClone(demoSeedFixture) as DemoStore
 const sizes=[14,15,40]
 const original=fixture.checkpoints
 fixture.checkpoints=fixture.projects.flatMap((project,projectIndex)=>{
  const seed=original.filter(cp=>cp.projectId===project.id)
  const total=sizes[projectIndex]
  if(!seed.length||total===undefined)throw Error('Unexpected demo fixture')
  return Array.from({length:total},(_,i):DemoCheckpoint=>{
   const template=seed[Math.min(i,seed.length-1)]
   return {
    ...structuredClone(template),
    id:project.id+'-n2-cp-'+(i+1),
    projectId:project.id,
    code:'CP'+(i+1),
    title:i===3?'Next proof for '+project.title:'Proof checkpoint '+(i+1),
    position:i+1,
    status:i<3?'demonstrated':i===3?'in_progress':'not_started',
    proposed:false,
    currentStep:i===3?1:0,
    needsRevisit:false,
    demonstratedAt:i<3?'@date:-4':null,
    prereqs:[],
    conceptIds:[],
   }
  })
 })
 return new DemoAdapter({fixture,now:()=>Date.parse('2026-11-03T12:00:00Z'),timeZone:'UTC'})
}

describe('N2: real Today selection for 14, 15 and 40 checkpoint demo projects',()=>{
 it('renders the same title, next checkpoint and distance on both sides of the cutoff',async()=>{
  selectedApi=boundaryDemo()
  const home=await selectedApi.getHome()
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60_000}}})
  client.setQueryData(['home'],home)
  client.setQueryData(['settings'],await selectedApi.getSettings())
  for(const project of home.projects){
   client.setQueryData(['project',project.slug],await selectedApi.getProject(project.slug))
  }
  expect(home.projects.map(project=>project.total).sort((a,b)=>a-b)).toEqual([14,15,40])
  expect(home.projects).toHaveLength(3)

  // Client-mount the actual Page. Streaming SSR HTML may contain Suspense
  // instruction templates rather than mounted card DOM; it cannot prove the
  // selected GoalDistance and lazy GoalCard actually appear on Today.
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}})
  const host=document.createElement('div')
  document.body.appendChild(host)
  const root=createRoot(host)
  try{
   await act(async()=>{
    root.render(<QueryClientProvider client={client}>
     <MemoryRouter initialEntries={['/']}><Today/></MemoryRouter>
    </QueryClientProvider>)
   })
   await vi.waitFor(()=>{
    const goals=host.querySelector('[aria-label="Distance to your goals"]')
    expect(goals).not.toBeNull()
    expect(goals?.querySelectorAll('article[aria-label^="Goal progress for"]')).toHaveLength(3)
   },{timeout:15_000,interval:50})
   const goals=host.querySelector('[aria-label="Distance to your goals"]')!
   for(const project of home.projects){
    const card=Array.from(goals.querySelectorAll('article'))
     .find(node=>node.getAttribute('aria-label')==='Goal progress for '+project.title)
    expect(card,'Today card for '+project.title).toBeDefined()
    expect(card?.getAttribute('data-goal-card')).toBe('')
    expect(card?.querySelector('a')?.textContent).toContain(project.title)
    expect(card?.querySelector('[data-goal-now]')?.textContent).toContain('CP4')
    expect(card?.querySelector('[data-goal-now]')?.textContent)
     .toContain('Next proof for '+project.title)
    expect(card?.querySelector('[data-goal-distance]')?.textContent)
     .toContain('3 of '+project.total)
    expect(card?.querySelector('[data-goal-distance]')?.getAttribute('aria-label'))
     .toBe('Distance to goal: '+(project.total-3)+' checkpoints remaining')
    if(project.total>14){
     expect(card?.hasAttribute('data-summary-goal')).toBe(true)
     expect(card?.textContent).not.toContain('Open the path for individual checkpoints')
    }else{
     expect(card?.hasAttribute('data-summary-goal')).toBe(false)
    }
   }
  }finally{
   await act(async()=>root.unmount())
   client.clear()
   host.remove()
   vi.unstubAllGlobals()
  }
 },30_000)
})
