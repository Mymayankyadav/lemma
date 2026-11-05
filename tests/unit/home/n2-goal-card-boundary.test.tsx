import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {describe,expect,it,vi} from 'vitest'
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter'
import type {DemoStore} from '../../../src/data/demo/model'

// Keep the real useHome/useProject hooks and the real demo adapter. The only
// substitution is the adapter instance, so Today selects its own goal path.
let adapter:DemoAdapter
vi.mock('../../../src/data',()=>({getApi:()=>adapter}))
vi.mock('../../../src/features/home/ReviewOutlook',()=>({
 ReviewOutlook:()=>null,
}))

import Page from '../../../src/features/home/Page'

const sizes=[14,15,40] as const

function boundaryFixture():DemoStore{
 const fixture=structuredClone(demoSeedFixture)
 // Build checkpoints, not ProjectSummary stubs: DemoAdapter must derive the
 // true done, total and next-checkpoint values for the Today query.
 fixture.checkpoints=fixture.projects.flatMap((project,index)=>{
  const source=demoSeedFixture.checkpoints.find(cp=>cp.projectId===project.id)
   ??demoSeedFixture.checkpoints[0]
  return Array.from({length:sizes[index]},(_,position)=>({
   ...source,
   id:project.id+'-boundary-'+(position+1),
   projectId:project.id,
   code:'CP'+(position+1),
   title:position===3?'Next proof checkpoint':'Proof checkpoint '+(position+1),
   position:(position+1)*10,
   status:position<3?'demonstrated' as const:position===3?'in_progress' as const:'not_started' as const,
   currentStep:position===3?2:0,
   steps:['Set up the proof','Show the key step','Check the argument'],
   prereqs:position===0?[]:['CP'+position],
   conceptIds:[],
   dueOn:null,
   demonstratedAt:null,
   recheckDue:null,
   needsRevisit:false,
   proposed:false,
  }))
 })
 return fixture
}

describe('N2: actual Today goal selection at 14/15/40 checkpoints',()=>{
 it('renders the same goal elements on both sides of the boundary using demo-adapter data',async()=>{
  window.history.replaceState(null,'','/?demo=1')
  adapter=new DemoAdapter({fixture:boundaryFixture(),now:()=>Date.parse('2026-11-04T12:00:00Z'),timeZone:'UTC'})
  const home=await adapter.getHome()
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60_000}}})
  client.setQueryData(['home'],home)
  client.setQueryData(['settings'],await adapter.getSettings())
  for(const project of home.projects){
   client.setQueryData(['project',project.slug],await adapter.getProject(project.slug))
  }

  const host=document.createElement('div')
  document.body.appendChild(host)
  const root=createRoot(host)
  try{
   await act(async()=>{
    root.render(<QueryClientProvider client={client}>
     <MemoryRouter><Page/></MemoryRouter>
    </QueryClientProvider>)
   })
   // The small-desk GoalDistance and its 14-checkpoint GoalCard are lazy.
   // Flush their real imports instead of testing their components in isolation.
   for(let i=0;i<10&&host.querySelectorAll('[data-goal-card]').length<3;i++){
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))})
   }

   expect(host.querySelectorAll('[data-goal-card]')).toHaveLength(3)
   for(const [index,project] of home.projects.entries()){
    const total=sizes[index]
    expect(project.total).toBe(total)
    expect(project.done).toBe(3)
    expect(project.current?.code).toBe('CP4')

    const card=Array.from(host.querySelectorAll<HTMLElement>('[data-goal-card]'))
     .find(node=>node.getAttribute('aria-label')==='Goal progress for '+project.title)
    expect(card,'Today card for '+project.title).toBeDefined()
    expect(card!.textContent).toContain(project.title)
    expect(card!.querySelector('[data-goal-now]')?.textContent).toContain('CP4')
    expect(card!.querySelector('[data-goal-now]')?.textContent).toContain('Next proof checkpoint')
    const distance=card!.querySelector('[data-goal-distance]')
    expect(distance?.textContent).toContain('3 of '+total)
    expect(distance?.getAttribute('aria-label'))
     .toBe('Distance to goal: '+(total-3)+' checkpoints remaining')
    // 14 takes the interactive Metro; 15 and 40 take the bounded Today
    // summary. The old percentage-only fallback fails the assertions above.
    expect(card!.hasAttribute('data-summary-goal')).toBe(total>14)
   }
  }finally{
   await act(async()=>root.unmount())
   client.clear()
   host.remove()
   window.history.replaceState(null,'','/')
  }
 })
})
