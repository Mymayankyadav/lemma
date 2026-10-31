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
    // Never expose Promise-like properties: Promise.resolve(api) must not
    // mistake the adapter for a thenable and invoke a nonexistent API method.
    if (property === 'then' || property === 'catch' || property === 'finally') return undefined
    if (typeof property !== 'string') return undefined
    return (...args: unknown[]) => loadLive().then(adapter => {
      const method = adapter[property as keyof LemmaApi]
      if (typeof method !== 'function') throw new TypeError('Unknown LemmaApi method: ' + property)
      return (method as (...values: unknown[]) => unknown).apply(adapter, args)
    })
  },
})

const adapters: Partial<Record<'live' | 'default' | 'stress' | 'extreme', LemmaApi>> = {}
function createStressAdapter(profile: 'stress' | 'extreme'): LemmaApi {
 // Diagnostic-only User Timing entries distinguish 5k/30k fixture creation
 // from date hydration. They do not alter readiness or any hard CPU budget.
 const start = performance.now()
 // Every cold route begins with the same complete virtual fixture. Atlas,
 // Sources and Cards materialize only when their own route reads them, so
 // direct Paths/Review/Settings loads do not eagerly allocate 8k links and
 // 6k sources unrelated to their first meaningful paint.
 const fixture = makeStressStore(demoSeedFixture, profile, {deferSessions:true,deferNotes:true,deferAtlas:true,deferSources:true})
 const generated = performance.now()
 const adapter = new DemoAdapter({fixture,ownedFixture:true})
 const hydrated = performance.now()
 performance.measure('lemma-stress-fixture-generate',{start,end:generated})
 performance.measure('lemma-stress-fixture-hydrate',{start:generated,end:hydrated})
 return adapter
}
export function getApi(): LemmaApi {
 if (getMode() === 'live') return adapters.live ??= lazyLive
 const profile = getDemoProfile()
 if (profile === 'default') return adapters.default ??= new DemoAdapter()
 return adapters[profile] ??= createStressAdapter(profile)
}
export * from './types'
export * from './api'
