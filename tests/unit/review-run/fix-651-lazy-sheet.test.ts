import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// FIX #651: the tutor-note Sheet is not part of the first usable Review card.
// Do not load or mount its focus trap/portal on cold Review-run. Once opened,
// retain it mounted so AnimatePresence can finish closing and drafts survive.
const page=readFileSync('src/features/review-run/Page.tsx','utf8');
describe('FIX #651 defer optional tutor-note sheet until first use',()=>{
 it('loads the Sheet module lazily rather than in the cold route import graph',()=>{
  expect(page).not.toContain("import {Sheet} from '../../ui/Sheet'");
  expect(page).toContain("const NoteSheet=lazy(()=>import('../../ui/Sheet')");
 });
 it('mounts only after first open, retaining the sheet for close animation',()=>{
  expect(page).toContain('sheetActivated&&<Suspense');
  expect(page).toContain('setSheetActivated(true)');
  expect(page).toContain('<NoteSheet open={sheetOpen}');
  expect(page).not.toContain('setSheetActivated(false)');
 });
 it('keeps note, save and suspend actions on the same sheet',()=>{
  expect(page).toContain('title="For your tutor"');
  expect(page).toContain('onClick={()=>{void leaveNote()}}');
  expect(page).toContain('onClick={()=>{void suspendCard()}}');
 });
});
