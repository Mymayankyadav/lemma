// v6 task contract (priority run 2026-11-06, owner-setup). One typed interface shared by the demo adapter
// (src/data/tasks/demo.ts), the live adapter (src/data/tasks/live.ts, over public.task_command) and every screen
// that shows or edits tasks (backlog sheet, planner, Today, MCP parity tests). Shapes follow public.tasks
// (supabase/migrations/20261106160000_v6_tasks.sql) in camelCase. Screens import only this file and getTaskApi()
// from ./index, so adapters and screens can be built in parallel. Change it only additively.
import type { StudyReceipt } from '../study/contract';

export type TaskStatus = 'backlog' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';
/** A due date is a civil date (YYYY-MM-DD); a due instant is an ISO instant. Never treat one as the other. */
export type TaskDue = { kind: 'none' } | { kind: 'date'; date: string } | { kind: 'instant'; at: string };

export interface TaskLinks {
 subjectId?: string | null;
 projectId?: string | null;
 checkpointId?: string | null;
}

export interface TaskRecord extends TaskLinks {
 id: string;
 title: string;
 body: string;
 /** Whole minutes, or null when not estimated. */
 estimateMinutes: number | null;
 priority: TaskPriority;
 due: TaskDue;
 /** Order within a status column; lower first. */
 position: number;
 status: TaskStatus;
 /** Set exactly when status is completed. */
 completedAt: string | null;
 version: number;
 createdAt: string;
 updatedAt: string;
}

export interface NewTask extends TaskLinks {
 title: string;
 body?: string;
 estimateMinutes?: number | null;
 priority?: TaskPriority;
 due?: TaskDue;
 position?: number;
}

export type TaskPatch = Partial<Pick<TaskRecord, 'title' | 'body' | 'estimateMinutes' | 'priority' | 'due' | 'position' | 'status'>> & TaskLinks;

export interface TaskQuery {
 /** Default: backlog and in_progress. */
 status?: TaskStatus[];
 /** Page size, 1–50; default 20. */
 limit?: number;
 /** Opaque cursor from a previous page. */
 cursor?: string | null;
}

/** One bounded page; total counts all tasks matching the query, not just this page. */
export interface TaskPage { items: TaskRecord[]; total: number; nextCursor: string | null }

export interface TaskApi {
 readonly mode: 'live' | 'demo';
 /** Ordered by status, then position, then createdAt. */
 listTasks(query?: TaskQuery): Promise<TaskPage>;
 getTask(id: string): Promise<TaskRecord | null>;
 createTask(input: NewTask): Promise<StudyReceipt<TaskRecord>>;
 /** Fails with a conflict when expectedVersion is stale. Setting status completed sets completedAt; leaving it clears completedAt. */
 updateTask(id: string, expectedVersion: number, patch: TaskPatch): Promise<StudyReceipt<TaskRecord>>;
 deleteTask(id: string, expectedVersion: number): Promise<StudyReceipt<{ id: string }>>;
}

export class TaskNotImplemented extends Error {
 readonly code = 'not_implemented';
 constructor(mode: string, method: string) { super(`tasks ${mode} adapter: ${method} is not implemented yet`); this.name = 'TaskNotImplemented'; }
}

/** An adapter that reads nothing and refuses writes: the placeholder until the demo and live adapters land. */
export function emptyTaskApi(mode: 'live' | 'demo'): TaskApi {
 const refuse = (method: string) => () => Promise.reject(new TaskNotImplemented(mode, method));
 return {
  mode,
  listTasks: () => Promise.resolve({ items: [], total: 0, nextCursor: null }),
  getTask: () => Promise.resolve(null),
  createTask: refuse('createTask'),
  updateTask: refuse('updateTask'),
  deleteTask: refuse('deleteTask'),
 };
}
