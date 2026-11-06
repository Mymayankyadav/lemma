// N23: tab-scoped demo tasks. All writes are optimistic and persisted before returning.
import { LemmaError } from '../api';
import type {
  NewTask, TaskApi, TaskDue, TaskLinks, TaskPatch, TaskPriority, TaskQuery,
  TaskRecord, TaskStatus,
} from './contract';
import type { StudyReceipt } from '../study/contract';

const KEY = 'lemma.v6.demo.tasks.v1';
const STATUS: TaskStatus[] = ['backlog', 'in_progress', 'completed', 'cancelled'];
const PRIORITY: TaskPriority[] = ['low', 'normal', 'high'];
const clone = <T>(value: T): T => structuredClone(value);
const fail = (code: 'invalid' | 'conflict' | 'not_found', message: string): never => {
  throw new LemmaError(code, message);
};
type Snapshot = { schema: 1; tasks: TaskRecord[] };
type Cursor = { v: 1; statuses: string; key: [number, number, string, string] };
let counter = 0;
function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const text = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
    return [text.slice(0, 8), text.slice(8, 12), text.slice(12, 16),
      text.slice(16, 20), text.slice(20)].join('-');
  }
  return 'demo-task-' + Date.now() + '-' + (++counter);
}
function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  return result.getUTCFullYear() === year && result.getUTCMonth() + 1 === month && result.getUTCDate() === day;
}
function due(value: TaskDue): TaskDue {
  if (!value || typeof value !== 'object') fail('invalid', 'Task due kind is required');
  if (value.kind === 'none' && Object.keys(value).every(k => k === 'kind'))
    return { kind: 'none' };
  if (value.kind === 'date' && Object.keys(value).every(k => k === 'kind' || k === 'date') &&
      typeof value.date === 'string' && validDate(value.date))
    return { kind: 'date', date: value.date };
  if (value.kind === 'instant' && Object.keys(value).every(k => k === 'kind' || k === 'at') &&
      typeof value.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value.at) &&
      /(Z|[+-]\d\d:\d\d)$/i.test(value.at) && Number.isFinite(Date.parse(value.at)))
    return { kind: 'instant', at: value.at };
  return fail('invalid', 'Invalid due date or instant');
}
function validTitle(title: string): string {
  if (typeof title !== 'string' || !title.trim()) fail('invalid', 'Task title is required');
  return title.trim();
}
function validEstimate(value: number | null): number | null {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0))
    fail('invalid', 'Estimate must be non-negative whole minutes');
  return value;
}
function validPosition(value: number): number {
  if (!Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647)
    fail('invalid', 'Invalid task position');
  return value;
}
function validLinks(value: TaskLinks): Required<TaskLinks> {
  const result = {
    subjectId: value.subjectId ?? null, projectId: value.projectId ?? null,
    checkpointId: value.checkpointId ?? null,
  };
  if (Object.values(result).some(v => v !== null && (typeof v !== 'string' || !v.trim())))
    fail('invalid', 'Invalid task link');
  return result;
}
function receipt<T>(record: T): StudyReceipt<T> {
  return { record: clone(record), actionNo: null };
}
function seed(): Snapshot {
  const created = '2026-11-06T08:00:00.000Z';
  const task = (
    id: string, title: string, status: TaskStatus, position: number,
    subjectId: string | null, projectId: string | null, taskDue: TaskDue,
  ): TaskRecord => ({
    id, title, status, position, subjectId, projectId, checkpointId: null,
    due: taskDue, priority: 'normal', estimateMinutes: 25, body: '',
    completedAt: status === 'completed' ? '2026-11-06T09:00:00.000Z' : null,
    version: 1, createdAt: created, updatedAt: status === 'completed' ? '2026-11-06T09:00:00.000Z' : created,
  });
  return {schema: 1, tasks: [
    task('demo-task-1', 'Prove continuity', 'backlog', 0, 'subject-analysis', 'project-analysis', {kind:'date', date:'2026-11-09'}),
    task('demo-task-2', 'Read topology notes', 'backlog', 1, 'subject-topology', 'project-topology', {kind:'none'}),
    task('demo-task-3', 'Work on eigenvectors', 'in_progress', 0, 'subject-linear', 'project-linear', {kind:'instant',at:'2026-11-07T12:00:00.000Z'}),
    task('demo-task-4', 'Sketch a proof', 'in_progress', 1, 'subject-analysis', 'project-analysis', {kind:'none'}),
    task('demo-task-5', 'Practice compactness', 'completed', 0, 'subject-analysis', 'project-analysis', {kind:'date',date:'2026-11-06'}),
    task('demo-task-6', 'Review retired plan', 'cancelled', 0, null, null, {kind:'none'}),
  ]};
}
function readStorage(): Snapshot | null {
  try {
    const text = sessionStorage.getItem(KEY);
    if (!text) return null;
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || !('schema' in value) || value.schema !== 1 ||
        !('tasks' in value) || !Array.isArray(value.tasks)) return null;
    const snapshot = value as Snapshot;
    if (!snapshot.tasks.every(task => typeof task.id === 'string' && !!task.id &&
      typeof task.title === 'string' && !!task.title.trim() &&
      STATUS.includes(task.status) && PRIORITY.includes(task.priority) &&
      Number.isSafeInteger(task.version) && task.version > 0 &&
      Number.isSafeInteger(task.position) &&
      typeof task.body === 'string' &&
      (task.estimateMinutes === null || (Number.isSafeInteger(task.estimateMinutes) && task.estimateMinutes >= 0)) &&
      typeof task.createdAt === 'string' && Number.isFinite(Date.parse(task.createdAt)) &&
      typeof task.updatedAt === 'string' && Number.isFinite(Date.parse(task.updatedAt)) &&
      (task.completedAt === null || typeof task.completedAt === 'string' && Number.isFinite(Date.parse(task.completedAt))) &&
      (task.status === 'completed') === (task.completedAt !== null) &&
      !!due(task.due))) return null;
    if (new Set(snapshot.tasks.map(t => t.id)).size !== snapshot.tasks.length) return null;
    return snapshot;
  } catch { return null; } // Storage can be blocked or contain obsolete data.
}
function writeStorage(snapshot: Snapshot): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(snapshot)); }
  catch { /* Keep the in-memory state when storage is inaccessible. */ }
}
function order(task: TaskRecord): Cursor['key'] {
  return [STATUS.indexOf(task.status), task.position, task.createdAt, task.id];
}
function compare(a: Cursor['key'], b: Cursor['key']): number {
  for (let i = 0; i < 4; i++) {
    const x = a[i], y = b[i];
    const result = typeof x === 'number' && typeof y === 'number' ? x - y :
      String(x).localeCompare(String(y));
    if (result !== 0) return result;
  }
  return 0;
}
function cursorEncode(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cursorDecode(raw: string, statuses: string): Cursor {
  try {
    if (typeof raw !== 'string' || raw.length < 4 || raw.length > 1024 ||
        !/^[a-zA-Z0-9_-]+$/.test(raw)) fail('invalid', 'Invalid task cursor');
    const value: unknown = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - raw.length % 4) % 4)));
    if (!value || typeof value !== 'object') fail('invalid', 'Invalid task cursor');
    const c = value as Cursor;
    if (c.v !== 1 || c.statuses !== statuses || !Array.isArray(c.key) || c.key.length !== 4 ||
        !Number.isInteger(c.key[0]) || c.key[0] < 0 || c.key[0] >= STATUS.length ||
        !Number.isSafeInteger(c.key[1]) || typeof c.key[2] !== 'string' ||
        !Number.isFinite(Date.parse(c.key[2])) || typeof c.key[3] !== 'string')
      fail('invalid', 'Invalid task cursor');
    return c;
  } catch { return fail('invalid', 'Invalid task cursor'); }
}
function settings(query: TaskQuery): {status: TaskStatus[]; limit: number; anchor: Cursor | null} {
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('invalid', 'Task page size must be 1–50');
  const status = query.status === undefined ? STATUS.slice(0, 2) : query.status;
  if (!Array.isArray(status) || !status.every(s => STATUS.includes(s)))
    fail('invalid', 'Invalid task status filter');
  const selected = STATUS.filter(s => status.includes(s)); // deterministic despite duplicate or reordered filters
  const signature = selected.join(',');
  const anchor = query.cursor == null ? null : cursorDecode(query.cursor, signature);
  return {status:selected,limit,anchor};
}
function version(record: TaskRecord, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected !== record.version)
    fail('conflict', 'Task changed elsewhere; reload (current version ' + record.version + ')');
}

