import {describe, expect, it, vi} from 'vitest';
import {parseStudyRead, readStudyRecords} from '../../../supabase/functions/mcp/tools/study-read';
import type {Context} from '../../../supabase/functions/mcp/db';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '99999999-9999-9999-9999-999999999999';
const START = '2026-11-06T00:00:00Z';
const END = '2026-11-07T00:00:00Z';
const makeEntry = (id: string, user_id = OWNER) => ({
  id, user_id, version: 3, intent: 'Study proofs ' + id,
  created_at: '2026-11-05T22:00:00Z', status: 'saved',
});
const intervals = [
  {id:'i1',entry_id:'e1',user_id:OWNER,kind:'focus',started_at:'2026-11-05T23:30:00Z',ended_at:'2026-11-06T01:30:00Z'},
  {id:'i2',entry_id:'e1',user_id:OWNER,kind:'break',started_at:'2026-11-06T01:30:00Z',ended_at:'2026-11-06T01:40:00Z'},
  {id:'i3',entry_id:'e2',user_id:OWNER,kind:'focus',started_at:'2026-11-06T03:00:00Z',ended_at:'2026-11-06T03:30:00Z'},
  {id:'i4',entry_id:'hidden',user_id:OTHER,kind:'focus',started_at:'2026-11-06T03:00:00Z',ended_at:'2026-11-06T04:00:00Z'},
];
const blocks = [
  {id:'b1',user_id:OWNER,title:'Study calculus',version:2,starts_at:'2026-11-05T23:30:00Z',ends_at:'2026-11-06T00:30:00Z'},
  {id:'b2',user_id:OWNER,title:'Busy lunch',version:5,starts_at:'2026-11-06T12:00:00Z',ends_at:'2026-11-06T12:30:00Z'},
  {id:'b3',user_id:OTHER,title:'Study calculus secret',version:9,starts_at:'2026-11-06T12:00:00Z',ends_at:'2026-11-06T13:00:00Z'},
];
type Row = Record<string, any>;

/** In-memory PostgREST query double: the count is applied before page slicing. */
function fakeContext(entries: Row[] = [makeEntry('e1'), makeEntry('e2'), makeEntry('hidden', OTHER)]) {
  const calls: Array<{table: string; filters: string[]; range?: [number,number]}> = [];
  const data: Record<string,Row[]> = {study_entries: entries, study_intervals: intervals, calendar_blocks: blocks};
  const from = vi.fn((table: string) => {
    const filters: string[] = [];
    const tests: Array<(row:Row)=>boolean> = [];
    let lo = 0, hi = Number.MAX_SAFE_INTEGER;
    const call = {table,filters,range: undefined as [number,number] | undefined};
    calls.push(call);
    const query = {
      select: (_columns: string, _options?: unknown) => query,
      eq: (column: string, value: unknown) => {
        filters.push('eq:' + column + ':' + value);
        tests.push(row => row[column] === value);
        return query;
      },
      lt: (column: string, value: string) => {
        filters.push('lt:' + column);
        if (column.startsWith('study_intervals.')) {
          tests.push(row => intervals.some(i => i.entry_id === row.id && i.started_at < value));
        } else tests.push(row => row[column] < value);
        return query;
      },
      gt: (column: string, value: string) => {
        filters.push('gt:' + column);
        tests.push(row => row[column] > value);
        return query;
      },
      or: (condition: string, options: {referencedTable?:string}) => {
        filters.push('or:' + options?.referencedTable);
        const end = condition.match(/ended_at\.gt\.(.+)$/)?.[1];
        tests.push(row => intervals.some(i => i.entry_id === row.id &&
          (i.ended_at === null || (end !== undefined && i.ended_at > end))));
        return query;
      },
      ilike: (column: string, pattern: string) => {
        filters.push('ilike:' + column);
        const word = pattern.slice(1,-1).replace(/\\([%_\\])/g,'$1').toLowerCase();
        tests.push(row => String(row[column] ?? '').toLowerCase().includes(word));
        return query;
      },
      in: (column: string, ids: string[]) => {
        filters.push('in:' + column);
        tests.push(row => ids.includes(row[column]));
        return query;
      },
      order: () => query,
      range: (first: number, last: number) => {
        lo = first; hi = last;
        call.range = [first,last];
        return query;
      },
      limit: (n: number) => {
        lo = 0; hi = n-1; return query;
      },
      then: (resolve: (value:any)=>unknown, reject?: (error:unknown)=>unknown) => {
        const matching = (data[table] ?? []).filter(row => tests.every(test => test(row)));
        const page = matching.slice(lo,hi+1).map(x => {
          if (table !== 'study_entries') return {...x};
          return {...x,study_intervals: intervals.filter(i=>i.entry_id === x.id).map(i=>({id:i.id}))};
        });
        return Promise.resolve({data:page,error:null,count:matching.length}).then(resolve,reject);
      },
    };
    return query;
  });
  return {context: {db:{from},userId: OWNER} as unknown as Context,from,calls};
}

