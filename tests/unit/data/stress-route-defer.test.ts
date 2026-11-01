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

 it('reads a direct extreme Card detail without materializing 30k unrelated notes',async()=>{
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  });
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const deferred=(key:'notes'|'concepts'|'sources')=>
   typeof Object.getOwnPropertyDescriptor(store,key)?.get==='function';
  expect(deferred('notes')).toBe(true);
  const detail=await api.getCard(30_000);
  expect(detail.note.noteNo).toBe(30_000);
  expect(detail.note.front).toContain('card 30000');
  expect(detail.cards).toHaveLength(1);
  await api.getCardHistoryPage(30_000);
  await api.getCardCommentsPage(30_000);
  expect(deferred('notes')).toBe(true);
  expect(deferred('concepts')).toBe(true);
  expect(deferred('sources')).toBe(true);
 },30_000);
 it('preserves eager Card detail and math content for generated first, special and last notes',async()=>{
  const eager=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const lazy=new DemoAdapter({fixture:makeStressStore(seed,'stress',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  for(const no of [1,3,4,5,6,5000]){
   expect(await lazy.getCard(no)).toEqual(await eager.getCard(no));
  }
  const store=(lazy as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(store,'notes')?.get).toBe('function');
 },30_000);
})
