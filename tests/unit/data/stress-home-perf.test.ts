// @vitest-environment node
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
import {hydrateFixture} from '../../../src/data/demo/hydrate';
import type {DemoStore} from '../../../src/data/demo/model';

const seed=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
const now=Date.parse('2026-10-31T12:00:00Z');

describe('FIX #507: cold Today stress summary',()=>{
 it('does not deep-clone seed histories discarded by the 5k/30k stress generator',()=>{
  const cloned=vi.spyOn(globalThis,'structuredClone');
  try{
   const data=makeStressStore(seed,'stress',{deferSessions:true});
   const source=cloned.mock.calls.map(([value])=>value).find(value=>
    value&&typeof value==='object'&&'projects' in value&&'reviews' in value&&'notes' in value) as DemoStore;
   expect(source).toBeDefined();
   // The stress generator discards all seed reviews, all but one template
   // note/session, and the seed diagnostics. They must not be cloned first.
   expect(source.reviews).toHaveLength(0);
   expect(source.notes).toHaveLength(1);
   expect(source.sessions).toHaveLength(1);
   expect(source.misconceptions).toHaveLength(0);
   expect(source.checkpointEvents).toHaveLength(0);
   // This is a real 5,000-card fixture, not a smaller stress profile.
   expect(data.notes).toHaveLength(5000);
   expect(data.stressReviewCount).toBe(50000);
  }finally{cloned.mockRestore()}
 },30_000);

 it('memoizes repeated civil-day fixture tokens in the 30,000-card stress profile',()=>{
  const input=makeStressStore(seed,'extreme');
  const formatter=vi.spyOn(Intl.DateTimeFormat.prototype,'formatToParts');
  try{
   const hydrated=hydrateFixture(input,now,'UTC');
   expect(hydrated.notes).toHaveLength(30_000);
   expect(hydrated.notes[0].cards[0].state.due).not.toMatch(/^@/);
   expect(hydrated.notes[29_999].cards[0].state.due).not.toMatch(/^@/);
   // Only distinct @due/@day tokens should require expensive timezone work.
   expect(formatter.mock.calls.length).toBeLessThan(4_000);
  }finally{formatter.mockRestore()}
 },30_000);

 it('reuses the parsed seed for repeated default demo adapters',()=>{
  const parse=vi.spyOn(JSON,'parse');
  try{
   const first=new DemoAdapter({now:()=>now,timeZone:'UTC'});
   const second=new DemoAdapter({now:()=>now,timeZone:'UTC'});
   expect(first).not.toBe(second);
   // hydrateFixture clones the seed, so no new JSON parse is needed.
   expect(parse).not.toHaveBeenCalled();
  }finally{parse.mockRestore()}
 });

 it('hydrates a private copy and preserves the original fixture tokens',()=>{
  const input=structuredClone(seed);
  const original=JSON.stringify(input);
  const hydrated=hydrateFixture(input,now,'UTC');
  expect(JSON.stringify(input)).toBe(original);
  expect(hydrated).not.toBe(input);
  expect(hydrated.notes[0].cards[0].state.due).not.toMatch(/^@/);
  hydrated.notes[0].note.front='Changed only in the hydrated copy';
  expect(input.notes[0].note.front).not.toBe('Changed only in the hydrated copy');
 });
 it('parses each distinct due timestamp once across cold Today and deck counts',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'extreme',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const parse=vi.spyOn(Date,'parse');
  try{
   const home=await api.getHome();
   const decks=await api.getDeckTree();
   expect(home.due).toBe(4000);
   expect(decks.reduce((sum,deck)=>sum+deck.due,0)).toBe(4000);
   // 30k notes have only two due timestamps. Re-parsing them 60k times
   // needlessly blocks 4x CPU first paint; other date parsing remains valid.
   expect(parse.mock.calls.length).toBeLessThan(1000);
  }finally{parse.mockRestore()}
 },30_000);

 it('counts project cards and due cards in one Today note traversal',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const notes=store.notes;
  let scans=0;
  Object.defineProperty(store,'notes',{configurable:true,get(){scans++;return notes}});
  const home=await api.getHome();
  expect(home.due).toBe(600);
  expect(home.projects.reduce((sum,p)=>sum+p.cardsCount,0)).toBe(5000);
  // A separate full notes scan for cardsCount doubles Today startup work.
  expect(scans).toBe(1);
 },30_000);

 it('reuses one exact due-card scan across Today and DeckTree',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'stress',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const notes=store.notes;
  let reads=0;
  Object.defineProperty(store,'notes',{configurable:true,get(){reads++;return notes}});
  const home=await api.getHome();
  const afterHome=reads;
  const decks=await api.getDeckTree();
  expect(home.due).toBe(600);
  expect(decks.reduce((sum,deck)=>sum+deck.due,0)).toBe(home.due);
  // Re-scanning all 5k cards for DeckTree after Home already counted them
  // adds unnecessary 4x-CPU startup work. Other checkpoint reads are allowed.
  expect(reads).toBe(afterHome);
 },30_000);

 it('invalidates the due snapshot on project archive and direct note suspension',async()=>{
  const api=new DemoAdapter({now:()=>now,timeZone:'UTC'});
  const first=await api.getHome();
  const decks=await api.getDeckTree();
  const target=first.projects.find(p=>p.status!=='archived'&&decks.some(d=>d.key==='project:'+p.slug&&d.due>0));
  expect(target).toBeDefined();
  const targetDue=decks.find(d=>d.key==='project:'+target!.slug)!.due;
  await api.updateProject(target!.id,{status:'archived'});
  const afterArchive=await api.getHome();
  expect(afterArchive.due).toBe(first.due-targetDue);
  const store=(api as unknown as {store:DemoStore}).store;
  const candidate=store.notes.find(n=>n.note.status==='active'&&
   store.projects.some(p=>p.id===n.projectId&&p.status!=='archived'&&!p.system)&&
   n.cards.some(card=>card.state.state>0&&Date.parse(card.state.due)<=now));
  if(candidate){
   const affected=candidate.cards.filter(card=>card.state.state>0&&Date.parse(card.state.due)<=now).length;
   await api.setNoteStatus(candidate.note.noteNo,'suspended');
   expect((await api.getHome()).due).toBe(afterArchive.due-affected);
  }
 });

 it('expires cached due counts exactly when a future card becomes due',async()=>{
  const fixture=structuredClone(seed);
  const target=fixture.notes.find(n=>n.note.status==='active'&&
   fixture.projects.some(p=>p.id===n.projectId&&p.status!=='archived'&&!p.system)&&n.cards.length>0);
  expect(target).toBeDefined();
  target!.cards[0].state.state=2;
  target!.cards[0].state.due=new Date(now+1000).toISOString();
  let current=now;
  const api=new DemoAdapter({fixture,now:()=>current,timeZone:'UTC'});
  const before=await api.getHome();
  current=now+2000;
  const after=await api.getHome();
  expect(after.due).toBe(before.due+1);
 });

 it('builds the deck tree without recomputing 60 full project summaries',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'extreme',{deferSessions:true}),
   ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const summaries=vi.spyOn(api,'listProjects').mockImplementation(async()=>{
   throw Error('DeckTree must not recompute full project summaries');
  });
  try{
   const decks=await api.getDeckTree();
   expect(decks).toHaveLength(60);
   expect(decks.reduce((sum,deck)=>sum+deck.due,0)).toBe(4000);
   expect(summaries).not.toHaveBeenCalled();
  }finally{summaries.mockRestore()}
 },30_000);

 it('preserves most-recent-project-first deck ordering without full summary recomputation',async()=>{
  const fixture=makeStressStore(seed,'stress',{deferSessions:true});
  fixture.projects[0].lastActivityAt='@day:-30:0.5:0';
  fixture.projects[1].lastActivityAt='@day:0:0.5:0';
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const expected=(await api.listProjects()).filter(p=>p.status!=='archived')
   .map(p=>'project:'+p.slug);
  const decks=await api.getDeckTree();
  expect(decks.map(deck=>deck.key)).toEqual(expected);
 },30_000);

 it('keeps exact 4,000-card deck counts without materialising every ReviewItem',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'extreme'),now:()=>now,timeZone:'UTC'});
  const started=performance.now();
  const decks=await api.getDeckTree();
  const elapsed=performance.now()-started;
  expect(decks).toHaveLength(60);
  expect(decks.reduce((sum,deck)=>sum+deck.due,0)).toBe(4000);
  for(const deck of decks)
   expect(deck.children.reduce((sum,child)=>sum+child.due,0)).toBe(deck.due);
  expect(elapsed).toBeLessThan(1500);
 },30_000);

 it('derives the extreme project and due summaries without per-card/per-checkpoint quadratic scans',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(seed,'extreme'),now:()=>now,timeZone:'UTC'});
  const started=performance.now();
  const home=await api.getHome();
  const elapsed=performance.now()-started;
  expect(home.projects).toHaveLength(60);
  expect(home.due).toBe(4000);
  expect(home.pendingProposals).toBe(600);
  const baseline=home.projects.find(p=>p.id===seed.projects[0].id);
  expect(baseline).toMatchObject({done:3,total:36});
  expect(home.projects.find(p=>p.slug==='stress-project-3')).toMatchObject({done:3,total:100});
  // Project counts must stay exact when summary scans are replaced with
  // per-project indexes; the 30,000 cards are distributed evenly.
  expect(baseline).toMatchObject({cardsCount:500,sessionsCount:1000,sourcesCount:100});
  // Current stress fixture materialises 1,000 sessions PER project, not only
  // on the baseline project. Preserve that scale when summaries are indexed.
  expect(home.projects.find(p=>p.slug==='stress-project-3'))
   .toMatchObject({cardsCount:500,sessionsCount:1000,sourcesCount:100});
  // This is an unthrottled adapter-only guard. The separate ST-0 browser gate
  // retains its stricter 1,500ms end-to-end limit under actual 4x CPU.
  expect(elapsed).toBeLessThan(1500);
 },30_000);

 it('keeps session counts scoped to their own project after the 60-project fixture grows',async()=>{
  const fixture=makeStressStore(seed,'stress');
  const other=fixture.projects.find(p=>p.slug==='stress-project-3')!;
  fixture.sessions=fixture.sessions.filter(s=>s.projectId!==other.id);
  const api=new DemoAdapter({fixture,now:()=>now,timeZone:'UTC'});
  const projects=await api.listProjects();
  expect(projects.find(p=>p.id===other.id)?.sessionsCount).toBe(0);
  expect(projects.find(p=>p.id===seed.projects[0].id)?.sessionsCount).toBe(300);
 },30_000);

 it('preserves per-project virtual session totals without allocating 60,000 sessions',async()=>{
  const fixture=makeStressStore(seed,'extreme',{deferSessions:true});
  expect(fixture.sessions).toHaveLength(2);
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const home=await api.getHome();
  expect(home.projects.find(p=>p.id===seed.projects[0].id)?.sessionsCount).toBe(1000);
  expect(home.projects.find(p=>p.slug==='stress-project-3')?.sessionsCount).toBe(1000);
 },30_000);
 it('keeps the 30k-card fixture virtual through first Today and deck reads, then materializes on card detail',async()=>{
  const fixture=makeStressStore(seed,'extreme',{deferSessions:true,deferNotes:true});
  expect(fixture.notes).toHaveLength(0);
  expect(fixture.stressNoteCount).toBe(30_000);
  expect(fixture.stressDueCount).toBe(4_000);
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const home=await api.getHome();
  const decks=await api.getDeckTree();
  const forecast=await api.getReviewForecast();
  expect(home.due).toBe(4000);
  expect(home.projects).toHaveLength(60);
  expect(home.projects.reduce((n,p)=>n+p.cardsCount,0)).toBe(30000);
  expect(decks.reduce((n,d)=>n+d.due,0)).toBe(4000);
  expect(forecast[0].due).toBe(4000);
  expect(Object.getOwnPropertyDescriptor(store,'notes')?.get).toBeTypeOf('function');
  const detail=await api.getCard(30000);
  expect(detail.note.noteNo).toBe(30000);
  expect(store.notes).toHaveLength(30000);
  expect(store.notes[29999].cards[0].state.due).not.toMatch(/^@/);
  expect((await api.getHome()).due).toBe(4000);
 },30_000);

 it('keeps the browser stress adapter on the deferred-card path',()=>{
  const entry=readFileSync('src/data/index.ts','utf8');
  expect(entry).toContain('{deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true}');
  expect(entry).toContain('deferAtlas:');
 });

 it('builds Atlas from virtual stress ideas and links without allocating unlinked cards',async()=>{
  const fixture=makeStressStore(seed,'extreme',{deferSessions:true,deferNotes:true});
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const graph=await api.getAtlas();
  expect(graph.concepts.length).toBeGreaterThanOrEqual(2500);
  expect(graph.links.length).toBeGreaterThanOrEqual(8000);
  expect(Object.getOwnPropertyDescriptor(store,'notes')?.get).toBeTypeOf('function');
 },30_000);

 it('defers 2,500 ideas and 8,000 links on initial Today, but materializes an exact Atlas on demand',async()=>{
  const fixture=makeStressStore(seed,'extreme',{deferSessions:true,deferNotes:true,deferAtlas:true});
  expect(fixture.concepts.length).toBeLessThan(2500);
  expect(fixture.links.length).toBeLessThan(8000);
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  await api.getHome();
  await api.getDeckTree();
  expect(Object.getOwnPropertyDescriptor(store,'concepts')?.get).toBeTypeOf('function');
  expect(Object.getOwnPropertyDescriptor(store,'links')?.get).toBeTypeOf('function');
  const atlas=await api.getAtlas();
  expect(atlas.concepts.length).toBeGreaterThanOrEqual(2500);
  expect(atlas.links.length).toBeGreaterThanOrEqual(8000);
  expect(Object.getOwnPropertyDescriptor(store,'concepts')?.get).toBeUndefined();
 },30_000);

 it('keeps 6,000 source records virtual for Paths counts, then materializes exact sources on demand',async()=>{
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  });
  expect(fixture.sources.length).toBeLessThan(6000);
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>now,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  const home=await api.getHome();
  expect(home.projects).toHaveLength(60);
  expect(home.projects.every(p=>p.sourcesCount===100)).toBe(true);
  expect(home.projects.find(p=>p.slug==='stress-project-3')?.sourceTitles)
   .toContain('Source 100: mathematical notes and proofs');
  expect(Object.getOwnPropertyDescriptor(store,'sources')?.get).toBeTypeOf('function');
  const projects=await api.listProjects();
  expect(projects.every(p=>p.sourcesCount===100)).toBe(true);
  expect(projects.find(p=>p.slug==='stress-project-3')?.sourceTitles)
   .toContain('Source 100: mathematical notes and proofs');
  // Paths needs only exact source counts/titles; a source-specific route must
  // still hydrate every actual source record with its original dates/pages.
  expect(Object.getOwnPropertyDescriptor(store,'sources')?.get).toBeTypeOf('function');
  const project=projects.find(p=>p.slug==='stress-project-3')!;
  expect((await api.getSourceTranscriptionStats(project.id)).length).toBe(100);
  expect(Object.getOwnPropertyDescriptor(store,'sources')?.get).toBeUndefined();
  expect(store.sources.length).toBeGreaterThanOrEqual(6000);
  expect(store.sources.find(p=>p.id==='stress-source-3-99')?.createdAt).not.toMatch(/^@/);
  const full=new DemoAdapter({fixture:makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,
  }),ownedFixture:true,now:()=>now,timeZone:'UTC'});
  expect(store.sources).toEqual((full as unknown as {store:DemoStore}).store.sources);
 },30_000);

 it('configures demand-driven source deferral for every cold document',()=>{
  const entry=readFileSync('src/data/index.ts','utf8');
  expect(entry).toContain('deferSources:true');
  expect(entry).not.toContain('deferSources:initialToday');
 });

 it('counts virtual future cards by project without visiting all 30k records on cold Today',async()=>{
  let current=now;
  const fixture=makeStressStore(seed,'extreme',{
   deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true,
  });
  const api=new DemoAdapter({fixture,ownedFixture:true,now:()=>current,timeZone:'UTC'});
  const store=(api as unknown as {store:DemoStore}).store;
  let indexedReads=0;
  store.projects=new Proxy(store.projects,{
   get(target,key,receiver){
    if(typeof key==='string'&&/^\\d+$/.test(key))indexedReads++;
    return Reflect.get(target,key,receiver);
   },
  });
  const home=await api.getHome();
  expect(home.due).toBe(4000);
  expect(home.projects.reduce((sum,project)=>sum+project.cardsCount,0)).toBe(30_000);
  expect((await api.getDeckTree()).reduce((sum,deck)=>sum+deck.due,0)).toBe(4000);
  // Project-card totals and future forecast are cyclic arithmetic, not
  // 30,000 repeated array/Map reads on the first 4x CPU screen.
  expect(indexedReads).toBeLessThan(2000);
  current+=15*24*60*60*1000;
  expect((await api.getHome()).due).toBe(30_000);
  expect((await api.getDeckTree()).reduce((sum,deck)=>sum+deck.due,0)).toBe(30_000);
 },30_000);

});