export function createDemoTaskApi(): TaskApi {
  let snapshot = readStorage() ?? seed();
  writeStorage(snapshot);
  const current = (): Snapshot => { snapshot = readStorage() ?? snapshot; return snapshot; };
  const save = (tasks: TaskRecord[]): void => {
    snapshot = {schema:1,tasks};
    writeStorage(snapshot);
  };
  return {
    mode: 'demo',
    async listTasks(query = {}) {
      const {status,limit,anchor} = settings(query);
      const all = current().tasks.filter(t => status.includes(t.status))
        .sort((a, b) => compare(order(a), order(b)));
      const start = anchor ? all.findIndex(task => compare(order(task), anchor.key) > 0) : 0;
      const page = (anchor && start === -1 ? [] : all.slice(start, start + limit));
      const end = (anchor && start === -1 ? all.length : start + page.length);
      return {items:clone(page), total:all.length,
        nextCursor: end < all.length && page.length ?
          cursorEncode({v:1,statuses:status.join(','),key:order(page[page.length-1])}) : null};
    },
    async getTask(id) {
      return clone(current().tasks.find(task => task.id === id) ?? null);
    },
    async createTask(input: NewTask) {
      const now = new Date().toISOString();
      const task: TaskRecord = {
        id: newId(), title: validTitle(input.title), body: input.body ?? '',
        priority: input.priority ?? 'normal', due: due(input.due ?? {kind:'none'}),
        estimateMinutes: validEstimate(input.estimateMinutes ?? null),
        position: validPosition(input.position ?? 0), status:'backlog', completedAt:null,
        version:1, createdAt:now, updatedAt:now, ...validLinks(input),
      };
      if (typeof task.body !== 'string' || !PRIORITY.includes(task.priority))
        fail('invalid', 'Invalid task body or priority');
      const before = current().tasks;
      save([...before,task]);
      return receipt(task);
    },
    async updateTask(id, expectedVersion, patch: TaskPatch) {
      const before = current().tasks;
      const original = before.find(t => t.id === id);
      if (!original) return fail('not_found', 'Task not found');
      version(original,expectedVersion);
      const status = patch.status === undefined ? original.status : patch.status;
      if (!STATUS.includes(status)) fail('invalid', 'Invalid task status');
      const now = new Date(Math.max(Date.now(), Date.parse(original.updatedAt))).toISOString();
      const updated: TaskRecord = {
        ...original,
        title: patch.title === undefined ? original.title : validTitle(patch.title),
        body: patch.body === undefined ? original.body : patch.body,
        priority: patch.priority === undefined ? original.priority : patch.priority,
        estimateMinutes: patch.estimateMinutes === undefined ? original.estimateMinutes : validEstimate(patch.estimateMinutes),
        due: patch.due === undefined ? original.due : due(patch.due),
        position: patch.position === undefined ? original.position : validPosition(patch.position),
        status, completedAt: status === 'completed' ?
          (original.status === 'completed' ? original.completedAt : now) : null,
        subjectId: patch.subjectId === undefined ? original.subjectId : patch.subjectId,
        projectId: patch.projectId === undefined ? original.projectId : patch.projectId,
        checkpointId: patch.checkpointId === undefined ? original.checkpointId : patch.checkpointId,
        version:original.version+1, updatedAt:now,
      };
      if (typeof updated.body !== 'string' || !PRIORITY.includes(updated.priority))
        fail('invalid', 'Invalid task body or priority');
      validLinks(updated);
      save(before.map(task => task.id === id ? updated : task));
      return receipt(updated);
    },
    async deleteTask(id, expectedVersion) {
      const before = current().tasks;
      const record = before.find(t => t.id === id);
      if (!record) return fail('not_found','Task not found');
      version(record, expectedVersion);
      save(before.filter(t => t.id !== id));
      return receipt({id});
    },
  };
}
