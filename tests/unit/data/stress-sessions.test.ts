import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {makeStressStore, stressSessionEvents} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const seed = JSON.parse(readFileSync('src/data/demo/fixture.json', 'utf8')) as DemoStore;

function expectChronologicalEvents(session: {startedAt:string; lastActivityAt:string; events:{createdAt:string}[]}) {
 const start=Date.parse(session.startedAt), end=Date.parse(session.lastActivityAt);
 expect(Number.isFinite(start)).toBe(true);
 expect(Number.isFinite(end)).toBe(true);
 expect(end).toBeGreaterThanOrEqual(start);
 let previous=start;
 for(const event of session.events) {
  const at=Date.parse(event.createdAt);
  expect(Number.isFinite(at)).toBe(true);
  expect(at).toBeGreaterThanOrEqual(start);
  expect(at).toBeGreaterThanOrEqual(previous);
  expect(at).toBeLessThanOrEqual(end);
  previous=at;
 }
}

describe('ST-0 session history at scale (audit #462)', () => {
 for (const [profile, sessionsPerProject, eventsPerSession] of [
  ['stress', 300, 150], ['extreme', 1000, 400],
 ] as const) {
  it(`${profile} has project-level session volume and real long reasoning histories`, () => {
   const data = makeStressStore(seed, profile);
   const first = data.projects[0];
   const last = data.projects[data.projects.length - 1];
   expect(data.sessions.filter(session => session.projectId === first.id)).toHaveLength(sessionsPerProject);
   expect(data.sessions.filter(session => session.projectId === last.id)).toHaveLength(sessionsPerProject);
   const detail = data.sessions.find(session => session.projectId === first.id && session.number === 7);
   expect(detail?.events).toHaveLength(eventsPerSession);
   expect(detail?.events.some(event => event.kind === 'hint')).toBe(true);
   expect(detail?.events.some(event => event.kind === 'attempt')).toBe(true);
   expect(detail?.events.some(event => event.kind === 'evidence')).toBe(true);
   expect(detail?.events.slice(0, 9).every(event => event.kind === 'hint')).toBe(true);
   expect(detail?.events[9]?.kind).toBe('attempt');
   expect(detail?.events[10]?.kind).toBe('evidence');
   expect(detail?.events[11]?.kind).toBe('recheck');
   expect(new Set(detail?.events.map(event => event.id)).size).toBe(eventsPerSession);
   // Unhydrated fixtures must retain study-day tokens within their own
   // session interval; the adapter later resolves these on its study clock.
   expect(detail?.events.every(event => event.createdAt.startsWith(`@day:-6:`))).toBe(true);
   const authoredFractions=detail?.events.map(event => Number(event.createdAt.split(':')[2]))??[];
   expect(authoredFractions[0]).toBeGreaterThan(0.3);
   expect(authoredFractions.at(-1)).toBeLessThan(0.6);
   expect(authoredFractions).toEqual([...authoredFractions].sort((a,b)=>a-b));
   const lazy = data.sessions.find(session => session.projectId === last.id && session.number === 8);
   expect(lazy?.events).toHaveLength(0);
   expect(lazy && stressSessionEvents(lazy, eventsPerSession)).toHaveLength(eventsPerSession);
   expect(lazy && stressSessionEvents(lazy, eventsPerSession)[9]?.kind).toBe('attempt');
  });
 }
});


describe('deferred browser stress sessions', () => {
 it('preserves all per-project sessions and long histories without allocating 60k rows on Atlas', async () => {
  const data=makeStressStore(seed,'extreme',{deferSessions:true});
  expect(data.sessions).toHaveLength(2);
  expect(data.sessions.find(s=>s.projectId===data.projects[0].id&&s.number===7)?.events).toHaveLength(400);
  expect(data.stressSessionCount).toBe(1000);
  const {DemoAdapter}=await import('../../../src/data/demo/adapter');
  const api=new DemoAdapter({fixture:data,now:()=>Date.UTC(2026,9,31,12)});
  const first=data.projects[0],last=data.projects[data.projects.length-1];
  // The independently merged #479 PDF-page fixture must survive the session
  // virtualization merge; neither feature may erase the other's demo data.
  const source=data.sources.find(item=>item.id.startsWith('stress-source-')&&item.hasText);
  expect(source).toBeDefined();
  const lastPage=source?.pageCount??0;
  expect(lastPage).toBe(3000);
  expect((await api.getSourcePage(source!.id,lastPage))?.body).toContain('Synthetic mathematics notes');
  expect(await api.getSourcePage(source!.id,lastPage+1)).toBeNull();
  expect(await api.listSessions(first.slug)).toHaveLength(1000);
  expect(await api.listSessions(last.slug)).toHaveLength(1000);
  const detail=await api.getSession(first.slug,7);
  expect(detail.events).toHaveLength(400);
  expect(detail.events.some(event=>event.kind==='evidence')).toBe(true);
  expectChronologicalEvents({...detail.summary,events:detail.events});
  expect(Date.parse(detail.summary.lastActivityAt)).toBeLessThanOrEqual(Date.UTC(2026,9,31,12));
  const lazy=await api.getSession(last.slug,8);
  expect(lazy.events).toHaveLength(400);
  expectChronologicalEvents({...lazy.summary,events:lazy.events});
  expect(Date.parse(lazy.summary.lastActivityAt)).toBeLessThanOrEqual(Date.UTC(2026,9,31,12));
  // Checkpoint view scans due cards; keep this assertion focused on virtual
  // evidence rather than making the unit test benchmark all 30k review cards.
  const checkpointApi=new DemoAdapter({fixture:{...data,notes:data.notes.slice(0,12)},now:()=>Date.UTC(2026,9,31,12)});
  const checkpoint=await checkpointApi.getCheckpoint(first.slug,'CP7');
  expect(checkpoint.events.some(event=>event.kind==='evidence')).toBe(true);
  const insights=await api.getInsightData(7);
  expect(insights.aggregate?.sessions).toBeGreaterThan(0);
  expect(insights.aggregate?.minutes).toBe((insights.aggregate?.sessions??0)*seed.sessions[0].minutes);
 }, 30_000);
});
