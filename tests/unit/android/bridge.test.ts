import {describe, expect, it, vi} from 'vitest'

// Owner report 12 Nov 2026: every LemmaNative call silently failed on the phone. Capacitor's plugin proxy answers every
// property (including `then`) with a native method, so resolving a promise with it called a native `then()`.
// This fake has the same shape as @capacitor/core's registerPlugin proxy.
const calls: string[] = []
vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => new Proxy({}, {get: (_target, property) => (...args: unknown[]) => {
    calls.push(name + '.' + String(property))
    // A native `then` does not exist: it rejects like Capacitor's "not implemented" error, or never settles.
    if (property === 'then') return new Promise(() => undefined)
    return Promise.resolve({called: String(property), args})
  }}),
}))

describe('N125 the LemmaNative bridge', () => {
  it('can be awaited, and its methods reach the native plugin', async () => {
    const {lemmaNative} = await import('../../../src/platform/bridge')
    const native = await Promise.race([lemmaNative(), new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 200))])
    expect(native).not.toBe('hung')
    const status = await (native as Awaited<ReturnType<typeof lemmaNative>>).notificationStatus()
    expect(status).toMatchObject({called: 'notificationStatus'})
    expect(calls).toEqual(['LemmaNative.notificationStatus'])
  })
  it('notThenable hides only `then`', async () => {
    const {notThenable} = await import('../../../src/platform/bridge')
    const proxy = notThenable({then: () => 1, other: () => 2} as {then?: () => number; other: () => number})
    expect(proxy.then).toBeUndefined()
    expect(proxy.other()).toBe(2)
  })
})
