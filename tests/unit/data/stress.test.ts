import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeStressStore } from '../../../src/data/demo/stress';
import type { DemoStore } from '../../../src/data/demo/model';

const original = JSON.parse(readFileSync('src/data/demo/fixture.json', 'utf8')) as DemoStore;
describe('ST-0 deterministic stress data', () => {
 for (const [profile, projects, ideas, links, cards, due, proposals, sessions] of [
  ['stress', 15, 600, 1500, 5000, 600, 150, 300],
  ['extreme', 60, 2500, 8000, 30000, 4000, 600, 1000],
 ] as const) {
  it(`${profile}: preserves scale and referential integrity`, () => {
   const data = makeStressStore(original, profile);
   expect(data.projects).toHaveLength(projects);
   expect(data.concepts).toHaveLength(ideas);
   expect(data.links).toHaveLength(links);
   expect(data.notes).toHaveLength(cards);
   expect(data.notes.filter(n => n.cards[0].state.due === '@due:-1')).toHaveLength(due);
   // Backlog size must not inflate the owner's daily quota or violate settings limits.
   expect(data.settings.reviewsPerDay).toBe(200);
   expect(data.settings.newPerDay).toBe(20);
   expect(data.settings.reviewsPerDay).toBeLessThanOrEqual(2000);
   expect(data.settings.newPerDay).toBeLessThanOrEqual(200);
   expect(data.proposals).toHaveLength(proposals);
   const planProposal = data.proposals.find(p => p.id === 'proposal-6');
   expect(planProposal?.kind).toBe('plan_change');
   expect(planProposal?.planChange?.ops.length).toBeGreaterThan(0);
   expect(planProposal?.projectSlug).toBe(data.projects[projects - 1].slug);
   expect(data.sessions).toHaveLength(sessions);
   expect(data.sessions.filter(s=>s.projectId===data.projects[0].id)).toHaveLength(sessions);
   expect(data.sources.filter(s=>s.projectId===data.projects[0].id)).toHaveLength(profile==='stress'?30:100);
   // Every project carries the same F2 source-list pressure; no single-project
   // shortcut may make the 60-project library look artificially cheap.
   const sourcesByProject=new Map<string,number>();
   for(const source of data.sources)
    sourcesByProject.set(source.projectId,(sourcesByProject.get(source.projectId)??0)+1);
   expect(data.projects.every(p=>sourcesByProject.get(p.id)===(profile==='stress'?30:100))).toBe(true);
   expect(new Set(data.sources.map(s=>s.id)).size).toBe(data.sources.length);
   const sourceShelf=data.sources.filter(s=>s.projectId===data.projects[0].id);
   expect(new Set(sourceShelf.map(s=>s.id)).size).toBe(sourceShelf.length);
   expect(new Set(sourceShelf.map(s=>s.short)).size).toBe(sourceShelf.length);
   const stressPdfs=sourceShelf.filter(s=>s.id.startsWith('stress-source-'));
   expect(stressPdfs.length).toBeGreaterThan(0);
   expect(stressPdfs.every(s=>s.pageCount===(profile==='stress'?1200:3000))).toBe(true);
   // Large PDFs are represented by metadata until a page is requested. Never
   // allocate 100 * 3,000 fake page bodies in the in-memory stress fixture.
   expect(stressPdfs.every(s=>s.pages.length===0)).toBe(true);
   expect(stressPdfs.every(s=>s.status==='ready')).toBe(true);
   const longSession=data.sessions.find(s=>s.projectId===data.projects[0].id&&s.number===7);
   expect(longSession?.events).toHaveLength(profile==='stress'?150:400);
   expect(longSession?.events.some(e=>e.kind==='attempt')).toBe(true);
   expect(longSession?.events.some(e=>e.kind==='evidence')).toBe(true);
   expect(longSession?.events.some(e=>e.kind==='recheck')).toBe(true);
   const projectIds = new Set(data.projects.map(p => p.id));
   const conceptIds = new Set(data.concepts.map(c => c.id));
   expect(projectIds.size).toBe(projects);
   expect(conceptIds.size).toBe(ideas);
   expect(new Set(data.notes.map(n => n.note.noteNo)).size).toBe(cards);
   expect(data.notes.every(n => projectIds.has(n.projectId))).toBe(true);
   expect(data.checkpoints.every(cp => projectIds.has(cp.projectId))).toBe(true);
   expect(data.links.every(l => conceptIds.has(l.fromId) && conceptIds.has(l.toId))).toBe(true);
   expect(data.checkpoints.filter(cp => cp.projectId === data.projects[0].id)).toHaveLength(36);
   expect(data.checkpoints.filter(cp => cp.projectId === data.projects[0].id).every(cp => !cp.stage)).toBe(true);
   expect(data.checkpoints.filter(cp => cp.projectId === data.projects[3].id)).toHaveLength(profile === 'stress' ? 40 : 100);
   expect(new Set(data.checkpoints.filter(cp => cp.projectId === data.projects[3].id).map(cp => cp.stage)).size).toBe(15);
   expect(data.notes[0].note.front.length).toBe(1500);
   expect(data.notes[0].note.back.length).toBe(3000);
   expect(data.notes[2].note.front).toContain('\\begin{pmatrix}');
   expect(data.notes[3].note.front).toContain('\\begin{aligned}');
   expect(data.notes[4].note.front).toContain('\\sum_');
   expect(data.seed).toBe(profile === 'stress' ? 2026103101 : 2026103102);
   expect(data.projects[0].title).toBe(original.projects[0].title);
  });
 }
 it('reproduces the same fixture without mutating the ordinary demo', () => {
  const first = makeStressStore(original, 'stress');
  const second = makeStressStore(original, 'stress');
  expect(first).toEqual(second);
  expect(original.notes).toHaveLength(90);
  expect(original.projects).toHaveLength(3);
 });
});
