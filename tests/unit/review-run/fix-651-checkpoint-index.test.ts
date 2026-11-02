import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #651: a private 200-card Review-run read must not allocate a map of
// every unrelated 6,000 checkpoint merely to resolve those 200 titles.
// Existing getReviewItems fixture/filter tests protect returned card parity.
describe('FIX #651 bounded checkpoint title lookup for a bounded card cohort',()=>{
 it('indexes only checkpoint keys requested by the supplied note subset',()=>{
  const source=readFileSync('src/data/demo/adapter.ts','utf8');
  expect(source).toContain('const wantedCheckpointKeys=notes?');
  expect(source).toContain('if(wantedCheckpointKeys&&!wantedCheckpointKeys.has(key))continue;');
  expect(source).toContain('const sourceNotes=notes??this.store.notes;');
 });
});
