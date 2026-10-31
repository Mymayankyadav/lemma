import type { LemmaApi } from './api'
import { DemoAdapter, demoSeedFixture } from './demo/adapter'
import { makeStressStore } from './demo/stress'
import { LiveAdapter } from './live/adapter'
import { getMode, getDemoProfile } from './mode'
const adapters: Partial<Record<'live' | 'default' | 'stress' | 'extreme', LemmaApi>> = {}
export function getApi(): LemmaApi {
 if (getMode() === 'live') return adapters.live ??= new LiveAdapter()
 const profile = getDemoProfile()
 if (profile === 'default') return adapters.default ??= new DemoAdapter()
 return adapters[profile] ??= new DemoAdapter({
  fixture: makeStressStore(demoSeedFixture, profile, {deferSessions:true}),
  ownedFixture: true,
 })
}
export * from './types'
export * from './api'
