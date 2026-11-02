import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {makeStressNotes} from '../../../src/data/demo/stress';
import type {DemoStore} from '../../../src/data/demo/model';

const source=readFileSync('src/data/demo/stress.ts','utf8');

describe('FIX-648c generated stress-card template headroom',()=>{
 it('constructs immutable long fronts and math examples once, outside the per-page generator',()=>{
  const start=source.indexOf('export function makeStressNotes(');
  const end=source.indexOf('/** Deterministic full Atlas',start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const generator=source.slice(start,end);
  expect(generator).not.toMatch(/\.repeat\(|Array\.from\(/);
  for(const name of ['STRESS_LONG_FRONT','STRESS_LONG_BACK','STRESS_MATRIX','STRESS_ALIGNED','STRESS_SUM','STRESS_INLINE']){
   expect(source,name).toContain('const '+name+' =');
   expect(generator,name).toContain(name);
  }
 });
 it('preserves all six representative long/math fronts and due semantics',()=>{
  const fixture=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
  const originalFront=fixture.notes[0].note.front;
  const rows=makeStressNotes(fixture.notes[0],fixture.projects,7,4);
  expect(rows).toHaveLength(7);
  expect(rows[0].note.front).toHaveLength(1500);
  expect(rows[0].note.back).toHaveLength(3000);
  expect(rows[2].note.front).toContain(String.raw`\begin{pmatrix}`);
  expect(rows[3].note.front).toContain(String.raw`\begin{aligned}`);
  expect(rows[4].note.front).toContain(String.raw`\sum_{i=1}^{60}`);
  expect(rows[5].note.front).toContain(String.raw`\operatorname{`);
  expect(rows[6].note.front).toBe('Recall the definition in card 7?');
  expect(rows[0].cards[0].state.due).toBe('@due:-1');
  expect(rows[4].cards[0].state.due).toBe('@due:14');
  expect(fixture.notes[0].note.front).toBe(originalFront);
 });
});
