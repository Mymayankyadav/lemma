import type {Context} from '../db.ts';

/** N15 owner-scoped, bounded reads. Never take an owner from MCP arguments. */
export type StudyReadResource = 'study_entries' | 'calendar_blocks';
export type StudyReadMode = 'get' | 'search';
export type StudyReadArgs = {
  what?: string;
  resource?: string;
  query?: string;
  start?: string;
  end?: string;
  cursor?: string;
  limit?: number;
};
export interface ParsedStudyRead {
  resource: StudyReadResource;
  start: string;
  end: string;
  cursor: number;
  limit: number;
  query: string | null;
}
const DEFAULT_LIMIT = {get: 20, search: 8} as const;
const MAX_LIMIT = {get: 50, search: 8} as const;
const MAX_OFFSET = 1_000_000;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Strict argument parser: rejects unbounded range, invalid cursor and identity hints. */
export function parseStudyRead(args: StudyReadArgs, mode: StudyReadMode): ParsedStudyRead {
  const resource = (mode === 'get' ? args.what : args.resource);
  if (resource !== 'study_entries' && resource !== 'calendar_blocks') {
    throw new Error('Unknown study resource');
  }
  const raw = args as unknown as Record<string,unknown>;
  if (['owner','ownerId','user_id','userId'].some(key => key in raw)) {
    throw new Error('Study reads use the authenticated owner; omit owner arguments');
  }
  if (typeof args.start !== 'string' || typeof args.end !== 'string' ||
      !instantPattern.test(args.start) || !instantPattern.test(args.end)) {
    throw new Error('Study range needs start and end ISO instants with timezone');
  }
  const from = Date.parse(args.start), until = Date.parse(args.end);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from ||
      until - from > MAX_RANGE_MS) {
    throw new Error('Study range must be positive and at most 366 days');
  }
  const limit = args.limit ?? DEFAULT_LIMIT[mode];
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT[mode]) {
    throw new Error('Study page limit must be 1..' + MAX_LIMIT[mode]);
  }
  const token = args.cursor ?? 'v1:0';
  if (typeof token !== 'string' || !/^v1:(?:0|[1-9]\d{0,6})$/.test(token)) {
    throw new Error('Invalid study cursor');
  }
  const offset = Number(token.slice(3));
  if (!Number.isSafeInteger(offset) || offset > MAX_OFFSET) {
    throw new Error('Invalid study cursor');
  }
  const query = mode === 'search' ? args.query : null;
  if (mode === 'search' && (typeof query !== 'string' || query.trim().length < 2 ||
      query.length > 120)) {
    throw new Error('Study search query must be 2..120 characters');
  }
  return {
    resource, start: new Date(from).toISOString(), end: new Date(until).toISOString(),
    cursor: offset, limit, query: query?.trim() ?? null,
  };
}

function safeLike(value: string): string {
  // Escape PostgREST LIKE wildcard characters: the query is literal text.
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function readStudyRecords(c: Context, args: StudyReadArgs, mode: StudyReadMode): Promise<string> {
  if (!c.userId) throw new Error('Authenticated owner required');
  const a = parseStudyRead(args, mode);
  const isEntries = a.resource === 'study_entries';
  const orderColumn = isEntries ? 'created_at' : 'starts_at';

  // A !inner relation filters the parent by overlapping intervals. This
  // includes entries created before a date whose focus crosses midnight.
  // Exact count belongs to the filtered PARENT query, before pagination.
  let rows = c.db.from(a.resource)
    .select(isEntries ? '*,study_intervals!inner(id)' : '*', {count: 'exact'})
    .eq('user_id', c.userId);
  if (isEntries) {
    rows = rows.lt('study_intervals.started_at', a.end)
      .or('ended_at.is.null,ended_at.gt.' + a.start, {referencedTable: 'study_intervals'});
  } else {
    rows = rows.lt('starts_at', a.end).gt('ends_at', a.start);
  }
  if (a.query !== null) {
    rows = rows.ilike(isEntries ? 'intent' : 'title', '%' + safeLike(a.query) + '%');
  }
  const {data, error, count} = await rows
    .order(orderColumn, {ascending: true})
    .order('id', {ascending: true})
    .range(a.cursor, a.cursor + a.limit - 1);
  if (error) throw new Error(error.message);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Study read count unavailable');
  const page = data ?? [];
  let items: Record<string,unknown>[];
  if (isEntries) {
    const ids = page.map((x: any) => x.id as string);
    let intervals: any[] = [];
    if (ids.length) {
      // The child read is separately owner-filtered even though the composite
      // foreign key already ties every interval to the owner's parent entry.
      const nested = await c.db.from('study_intervals')
        .select('id,entry_id,kind,started_at,ended_at')
        .eq('user_id', c.userId)
        .in('entry_id', ids)
        .order('started_at', {ascending: true})
        .order('id', {ascending: true})
        .limit(5000);
      if (nested.error) throw new Error(nested.error.message);
      intervals = nested.data ?? [];
      if (intervals.length === 5000) throw new Error('Too many study intervals; narrow the requested range');
    }
    items = page.map((item: any) => {
      const {study_intervals: _matched, user_id: _owner, ...record} = item;
      void _matched;
      void _owner;
      return {...record, intervals: intervals.filter(i => i.entry_id === item.id)
        .map(({entry_id: _entry, ...interval}) => {void _entry; return interval;})};
    });
  } else {
    items = page.map(({user_id: _owner, ...block}: any) => {void _owner; return block;});
  }
  return JSON.stringify({
    resource: a.resource,
    range: {start: a.start, end: a.end},
    total: count,
    items,
    nextCursor: a.cursor + page.length < count ? 'v1:' + (a.cursor + page.length) : null,
  });
}
