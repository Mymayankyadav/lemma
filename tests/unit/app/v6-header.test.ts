import {describe,it,expect,beforeEach} from 'vitest';
import {v6PageTitle} from '../../../src/app/V6Header';
import FocusAccessorySlot from '../../../src/app/FocusAccessorySlot';

// N102: v6Shell defaults on; this suite covers the legacy (flag-off) screen.
beforeEach(()=>{window.history.replaceState(null,'','/?flags=-v6Shell');});

describe('N13 v6 shared chrome',()=>{
 it('uses the v6 primary labels without renaming existing routes',()=>{
  expect(v6PageTitle('/')).toBe('Today');
  expect(v6PageTitle('/insights')).toBe('Progress');
  expect(v6PageTitle('/proposals')).toBe('Inbox');
  expect(v6PageTitle('/calendar')).toBe('Calendar');
  expect(v6PageTitle('/cards/7')).toBe('Card detail');
 });
 it('leaves the N14 focus accessory empty until it is implemented',()=>{
  expect(FocusAccessorySlot()).toBeNull();
 });
});
