import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {makeStressStore, stressSourcePage} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const seed = JSON.parse(readFileSync('src/data/demo/fixture.json', 'utf8')) as DemoStore;

describe('ST-0 sources at scale (audit #461)', () => {
 for (const [profile, sourcesPerProject, pagesPerPdf] of [
  ['stress', 30, 1200], ['extreme', 100, 3000],
 ] as const) {
  it(`${profile} models full source-list and page-viewer pressure without PDF binaries`, () => {
   const data = makeStressStore(seed, profile);
   const first = data.projects[0];
   const last = data.projects[data.projects.length - 1];
   for (const project of [first, last]) {
    const sources = data.sources.filter(source => source.projectId === project.id);
    expect(sources).toHaveLength(sourcesPerProject);
    expect(sources.some(source => source.pageCount === pagesPerPdf)).toBe(true);
    const representative = sources.find(source => source.id.startsWith('stress-source-') && source.hasText);
    expect(representative?.pages).toHaveLength(0);
    expect(representative && stressSourcePage(representative, 1)?.page).toBe(1);
    expect(representative && stressSourcePage(representative, pagesPerPdf)?.body).toContain('Synthetic mathematics notes');
    expect(representative && stressSourcePage(representative, pagesPerPdf + 1)).toBeNull();
   }
   expect(new Set(data.sources.map(source => source.id)).size).toBe(data.sources.length);
   expect(data.sources.every(source => data.projects.some(project => project.id === source.projectId))).toBe(true);
   expect(data.sources.every(source => (source.bytes ?? 0) <= 50 * 1024 * 1024)).toBe(true);
  });
 }
});
