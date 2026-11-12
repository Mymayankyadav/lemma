import {describe,expect,it} from 'vitest';
import {gradeNames,swipeGrade} from '../../../src/features/review-run/v7/ReviewRoundV7';
import {v7ScreenFor} from '../../../src/app/v7Kit';

describe('v7 review round',()=>{
 it('maps swipes to grades and ignores short drags',()=>{
  expect(swipeGrade(120,0)).toBe(3);
  expect(swipeGrade(-120,10)).toBe(1);
  expect(swipeGrade(10,-140)).toBe(4);
  expect(swipeGrade(40,-40)).toBeNull();
  expect(swipeGrade(0,140)).toBeNull();
 });
 it('names the four grades',()=>{expect([...gradeNames]).toEqual(['Again','Hard','Good','Easy']);});
 it('routes only migrated screens',()=>{
  expect(v7ScreenFor('/')).toBe('today');
  expect(v7ScreenFor('/review/run')).toBe('review-run');
  expect(v7ScreenFor('/calendar')).toBe('calendar');
  expect(v7ScreenFor('/calendar','?view=day')).toBe('calendar');
  expect(v7ScreenFor('/calendar','?view=week')).toBe('calendar');
  expect(v7ScreenFor('/calendar','?view=month')).toBe('calendar');
  expect(v7ScreenFor('/calendar','?view=agenda')).toBe('calendar');
  expect(v7ScreenFor('/p/abc')).toBe('path');
  // Part 8: the learning screens are migrated. A route no screen owns stays unmigrated.
  expect(v7ScreenFor('/p/abc/cp/CP3')).toBe('checkpoint');
  expect(v7ScreenFor('/no-such-screen')).toBeNull();
 });
});
