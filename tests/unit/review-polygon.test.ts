import {describe,expect,it} from 'vitest'
import {regularPolygon,roundEdges} from '../../src/features/review-run/polygon'

describe('Euclid review polygon',()=>{
 it('has exactly n clockwise sides and a top starting vertex',()=>{
  for(const n of [3,4,8,23]){
   const points=regularPolygon(n)
   expect(points).toHaveLength(n)
   expect(points[0].x).toBeCloseTo(36)
   expect(points[0].y).toBeCloseTo(9)
   const lengths=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%n].x,p.y-points[(i+1)%n].y))
   expect(Math.max(...lengths)-Math.min(...lengths)).toBeLessThan(1e-10)
  }
 })
 it('supports single-card and two-card rounds without invalid geometry',()=>{
  expect(regularPolygon(1)).toHaveLength(1)
  expect(regularPolygon(2)).toHaveLength(2)
  expect(()=>regularPolygon(0)).toThrow(RangeError)
  expect(()=>regularPolygon(2.5)).toThrow(RangeError)
 })
 it('marks first-pass Again as dashed until a successful second pass',()=>{
  const ids=['a','b','c']
  const a=(cardId:string,rating:number)=>({card:{cardId},rating})
  expect(roundEdges(ids,[])).toEqual(['pending','pending','pending'])
  expect(roundEdges(ids,[a('a',1),a('b',3)])).toEqual(['missed','passed','pending'])
  expect(roundEdges(ids,[a('a',1),a('b',3),a('a',2)])).toEqual(['passed','passed','pending'])
  expect(roundEdges(ids,[a('a',3),a('a',1)])).toEqual(['missed','pending','pending'])
 })
})
