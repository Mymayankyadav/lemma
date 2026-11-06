// Live task adapter over public.task_command. Placeholder until the item that implements it replaces this file.
import { emptyTaskApi, type TaskApi } from './contract';
export function createLiveTaskApi(): TaskApi { return emptyTaskApi('live'); }
