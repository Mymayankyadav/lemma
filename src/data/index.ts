import type { LemmaApi } from './api'
import { DemoAdapter, demoSeedFixture } from './demo/adapter'
import { makeStressStore } from './demo/stress'
import { getMode, getDemoProfile } from './mode'

// The live adapter imports Supabase and PDF ingestion. Those modules are not
// needed to render the local demo and must not be parsed on the 4x-CPU cold
// Today path. Every LemmaApi operation is asynchronous, so the live-only
// implementation can be loaded on the first live call without changing the
// synchronous getApi() contract or the identity of the returned adapter.
let liveLoad: Promise<LemmaApi> | null = null
function loadLive(): Promise<LemmaApi> {
  return liveLoad ??= import('./live/adapter')
    .then(({ LiveAdapter }) => new LiveAdapter())
    .catch(error => {
      liveLoad = null
      throw error
    })
}
const lazyLive: LemmaApi = new Proxy({ mode: 'live' } as LemmaApi, {
  get(target, property) {
    if (property === 'mode') return target.mode
    if (typeof property !== 'string') return undefined
    return (...args: unknown[]) => loadLive().then(adapter => {
      const method = adapter[property as keyof LemmaApi]
      if (typeof method !== 'function') throw new TypeError('Unknown LemmaApi method: ' + property)
      return (method as (...values: unknown[]) => unknown).apply(adapter, args)
    })
  },
})

const adapters: Partial<Record<'live' | 'default' | 'stress' | 'extreme', LemmaApi>> = {}
export function getApi(): LemmaApi {
 if (getMode() === 'live') return adapters.live ??= lazyLive
 const profile = getDemoProfile()
 if (profile === 'default') return adapters.default ??= new DemoAdapter()
 return adapters[profile] ??= new DemoAdapter({
  fixture: makeStressStore(demoSeedFixture, profile, {deferSessions:true}),
  ownedFixture: true,
 })
}
export * from './types'
export * from './api'
