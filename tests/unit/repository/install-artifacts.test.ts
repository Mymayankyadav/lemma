// Regression for bug #1215: installation artifacts belong to npm, never Git.
// Check the actual index, not the working tree: npm ci may replace a
// mistakenly tracked symlink with a healthy local directory before tests run.
import {describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
describe('repository install artifacts',()=>{
 it('never tracks a root node_modules entry, including a machine-local symlink',()=>{
  const entries=execFileSync('git',['ls-files','--stage','--','node_modules'],{
   cwd:root,encoding:'utf8'
  }).trim();
  expect(entries).toBe('');
 });
});
