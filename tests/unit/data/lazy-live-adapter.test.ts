import { expect, test, vi } from 'vitest'

// Demo must not load the live-only Supabase/PDF adapter on its cold path.
// The mock throws on module evaluation: a static import fails this test,
// while a deferred import leaves demo startup independent of live code.
vi.mock('../../../src/data/live/adapter', () => {
  throw new Error('LiveAdapter was evaluated during demo startup')
})
vi.mock('../../../src/data/mode', () => ({
  getMode: () => 'demo',
  getDemoProfile: () => 'default',
}))

test('demo API loads without evaluating the live adapter', async () => {
  const { getApi } = await import('../../../src/data/index')
  expect(getApi().mode).toBe('demo')
  expect(getApi()).toBe(getApi())
})
