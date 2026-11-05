import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter} from 'react-router'
import {describe,expect,it,vi} from 'vitest'
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter'
import type {DemoStore} from '../../../src/data/demo/model'
import Page from '../../../src/features/home/Page'

// Preserve the real hooks, demo adapter and Today selection logic. Only choose
// which real adapter getApi supplies and fix the page to demo mode for this test.
let selectedApi:DemoAdapter
vi.mock('../../../src/data',()=>({getApi:()=>selectedApi}))
vi.mock('../../../src/data/mode',()=>({
 getMode:()=> 'demo',
 getDemoProfile:()=> 'default',
}))

function fixtureWithCheckpointCounts(largeDesk:boolean):DemoStore{
 const fixture=structuredClone(demoSeedFixture)
 const projectSeed=demoSeedFixture.projects.find(p=>p.status==='active'&&!p.system)!
 const checkpointSeed=demoSeedFixture.checkpoints.find(cp=>cp.projectId===projectSeed.id)!
 const totals=largeDesk?[14,15,40,8,9]:[14,15,40]
 fixture.projects=totals.map((total,index)=>({
  ...projectSeed,id:'n2-project-'+total,slug:'n2-demo-'+total,
  title:'N2 demo path '+total,status:'active' as const,
  system:false,pinned:true,targetDate:null,
  lastActivityAt:new Date(Date.UTC(2026,10,4,12-index)).toISOString(),
 }))
 fixture.checkpoints=fixture.projects.flatMap((project,index)=>
  Array.from({length:totals[index]},(_,i)=>{
   const number=i+1
   return {
    ...checkpointSeed,id:project.id+'-cp-'+number,
    projectId:project.id,code:'CP'+number,position:number*10,
    title:number===4?'Next proof checkpoint':'Proof checkpoint '+number,
    stage:'Stage '+Math.ceil(number/8),
    status:(number<=3?'demonstrated':number===4?'in_progress':'not_started') as typeof checkpointSeed.status,
    currentStep:number===4?1:0,prereqs:[],proposed:false,
    demonstratedAt:null,recheckDue:null,needsRevisit:false,
   }
  }))
 // Keep the seed's subjects, styles and settings; isolate the three study
 // paths so home_summary comes from actual checkpoints, not hand-made summaries.
 fixture.sessions=[]
 fixture.notes=[]
 fixture.reviews=[]
 fixture.proposals=[]
 fixture.sources=[]
 fixture.concepts=[]
 fixture.links=[]
 fixture.misconceptions=[]
 fixture.checkpointEvents=[]
 return fixture
}

async function renderToday(largeDesk:boolean){
 selectedApi=new DemoAdapter({
  fixture:fixtureWithCheckpointCounts(largeDesk),
  now:()=>Date.UTC(2026,10,5,12),
  timeZone:'UTC',
 })
 const home=await selectedApi.getHome()
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 client.setQueryData(['home'],home)
 client.setQueryData(['settings'],await selectedApi.getSettings())
 client.setQueryData(['insights',30],await selectedApi.getInsightData(30))
 for(const project of home.projects)
  client.setQueryData(['project',project.slug],await selectedApi.getProject(project.slug))
 vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}})
 const host=document.createElement('div')
 document.body.appendChild(host)
 const root=createRoot(host)
 try{
  await act(async()=>{
   root.render(<QueryClientProvider client={client}><MemoryRouter><Page/></MemoryRouter></QueryClientProvider>)
  })
  await vi.waitFor(()=>{
   for(const total of [14,15,40]){
    // This article comes from Page -> GoalDistance/FastGoalDistance; calling
    // GoalCard or SummaryGoalCard directly would not detect a broken switch.
    const card=host.querySelector('[aria-label="Goal progress for N2 demo path '+total+'"]')
    expect(card,'Today card '+total).not.toBeNull()
    expect(card!.hasAttribute('data-goal-card'),'shared card '+total).toBe(true)
    expect(card!.querySelector('a[href="/p/n2-demo-'+total+'"]')?.textContent).toContain('N2 demo path '+total)
    expect(card!.querySelector('[data-goal-now]')?.textContent).toContain('CP4')
    expect(card!.querySelector('[data-goal-now]')?.textContent).toContain('Next proof checkpoint')
    const distance=card!.querySelector('[data-goal-distance]')
    expect(distance?.textContent).toContain('3 of '+total)
    expect(distance?.getAttribute('aria-label')).toBe('Distance to goal: '+(total-3)+' checkpoints remaining')
    if(total>14)expect(card!.hasAttribute('data-summary-goal')).toBe(true)
    else expect(card!.querySelector('[data-route-mode="today"]')).not.toBeNull()
   }
  },{timeout:15_000,interval:50})
 }finally{
  await act(async()=>root.unmount())
  client.clear()
  host.remove()
  vi.unstubAllGlobals()
 }
}

describe('N2: demo adapter to actual Today goal cards',()=>{
 it('retains title, next checkpoint and distance at 14, 15 and 40 checkpoints on the small desk',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  await renderToday(false)
 },30_000)
 it('retains the same three goal cards when Today selects the fast large-desk path',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>
   window.setTimeout(()=>callback(performance.now()),0))
  vi.stubGlobal('cancelAnimationFrame',(handle:number)=>window.clearTimeout(handle))
  try{await renderToday(true)}
  finally{vi.unstubAllGlobals()}
 },30_000)
})
