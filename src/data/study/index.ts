// The study API for the current data mode. Screens call getStudyApi(); adapters live in demo.ts and live.ts.
import { getDemoProfile, getMode } from '../mode';
import type { StudyApi } from './contract';
import { createDemoStudyApi } from './demo';
import { createLiveStudyApi } from './live';

export type * from './contract';
let cached: { api: StudyApi; firstUse: boolean } | null = null;
let testApi: StudyApi | null = null;
export function getStudyApi(): StudyApi {
 const mode = getMode();
  if (testApi?.mode === mode) return testApi;
  const firstUse = mode === 'demo' && getDemoProfile() === 'first-use';
  if (!cached || cached.api.mode !== mode || cached.firstUse !== firstUse)
    cached = { api: mode === 'demo' ? createDemoStudyApi(firstUse) : createLiveStudyApi(), firstUse };
  return cached.api;
}
/** Tests only: use a fake adapter (pass null to reset). */
export function setStudyApiForTests(api: StudyApi | null): void { testApi = api; cached = null; }
