import type { LemmaApi } from './api'
import type { DemoStore } from './demo/model'
import { DemoAdapter } from './demo/adapter'
import { makeStressStore } from './demo/stress'
import fixtureText from './demo/fixture.json?raw'
import { LiveAdapter } from './live/adapter'
import { getMode, getDemoProfile } from './mode'
const adapters: Partial<Record<'live' | 'default' | 'stress' | 'extreme', LemmaApi>> = {}
export function getApi(): LemmaApi {
 const mode = getMode()
 const profile = mode === 'live' ? 'live' : getDemoProfile()
 if (!adapters[profile]) {
  adapters[profile] = mode === 'live' ? new LiveAdapter()
   : profile === 'default' ? new DemoAdapter()
   : new DemoAdapter({fixture: makeStressStore(JSON.parse(fixtureText) as DemoStore, profile)})
 }
 return adapters[profile]!
}
export * from './types'
export * from './api'
