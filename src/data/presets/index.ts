import { getMode } from '../mode';
import { createDemoPresetApi } from './demo';
import { createLivePresetApi } from './live';
import type { PresetApi } from './contract';

export type * from './contract';
let cached: PresetApi | null = null;
/** Future screens use only this mode-resolved API, never a direct Supabase table write. */
export function getPresetApi(): PresetApi {
  const mode = getMode();
  if (!cached || cached.mode !== mode)
    cached = mode === 'demo' ? createDemoPresetApi() : createLivePresetApi();
  return cached;
}
/** Tests only: inject a fake API, or null to reset the mode-aware cache. */
export function setPresetApiForTests(api: PresetApi | null): void { cached = api; }
