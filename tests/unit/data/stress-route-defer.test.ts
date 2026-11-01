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


 it('opens a project without materializing every unrelated generated card or Atlas idea',async()=>{
  const options={deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true};
  const eager=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const lazy=new DemoAdapter({fixture:makeStressStore(seed,'stress',options),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const expected=await eager.getProject('stress-project-3');
  const actual=await lazy.getProject('stress-project-3');
  expect(actual).toEqual(expected);
  const store=(lazy as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(store,'notes')?.get).toBe('function');
  expect(typeof Object.getOwnPropertyDescriptor(store,'concepts')?.get).toBe('function');
  expect(typeof Object.getOwnPropertyDescriptor(store,'sources')?.get).toBe('function');
  const extreme=new DemoAdapter({fixture:makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const detail=await extreme.getProject('stress-project-3');
  expect(detail.sources).toHaveLength(100);
  const extremeStore=(extreme as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(extremeStore,'notes')?.get).toBe('function');
  expect(typeof Object.getOwnPropertyDescriptor(extremeStore,'sources')?.get).toBe('function');
  expect(typeof Object.getOwnPropertyDescriptor(extremeStore,'concepts')?.get).toBe('function');
 },30_000);


 it('keeps the 30k synthetic note collection deferred for individual checkpoint details',async()=>{
  const eager=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const lazy=new DemoAdapter({fixture:makeStressStore(seed,'stress',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  for(const code of ['CP1','CP4','CP36','CP40']){
   const expected=await eager.getCheckpoint('stress-project-3',code);
   const actual=await lazy.getCheckpoint('stress-project-3',code);
   expect(actual).toEqual(expected);
  }
  const store=(lazy as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(store,'notes')?.get).toBe('function');
  expect(typeof Object.getOwnPropertyDescriptor(store,'concepts')?.get).toBe('function');
  const extreme=new DemoAdapter({fixture:makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  expect((await extreme.getCheckpoint('stress-project-3','CP4')).cardsCount).toBe(167);
  expect((await extreme.getCheckpoint('stress-project-3','CP40')).cardsCount).toBe(0);
  const extremeStore=(extreme as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(extremeStore,'notes')?.get).toBe('function');
 },30_000);


 it('constructs only sessions for the requested checkpoint in an extreme project',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const subject=api as unknown as {
   virtualStressSession:(project:unknown,number:number)=>unknown;
  };
  const original=subject.virtualStressSession.bind(api);
  let generated=0;
  subject.virtualStressSession=(project,number)=>{
   generated++;
   return original(project,number);
  };
  const detail=await api.getCheckpoint('stress-project-3','CP4');
  expect(detail.sessions).toHaveLength(28);
  expect(generated).toBeLessThan(40);
 },30_000);


 it('reads a generated session without hydrating unrelated synthetic notes',async()=>{
  const eager=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const lazy=new DemoAdapter({fixture:makeStressStore(seed,'stress',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  expect(await lazy.getSession('stress-project-3',7))
   .toEqual(await eager.getSession('stress-project-3',7));
  const store=(lazy as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(store,'notes')?.get).toBe('function');
  expect(typeof Object.getOwnPropertyDescriptor(store,'concepts')?.get).toBe('function');
  expect(typeof Object.getOwnPropertyDescriptor(store,'sources')?.get).toBe('function');
 },30_000);

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

 it('paginates 30k generated Cards without forcing future notes or Atlas',async()=>{
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  });
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const first=await api.searchCardsPage({query:''});
  expect(first.rows).toHaveLength(50);
  expect(first.rows[0].noteNo).toBe(30_000);
  expect(first.nextOffset).toBe(50);
  const filtered=await api.searchCardsPage({query:'card 30000'});
  expect(filtered.rows.map(row=>row.noteNo)).toContain(30_000);
  for(const key of ['notes','concepts','sources'] as const)
   expect(typeof Object.getOwnPropertyDescriptor(store,key)?.get).toBe('function');
 },30_000);
 it('matches eager stress Cards pages with filters, search and offsets',async()=>{
  const eager=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const lazy=new DemoAdapter({fixture:makeStressStore(seed,'stress',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const filters=[
   {query:''},{query:'',offset:50},{query:'card 5000'},
   {query:'matrix'},{query:'',projectSlug:'stress-project-3'},
   {query:'',checkpointCode:'CP4'},{query:'',state:2 as const},
   {query:'',noteStatus:'deleted' as const},{query:'',hasOpenComments:true},
  ];
  for(const filter of filters)
   expect(await lazy.searchCardsPage(filter)).toEqual(await eager.searchCardsPage(filter));
  const store=(lazy as unknown as {store:DemoStore}).store;
  expect(typeof Object.getOwnPropertyDescriptor(store,'notes')?.get).toBe('function');
 },30_000);
})
