import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #651: the extreme fixture has 60,000 virtual sessions. Review/run
// already reads the bounded card queue; it must not additionally hydrate the
// entire unrelated session collection merely to render the first card.
describe('FIX #651 Review runner cold session-demand boundary',()=>{
 const source=readFileSync('src/features/review-run/Page.tsx','utf8');
 it('does not subscribe to unused global sessions',()=>{
  expect(source).not.toContain('useSessions()');
 });
 it('commits a ready queue before the first real-card paint',()=>{
  // Query data is already loaded; a passive effect costs another frame of
  // skeleton/Preparing state before the first real review card appears.
  expect(source).toMatch(/useLayoutEffect\(\(\)=>\{\s*if\(init\.current\|\|!settings\.data\|\|!apiCards\.data\)return;/);
 });
 it('keeps session filtering and the review queue intact',()=>{
  expect(source).toContain("const sessionId=search.get('session')");
  expect(source).toContain('const apiCards=useReviewItems(filter)');
  expect(source).toContain('useReviewSession.getState().initialize(apiCards.data,settings.data,filter)');
 });
});
