import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #616: an asynchronously resolving Review forecast must never move the
// Continue handoff below the viewport after scrollIntoViewIfNeeded. Reserve
// the final 80px slot for both the query's 1-line loading text and the 7-bar
// chart, without introducing a skeleton or hiding the actual forecast.
describe('FIX #616 stable quiet Today Review forecast footprint',()=>{
 it('reserves 80px on the outer on-demand forecast slot across query states',()=>{
  const page=readFileSync('src/features/home/Page.tsx','utf8');
  expect(page).toContain('data-forecast-on-demand="" className="min-h-20"');
  expect(page).toContain('<ReviewOutlook/>');
  expect(page).not.toContain('<Skeleton h={80}/>');
 });
});
