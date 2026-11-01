import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {shouldFetchReviewSessions} from '../../../src/features/review/session-demand';

// FIX #639: Review's optional session chips must not force a 60,000-row
// virtual session list when no due card refers to a session. Preserve
// session-backed card selection when one exists.
describe('Review session fetch demand',()=>{
 it('does not fetch when the queue is pending, empty or has no session-backed cards',()=>{
  expect(shouldFetchReviewSessions(undefined)).toBe(false);
  expect(shouldFetchReviewSessions([])).toBe(false);
  expect(shouldFetchReviewSessions([{sessionNumber:null},{sessionNumber:null}])).toBe(false);
 });
 it('fetches when any eligible due card is session-backed',()=>{
  expect(shouldFetchReviewSessions([{sessionNumber:null},{sessionNumber:7}])).toBe(true);
  expect(shouldFetchReviewSessions([{sessionNumber:0}])).toBe(true);
 });
 it('gates the existing sessions/all query on due-card demand',()=>{
  const source=readFileSync('src/features/review/Page.tsx','utf8');
  expect(source).toMatch(/enabled:\s*shouldFetchReviewSessions\(cards\.data\)/);
  expect(source).not.toMatch(/\buseSessions\s*\(/);
  expect(source).toContain("queryKey:['sessions','all']");
  // Disabled React Query observers may still expose cached 60k sessions;
  // the optional chip grouping must not traverse those rows either.
  expect(source).toMatch(/if\s*\(!shouldFetchReviewSessions\(cards\.data\)\)\s*return\s*\[\]/);
 });
});
