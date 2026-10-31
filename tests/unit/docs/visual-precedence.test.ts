import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const root=process.cwd();
const agents=readFileSync(resolve(root,'AGENTS.md'),'utf8');
const plan=readFileSync(resolve(root,'plan.md'),'utf8');

describe('canonical v4 visual precedence',()=>{
 it('places the owner-approved v4 look before v3 and stress in the agent entrypoint',()=>{
  const visual=agents.split('\n').find(line=>line.startsWith('- Visual truth:'));
  expect(visual).toBeDefined();
  expect(visual).toContain('docs/spec/v4-look.md');
  expect(visual).toContain('docs/spec/v3.md');
  expect(visual).toContain('docs/spec/stress.md');
  expect(visual!.indexOf('docs/spec/v4-look.md')).toBeLessThan(visual!.indexOf('docs/spec/v3.md'));
  expect(visual).toMatch(/overrides v3/);
 });
 it('marks the historical dark-only decision as superseded by Graph day and night',()=>{
  const decision=plan.split('\n').find(line=>/^\| 9 \|/.test(line));
  expect(decision).toContain('Superseded');
  expect(decision).toContain('Graph day and Graph night');
  expect(decision).toContain('docs/spec/v4-look.md');
  expect(decision).toContain('docs/spec/v3.md');
 });
});
