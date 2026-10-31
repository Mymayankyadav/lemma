import {describe,expect,it,vi} from 'vitest'
import {QueryClient} from '@tanstack/react-query'
import {prefetchAtlasForPaths} from '../../../src/features/projects/atlasPrefetch'

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
})
