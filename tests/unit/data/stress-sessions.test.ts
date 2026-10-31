import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {makeStressStore} from '../../../src/data/demo/stress';
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
   expect(detail?.events.slice(0, 12).every(event => event.kind === 'attempt')).toBe(true);
   expect(detail?.events.slice(12, 24).every(event => event.kind === 'hint')).toBe(true);
   expect(new Set(detail?.events.map(event => event.id)).size).toBe(eventsPerSession);
  });
 }
});
