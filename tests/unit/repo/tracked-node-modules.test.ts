import {execFileSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';

/** Installed dependencies are local artifacts, never entries in Git's tree. */
describe('bug #1215 repository portability',()=>{
 it('does not track a root node_modules file, directory or symlink',()=>{
  // The working tree is intentionally not inspected: npm ci can replace a
  // tracked symlink and hide the defect. HEAD is what a fresh clone receives.
  const tracked=execFileSync('git',['ls-tree','HEAD','--','node_modules'],{
   encoding:'utf8',cwd:process.cwd(),
  }).trim();
  expect(tracked).toBe('');
 });
});
