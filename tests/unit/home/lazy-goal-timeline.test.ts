import { expect, test, vi } from 'vitest'

// The 60-project S/X Today uses bounded MiniStageBars; the full interactive
// checkpoint timeline must be fetched only if a <=14-checkpoint project is
// actually shown. A static import makes cold 4x startup parse that route code.
vi.mock('../../../src/ui/timeline/ProjectTimeline', () => {
  throw new Error('Full ProjectTimeline loaded on the bounded Today path')
})

test('Today goal summaries do not eagerly evaluate the full checkpoint timeline', async () => {
  const module = await import('../../../src/features/home/GoalDistance')
  expect(typeof module.GoalDistance).toBe('function')
})

// LOOK-3c merged into main: preserve its one-line Route when integrating the
// independently code-split GoalCard. The old ProjectTimeline must not return.
test('deferred GoalCard preserves the approved one-line Route',async()=>{
 const {readFileSync}=await import('node:fs')
 const card=readFileSync('src/features/home/GoalCard.tsx','utf8')
 const distance=readFileSync('src/features/home/GoalDistance.tsx','utf8')
 expect(card).toContain("import {Route} from '../../ui/timeline/Route'")
 expect(card).toContain('<Route project={project}')
 expect(card).not.toContain('ProjectTimeline')
 expect(distance).toContain("lazy(()=>import('./GoalCard'))")
})
