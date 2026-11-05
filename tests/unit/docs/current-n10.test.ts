import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Regression for #857: a merged migration must not be described as an
// unmerged PR, and checked-in schema must not be conflated with deployment.
const current=readFileSync('CURRENT.md','utf8');
const migration=readFileSync('supabase/migrations/20261105141000_v6_study.sql','utf8');

describe('bug #857: N10 status in CURRENT.md',()=>{
 it('records the merged schema and identifies all four new tables',()=>{
  expect(current).toContain('N10 merged in PR #851');
  expect(current).toContain('supabase/migrations/20261105141000_v6_study.sql');
  for(const table of ['study_entries','study_intervals','calendar_blocks','command_receipts']){
   expect(migration).toContain('create table public.'+table);
   expect(current).toContain('`'+table+'`');
  }
  expect(current).not.toContain('N10 in-progress PR #851');
  expect(current).not.toContain('not yet on main or deployed');
 });
 it('does not assert unverified remote deployment or finished downstream work',()=>{
  expect(current).toContain('application of this migration to the remote Supabase database has not been verified');
  expect(current).toContain('The study commands, MCP integration, and study UI remain pending.');
 });
});
