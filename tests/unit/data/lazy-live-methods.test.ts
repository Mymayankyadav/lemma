import { expect, test, vi } from 'vitest'

const calls = vi.hoisted(() => ({ constructors: 0, auth: 0 }))
vi.mock('../../../src/data/mode', () => ({
  getMode: () => 'live',
  getDemoProfile: () => 'default',
}))
vi.mock('../../../src/data/live/adapter', () => ({
  LiveAdapter: class {
    readonly mode = 'live'
    private readonly email = 'owner@example.test'
    constructor() { calls.constructors++ }
    async getAuth() {
      calls.auth++
      return { email: this.email }
    }
  },
}))

test('live API preserves stable identity, method receiver and concurrent initialization', async () => {
  const { getApi } = await import('../../../src/data/index')
  const api = getApi()
  expect(api).toBe(getApi())
  expect(api.mode).toBe('live')
  // A thenable API would be accidentally assimilated by Promise.resolve/await.
  expect((api as unknown as { then?: unknown }).then).toBeUndefined()
  const [first, second] = await Promise.all([api.getAuth(), api.getAuth()])
  expect(first).toEqual({ email: 'owner@example.test' })
  expect(second).toEqual(first)
  expect(calls.constructors).toBe(1)
  expect(calls.auth).toBe(2)
})
