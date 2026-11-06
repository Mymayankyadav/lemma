// The task API for the current data mode. Screens call getTaskApi(); adapters live in demo.ts and live.ts.
import { getMode } from '../mode';
import type { TaskApi } from './contract';
import { createDemoTaskApi } from './demo';
import { createLiveTaskApi } from './live';

export type * from './contract';
let cached: TaskApi | null = null;
export function getTaskApi(): TaskApi {
 const mode = getMode();
 if (!cached || cached.mode !== mode) cached = mode === 'demo' ? createDemoTaskApi() : createLiveTaskApi();
 return cached;
}
/** Tests only: use a fake adapter (pass null to reset). */
export function setTaskApiForTests(api: TaskApi | null): void { cached = api; }
