import type {Context} from '../db.ts';

/** N34: bounded task reads scoped to the connector's authenticated owner. */
export type TaskReadMode = 'get' | 'search';
export type TaskReadArgs = {
  what?: string;
  resource?: string;
  query?: string;
  status?: string;
  limit?: number;
  cursor?: string;
};
const STATUSES = ['backlog', 'in_progress', 'completed', 'cancelled'] as const;
const MAX_OFFSET = 1_000_000;
export function parseTaskRead(args: TaskReadArgs, mode: TaskReadMode) {
  if ((mode === 'get' ? args.what : args.resource) !== 'tasks') {
    throw new Error('Unknown task resource');
  }
  const raw = args as unknown as Record<string, unknown>;
  if (['owner', 'ownerId', 'user_id', 'userId'].some(key => key in raw)) {
    throw new Error('Task reads use the authenticated owner; omit owner arguments');
  }
  if (args.status !== undefined && !STATUSES.includes(args.status as typeof STATUSES[number])) {
    throw new Error('Invalid task status');
  }
  const max = mode === 'get' ? 50 : 8;
  const limit = args.limit ?? (mode === 'get' ? 20 : 8);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > max) {
    throw new Error('Task page limit must be 1..' + max);
  }
  const token = args.cursor ?? 'v1:0';
  if (typeof token !== 'string' || !/^v1:(?:0|[1-9]\d{0,6})$/.test(token) ||
      Number(token.slice(3)) > MAX_OFFSET) {
    throw new Error('Invalid task cursor');
  }
  const query = mode === 'search' ? args.query : undefined;
  if (mode === 'search' && (typeof query !== 'string' ||
      query.trim().length < 2 || query.length > 120)) {
    throw new Error('Task search query must be 2..120 characters');
  }
  return {limit, cursor: Number(token.slice(3)), status: args.status ?? null,
    query: query?.trim() ?? null};
}
function safeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function readTaskRecords(c: Context, args: TaskReadArgs, mode: TaskReadMode): Promise<string> {
  if (!c.userId) throw new Error('Authenticated owner required');
  const a = parseTaskRead(args, mode);
  // Request the exact filtered count before range pagination. Never expose user_id
  // in the returned rows, and never use an owner field from tool arguments.
  let rows = c.db.from('tasks').select(
    'id,title,body,subject_id,project_id,checkpoint_id,estimate_minutes,priority,due_kind,due_date,due_at,position,status,completed_at,version,created_at,updated_at',
    {count: 'exact'},
  ).eq('user_id', c.userId);
  if (a.status !== null) rows = rows.eq('status', a.status);
  if (a.query !== null) rows = rows.ilike('title', '%' + safeLike(a.query) + '%');
  const {data, error, count} = await rows
    .order('status', {ascending: true})
    .order('position', {ascending: true})
    .order('created_at', {ascending: true})
    .order('id', {ascending: true})
    .range(a.cursor, a.cursor + a.limit - 1);
  if (error) throw new Error(error.message);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Task read count unavailable');
  const items = (data ?? []).map(({user_id: _owner, ...task}: Record<string, unknown>) => {
    void _owner;
    return task;
  });
  return JSON.stringify({resource: 'tasks', total: count, items,
    nextCursor: a.cursor + items.length < count ? 'v1:' + (a.cursor + items.length) : null});
}
