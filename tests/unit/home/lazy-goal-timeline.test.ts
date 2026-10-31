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
