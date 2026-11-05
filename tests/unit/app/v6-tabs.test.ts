import {describe,expect,it} from 'vitest';
import {navigationTabs} from '../../../src/app/TabBar';

describe('flag-gated navigation',()=>{
 it('preserves the original four destinations when disabled',()=>{
  expect(navigationTabs(false).map(tab=>[tab.label,tab.to])).toEqual([
   ['Today','/'],['Paths','/projects'],['Review','/review'],['Insights','/insights']]);
 });
 it('exposes five destinations with Calendar and Progress when enabled',()=>{
  expect(navigationTabs(true).map(tab=>[tab.label,tab.to])).toEqual([
   ['Today','/'],['Paths','/projects'],['Review','/review'],['Calendar','/calendar'],['Progress','/insights']]);
 });
});
