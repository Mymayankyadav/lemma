import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeStressStore, type StressProfile } from '../src/data/demo/stress';
import type { DemoStore } from '../src/data/demo/model';

/** Generate deterministic JSON snapshots for offline inspection and CI fixture checks. */
const profile = process.argv[2] as StressProfile | undefined;
if (profile !== 'stress' && profile !== 'extreme') {
  throw Error('Usage: npx tsx scripts/make-stress-data.ts <stress|extreme>');
}
const base = JSON.parse(readFileSync('src/data/demo/fixture.json', 'utf8')) as DemoStore;
const output = makeStressStore(base, profile);
const directory = resolve('test-results/stress');
mkdirSync(directory, {recursive: true});
const filename = resolve(directory, `${profile}.json`);
writeFileSync(filename, JSON.stringify(output));
console.log(JSON.stringify({
  profile, seed: output.seed, projects: output.projects.length,
  subjects: output.subjects.length, checkpoints: output.checkpoints.length,
  ideas: output.concepts.length, links: output.links.length,
  cards: output.notes.reduce((n, note) => n + note.cards.length, 0),
  due: output.notes.filter(note => note.cards.some(card => card.state.due === '@due:-1')).length,
  proposals: output.proposals.length, sessions: output.sessions.length,
  file: filename,
}, null, 2));
