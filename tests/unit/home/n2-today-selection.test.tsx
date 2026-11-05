import React from 'react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter} from 'react-router'
import {describe,expect,it,vi} from 'vitest'
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter'
import type {DemoCheckpoint,DemoStore} from '../../../src/data/demo/model'
import Today from '../../../src/features/home/Page'
import {renderAllReady} from '../../helpers/renderAllReady'

// A server-rendered demo page needs the same mode as the real ?demo=1 route.
// Do not mock Page, the Today goal selector, the hooks or the card components.
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
  const api=boundaryDemo()
  const home=await api.getHome()
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  client.setQueryData(['home'],home)
  client.setQueryData(['settings'],await api.getSettings())
  for(const project of home.projects){
   client.setQueryData(['project',project.slug],await api.getProject(project.slug))
  }
  expect(home.projects.map(project=>project.total).sort((a,b)=>a-b)).toEqual([14,15,40])
  expect(home.projects).toHaveLength(3)

  // Render the actual Page: it decides between GoalDistance and
  // FastGoalDistance, then between GoalCard and SummaryGoalCard.
  const html=await renderAllReady(
   <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/']}><Today/></MemoryRouter>
   </QueryClientProvider>
  )
  const view=new DOMParser().parseFromString(html,'text/html')
  const goals=view.querySelector('[aria-label="Distance to your goals"]')
  expect(goals).not.toBeNull()
  expect(goals?.querySelectorAll('article[aria-label^="Goal progress for"]')).toHaveLength(3)

  for(const project of home.projects){
   const card=Array.from(goals?.querySelectorAll('article')??[])
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
 })
})
