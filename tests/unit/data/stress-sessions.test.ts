import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {makeStressStore, stressSessionEvents} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const seed = JSON.parse(readFileSync('src/data/demo/fixture.json', 'utf8')) as DemoStore;

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
  expect(data.sessions).toHaveLength(0);
  expect(data.stressSessionCount).toBe(1000);
  const {DemoAdapter}=await import('../../../src/data/demo/adapter');
  const api=new DemoAdapter({fixture:data,now:()=>Date.UTC(2026,9,31,12)});
  const first=data.projects[0],last=data.projects[data.projects.length-1];
  expect(await api.listSessions(first.slug)).toHaveLength(1000);
  expect(await api.listSessions(last.slug)).toHaveLength(1000);
  const detail=await api.getSession(first.slug,7);
  expect(detail.events).toHaveLength(400);
  expect(detail.events.some(event=>event.kind==='evidence')).toBe(true);
  const lazy=await api.getSession(last.slug,8);
  expect(lazy.events).toHaveLength(400);
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
