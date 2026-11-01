// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

// FIX #507: Today and Paths render a decorative graph sketch, but must not
// eagerly evaluate the review-session queue/store just to draw a static curve.
// The completed-round second curve remains available on Review via lazy code.
describe('FIX #507 route-scoped review sketch',()=>{
 it('does not load the review-session store on cold Today',()=>{
  const graph=readFileSync('src/ui/backgrounds/graph/GraphSketch.tsx','utf8')
  expect(graph).not.toContain("import {useReviewSession} from '../../../features/review-run/store'")
  expect(graph).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\/ReviewCurve['"]\)\)/)
  expect(graph).toContain("kind==='review'")
  expect(graph).toContain('<ReviewCurve')
 })
 it('preserves the completed-round Review curve and its store subscription',()=>{
  const review=readFileSync('src/ui/backgrounds/graph/ReviewCurve.tsx','utf8')
  expect(review).toContain('useReviewSession')
  expect(review).toContain('completedRound')
  expect(review).toContain('<path')
 })
})
