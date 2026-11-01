import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #651: a direct cold review-run deep link can start fetching its route
// chunk before React Router mounts, without loading 30k cards or changing
// the review query. Do not preload it on Today/Paths/other cold routes.
describe('FIX #651 direct Review-run route module head start',()=>{
 it('starts only the Review-run module import before initial React mount',()=>{
  const main=readFileSync('src/main.tsx','utf8');
  expect(main).toContain("location.hash.startsWith('#/review/run')");
  expect(main).toContain("import('./features/review-run/Page')");
  expect(main).not.toContain('getReviewItems(');
  expect(main).not.toContain('getAtlas(');
  // Cold deep links can create the local adapter while the Review-run
  // route chunk downloads; no actual review/Atlas query is prefetched.
  expect(main).toMatch(/if\(window\.location\.hash\.startsWith\('#\/review\/run'\)\)\{[\s\S]*getApi\(\)/);
 });
});
