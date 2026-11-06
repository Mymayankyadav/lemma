// The study API for the current data mode. Screens call getStudyApi(); adapters live in demo.ts and live.ts.
import { getMode } from '../mode';
import type { StudyApi } from './contract';
import { createDemoStudyApi } from './demo';
import { createLiveStudyApi } from './live';

export type * from './contract';
let cached: StudyApi | null = null;
export function getStudyApi(): StudyApi {
 const mode = getMode();
 if (!cached || cached.mode !== mode) cached = mode === 'demo' ? createDemoStudyApi() : createLiveStudyApi();
 return cached;
}
/** Tests only: use a fake adapter (pass null to reset). */
export function setStudyApiForTests(api: StudyApi | null): void { cached = api; }
