import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {SessionSummary} from '../../../src/data/types';
import {groupReviewSessions,shouldFetchReviewSessions} from '../../../src/features/review/session-demand';

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
 it('groups only matching due sessions, preserves source order and caps at three',()=>{
  const session=(slug:string,number:number)=>({
   id:slug+number,projectSlug:slug,number,goal:'Goal '+number,
   checkpointCode:null,client:'chatgpt',display:'ended',goalMet:null,
   startedAt:'2026-10-30T00:00:00Z',lastActivityAt:'2026-10-30T00:00:00Z',minutes:20,
  } as SessionSummary);
  const sessions=[session('algebra',1),session('analysis',1),session('algebra',2),
   session('algebra',3),session('algebra',4)];
  const due=[{projectSlug:'algebra',sessionNumber:1},{projectSlug:'algebra',sessionNumber:1},
   {projectSlug:'analysis',sessionNumber:1},{projectSlug:'algebra',sessionNumber:2},
   {projectSlug:'algebra',sessionNumber:3},{projectSlug:'algebra',sessionNumber:4},
   {projectSlug:'algebra',sessionNumber:null}];
  expect(groupReviewSessions(sessions,due).map(s=>[s.projectSlug,s.number,s.count]))
   .toEqual([['algebra',1,2],['analysis',1,1],['algebra',2,1]]);
  expect(groupReviewSessions(sessions,[{projectSlug:'algebra',sessionNumber:null}])).toEqual([]);
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
