import {describe,expect,it,vi} from 'vitest'
import {QueryClient} from '@tanstack/react-query'
import {prefetchAtlasForPaths} from '../../../src/features/projects/atlasPrefetch'
import {DemoAdapter} from '../../../src/data/demo/adapter'
import {makeStressStore} from '../../../src/data/demo/stress'
import type {DemoStore} from '../../../src/data/demo/model'
import {readFileSync} from 'node:fs'

describe('FIX #507 Paths-to-Atlas data prefetch',()=>{
 it('never issues a live Atlas request merely because Paths is open',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  const load=vi.fn(async()=>({concepts:[],links:[]}))
  await prefetchAtlasForPaths(client,'live',load)
  expect(load).not.toHaveBeenCalled()
  expect(client.getQueryData(['atlas'])).toBeUndefined()
 })
 it('warms the canonical Atlas query once and reuses it for repeated navigation',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  const graph={concepts:[{id:'idea'}],links:[{fromId:'a',toId:'b'}]}
  const load=vi.fn(async()=>graph)
  await prefetchAtlasForPaths(client,'demo',load)
  await prefetchAtlasForPaths(client,'demo',load)
  expect(load).toHaveBeenCalledTimes(1)
  expect(client.getQueryData(['atlas'])).toBe(graph)
 })
 it('deduplicates a navigation that starts while Paths prefetch is in flight',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  let resolve!:(value:{concepts:string[];links:string[]})=>void
  const load=vi.fn(()=>new Promise<{concepts:string[];links:string[]}>(r=>{resolve=r}))
  const first=prefetchAtlasForPaths(client,'demo',load)
  const second=prefetchAtlasForPaths(client,'demo',load)
  expect(load).toHaveBeenCalledTimes(1)
  resolve({concepts:['idea'],links:[]})
  await Promise.all([first,second])
  expect(client.getQueryData(['atlas'])).toEqual({concepts:['idea'],links:[]})
 })
 it('prefetches the complete extreme graph without hydrating unrelated 30k cards or 6k sources',async()=>{
  const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  })
  const api=new DemoAdapter({fixture,ownedFixture:true,
   now:()=>Date.parse('2026-10-31T12:00:00Z'),timeZone:'UTC'})
  const store=(api as unknown as {store:DemoStore}).store
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  await prefetchAtlasForPaths(client,'demo',()=>api.getAtlas())
  const graph=client.getQueryData<{concepts:unknown[];links:unknown[]}>(['atlas'])
  expect(graph?.concepts).toHaveLength(2500)
  expect(graph?.links.length).toBeGreaterThanOrEqual(7900)
  expect(typeof Object.getOwnPropertyDescriptor(store,'notes')?.get).toBe('function')
  expect(typeof Object.getOwnPropertyDescriptor(store,'sources')?.get).toBe('function')
 },30_000)
})
