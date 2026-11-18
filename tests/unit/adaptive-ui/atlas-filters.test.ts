import {describe,expect,it} from 'vitest';
import {ATLAS_FILTERS,matchesFilter,UNCERTAIN_SD,GAP_PROBE} from '../../../src/features/atlas/v7/filters';

const node={uncertainty:.9,gap:.3,certified:[false,true],stale:true,kind:'definition'};
describe('05 Atlas filters',()=>{
 it('names the five filters of the spec',()=>{expect([...ATLAS_FILTERS]).toEqual(['all','uncertain','gaps','certified','stale']);});
 it('all matches everything; each filter matches exactly its own signal',()=>{
  expect(matchesFilter({},'all')).toBe(true);
  expect(matchesFilter(node,'uncertain')).toBe(true);expect(matchesFilter({uncertainty:UNCERTAIN_SD},'uncertain')).toBe(false);expect(matchesFilter({},'uncertain')).toBe(false);
  expect(matchesFilter(node,'gaps')).toBe(true);expect(matchesFilter({gap:GAP_PROBE},'gaps')).toBe(false);
  expect(matchesFilter(node,'certified')).toBe(true);expect(matchesFilter({certified:[false,false]},'certified')).toBe(false);expect(matchesFilter({},'certified')).toBe(false);
  expect(matchesFilter(node,'stale')).toBe(true);expect(matchesFilter({stale:false},'stale')).toBe(false);expect(matchesFilter({},'stale')).toBe(false);
 });
 it('a kind narrows any filter, and "any" does not',()=>{
  expect(matchesFilter(node,'all','definition')).toBe(true);expect(matchesFilter(node,'all','result')).toBe(false);
  expect(matchesFilter(node,'gaps','result')).toBe(false);expect(matchesFilter(node,'gaps','any')).toBe(true);
 });
});
