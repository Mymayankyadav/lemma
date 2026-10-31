// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {DemoAdapter} from '../../../src/data/demo/adapter'
import {makeStressStore} from '../../../src/data/demo/stress'
import type {DemoStore} from '../../../src/data/demo/model'

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore
const now=Date.parse('2026-10-31T12:00:00Z')

describe('FIX #507 direct-route cold stress hydration',()=>{
 it('keeps unrelated Atlas, Sources and Cards virtual until the selected route requests them',async()=>{
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  })
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'})
  const store=(api as unknown as {store:DemoStore}).store
  const deferred=(key:'notes'|'sources'|'concepts')=>
   typeof Object.getOwnPropertyDescriptor(store,key)?.get==='function'
  expect(deferred('notes')).toBe(true)
  expect(deferred('sources')).toBe(true)
  expect(deferred('concepts')).toBe(true)
  const projects=await api.listProjects()
  expect(projects).toHaveLength(60)
  expect(projects.reduce((n,p)=>n+p.cardsCount,0)).toBe(30_000)
  expect(projects.find(p=>p.slug==='stress-project-3')?.sourcesCount).toBe(100)
  // Paths needs only exact counts and titles, not 30k card objects,
  // 6k Source records or 2.5k Atlas ideas.
  expect(deferred('notes')).toBe(true)
  expect(deferred('sources')).toBe(true)
  expect(deferred('concepts')).toBe(true)
  const atlas=await api.getAtlas()
  expect(atlas).toBeDefined()
  expect(deferred('concepts')).toBe(false)
  expect(deferred('notes')).toBe(true)
 },30_000)
 it('defers unrelated heavy data for every cold route, not only Today',()=>{
  const index=readFileSync('src/data/index.ts','utf8')
  expect(index).toContain('deferAtlas:true,deferSources:true')
  expect(index).not.toContain('deferAtlas:initialToday')
  expect(index).not.toContain('deferSources:initialToday')
 })
})