const args = {what:'study_entries',start:START,end:END};
describe('N15 study read argument validation', () => {
  it('requires an ISO instant range with offset and a positive bounded span', () => {
    expect(() => parseStudyRead({what:'study_entries'},'get')).toThrow(/range needs/);
    expect(() => parseStudyRead({...args,start:'2026-11-06'},'get')).toThrow(/ISO/);
    expect(() => parseStudyRead({...args,end:START},'get')).toThrow(/positive/);
    expect(() => parseStudyRead({...args,end:'2030-11-07T00:00:00Z'},'get')).toThrow(/366 days/);
  });
  it('rejects invalid limits, cursor and supplied owner identity', () => {
    for (const limit of [0,-1,51,1.1,Infinity]) {
      expect(() => parseStudyRead({...args,limit},'get')).toThrow(/limit/);
    }
    for (const cursor of ['v1:-1','v1:0001','v2:1','v1:1000001']) {
      expect(() => parseStudyRead({...args,cursor},'get')).toThrow(/cursor/);
    }
    expect(() => parseStudyRead({...args,user_id:OTHER} as typeof args,'get')).toThrow(/owner/);
    expect(() => parseStudyRead({resource:'study_entries',query:'a',start:START,end:END},'search')).toThrow(/query/);
    expect(() => parseStudyRead({resource:'study_entries',query:'proofs',start:START,end:END,limit:9},'search')).toThrow(/limit/);
  });
  it('normalizes timezone offsets for the server query', () => {
    expect(parseStudyRead({...args,start:'2026-11-06T05:30:00+05:30'},'get').start).toBe('2026-11-06T00:00:00.000Z');
  });
});

describe('N15 owner-scoped study get and search', () => {
  it('returns exact filtered total distinct from page size and a working cursor', async () => {
    const {context,calls} = fakeContext();
    const first = JSON.parse(await readStudyRecords(context,{...args,limit:1},'get'));
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.items[0].version).toBe(3);
    expect(first.items[0].intervals.map((i:Row)=>i.kind)).toEqual(['focus','break']);
    expect(first.nextCursor).toBe('v1:1');
    const second = JSON.parse(await readStudyRecords(context,{...args,limit:1,cursor:first.nextCursor},'get'));
    expect(second.total).toBe(2);
    expect(second.items[0].id).toBe('e2');
    expect(second.nextCursor).toBeNull();
    expect(calls.every(call => call.filters.includes('eq:user_id:'+OWNER))).toBe(true);
    expect(calls.find(call=>call.table==='study_entries')?.filters).toContain('or:study_intervals');
    expect(calls.find(call=>call.table==='study_intervals')?.filters).toContain('in:entry_id');
    expect(calls.find(call=>call.table==='study_entries')?.range).toEqual([0,0]);
  });
  it('returns calendar overlaps, owner-only versions, and case-insensitive title matches', async () => {
    const {context,calls} = fakeContext();
    const all = JSON.parse(await readStudyRecords(context,{what:'calendar_blocks',start:START,end:END},'get'));
    expect(all.total).toBe(2);
    expect(all.items.map((b:Row)=>b.id)).toEqual(['b1','b2']);
    const found = JSON.parse(await readStudyRecords(context,{resource:'calendar_blocks',start:START,end:END,query:'study'},'search'));
    expect(found.total).toBe(1);
    expect(found.items[0]).toMatchObject({id:'b1',version:2});
    expect(calls.every(call=>call.filters.includes('eq:user_id:'+OWNER))).toBe(true);
    expect(calls.some(call=>call.filters.includes('ilike:title'))).toBe(true);
  });
  it('searches study intent, retaining interval versions and excluding another owner', async () => {
    const {context} = fakeContext();
    const found = JSON.parse(await readStudyRecords(context,{resource:'study_entries',start:START,end:END,query:'proofs'},'search'));
    expect(found.total).toBe(2);
    expect(found.items.map((e:Row)=>e.id)).toEqual(['e1','e2']);
    expect(found.items.every((e:Row)=>e.version===3)).toBe(true);
    expect(JSON.stringify(found)).not.toContain(OTHER);
  });
  it('refuses missing auth before making any database request', async () => {
    const {context,from} = fakeContext();
    context.userId = '';
    await expect(readStudyRecords(context,args,'get')).rejects.toThrow(/Authenticated owner/);
    expect(from).not.toHaveBeenCalled();
  });
});
