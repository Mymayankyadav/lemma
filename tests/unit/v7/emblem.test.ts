import {describe,expect,it} from 'vitest';
import {emblemKind,emblemHash,emblemStrokes} from '../../../src/ui/v7/emblem';

describe('v7 mathematical emblems',()=>{
 it('selects the mathematical family for each subject',()=>{
  expect(emblemKind('Real Analysis')).toBe('partial-sums');
  expect(emblemKind('Linear Algebra')).toBe('mapped-plane');
  expect(emblemKind('Topology')).toBe('torus-knot');
  expect(emblemKind('Number theory')).toBe('multiplication-circle');
  expect(emblemKind('Logic')).toBe('hasse');
  expect(emblemKind('Geometry')).toBe('euclid');
  expect(emblemKind('Probability')).toBe('galton');
  expect(emblemKind('Combinatorics')).toBe('pascal');
 });
 it('is deterministic, bounded, and produces distinct identities',()=>{
  const paths=emblemStrokes('Analysis','path-a');
  expect(emblemStrokes('Analysis','path-a')).toEqual(paths);
  expect(paths).toHaveLength(6);
  expect(paths[5].width).toBe(1.4);
  expect(emblemHash('path-a')).not.toBe(emblemHash('path-b'));
  for(const subject of ['Analysis','Algebra','Topology','Number theory','Geometry','Logic','Probability','Combinatorics','Other']){
   const result=emblemStrokes(subject,'seed');
   expect(result.length).toBeGreaterThan(0);
   expect(result.length).toBeLessThanOrEqual(400);
   expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  }
 });
});
