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
  expect(home.projects.find(p=>p.slug==='stress-project-3'))
   .toMatchObject({cardsCount:500,sessionsCount:0,sourcesCount:100});
  // This is an unthrottled adapter-only guard. The separate ST-0 browser gate
  // retains its stricter 1,500ms end-to-end limit under actual 4x CPU.
  expect(elapsed).toBeLessThan(1500);
 },30_000);
});
