import type { LemmaApi } from './api'
import { DemoAdapter } from './demo/adapter'
import { LiveAdapter } from './live/adapter'
import { getMode } from './mode'
const adapters: Partial<Record<'live' | 'demo', LemmaApi>> = {}
export function getApi(): LemmaApi {
 const mode = getMode()
 return adapters[mode] ??= mode === 'demo' ? new DemoAdapter() : new LiveAdapter()
}
export * from './types'
export * from './api'
