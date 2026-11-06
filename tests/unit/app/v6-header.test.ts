import {describe,it,expect} from 'vitest';
import {v6PageTitle} from '../../../src/app/V6Header';
import FocusAccessorySlot from '../../../src/app/FocusAccessorySlot';

describe('N13 v6 shared chrome',()=>{
 it('uses the v6 primary labels without renaming existing routes',()=>{
  expect(v6PageTitle('/')).toBe('Today');
  expect(v6PageTitle('/insights')).toBe('Progress');
  expect(v6PageTitle('/proposals')).toBe('Inbox');
  expect(v6PageTitle('/calendar')).toBe('Calendar');
  expect(v6PageTitle('/cards/7')).toBe('Card');
 });
 it('leaves the N14 focus accessory empty until it is implemented',()=>{
  expect(FocusAccessorySlot()).toBeNull();
 });
});
