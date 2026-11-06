import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LemmaError } from '../../../src/data/api';
import { createLiveStudyApi } from '../../../src/data/study/live';

// Only the browser client is substituted. All reads use the real query-builder
// shape; command receipts use the schema of N11.3 study_command.
type Row = Record<string, unknown>;
type Filter = { op: string; column: string; value: unknown };
const records: Record<string, Row[]> = { study_entries: [], study_intervals: [], calendar_blocks: [] };
const reads: { table: string; select: string; filters: Filter[] }[] = [];
const writes: { operationId: string; schemaVersion: number; resource: string; operation: string;
  target?: { id: string }; expectedVersion?: number; patch: Record<string, unknown> }[] = [];
const receipts: { data: unknown; error: unknown }[] = [];
let readError: { code: string; message: string } | null = null;
let clientCalls = 0;

function query(table: string) {
  const filters: Filter[] = [];
  let selection = '';
  let sorting = '';
  const q = {
    select(value: string) { selection = value; reads.push({table, select: value, filters}); return q; },
    eq(column: string, value: unknown) { filters.push({op:'eq',column,value}); return q; },
    in(column: string, value: unknown[]) { filters.push({op:'in',column,value}); return q; },
    lt(column: string, value: string) { filters.push({op:'lt',column,value}); return q; },
    gt(column: string, value: string) { filters.push({op:'gt',column,value}); return q; },
    or(value: string) { filters.push({op:'or',column:'ended_at',value}); return q; },
    order(column: string) { sorting = column; return q; },
    values(): Row[] {
      let result = (records[table] ?? []).filter(row => filters.every(filter => {
        const value = row[filter.column];
        if (filter.op === 'eq') return value === filter.value;
        if (filter.op === 'in') return (filter.value as unknown[]).includes(value);
        if (filter.op === 'lt') return String(value) < String(filter.value);
        if (filter.op === 'gt') return String(value) > String(filter.value);
        if (filter.op === 'or') {
          const start = String(filter.value).split('ended_at.gt.')[1];
          return value == null || String(value) > start;
        }
        return true;
      }));
      if (sorting) result = [...result].sort((a,b)=>String(a[sorting]).localeCompare(String(b[sorting])));
      return result;
    },
    async maybeSingle(): Promise<{data: Row | null; error: typeof readError}> { const data: Row | null = q.values()[0] ?? null; return { data, error: readError }; },
    then<T>(resolve: (value: {data:Row[];error:typeof readError}) => T, reject?: (reason: unknown)=>unknown) {
      return Promise.resolve({ data: q.values(), error: readError }).then(resolve, reject);
    },
  };
  return q;
}
const fakeClient = {
  from: vi.fn((table: string) => query(table)),
  rpc: vi.fn(async (_name: string, args: {p: typeof writes[number]}) => {
    writes.push(args.p);
    return receipts.shift() ?? {
      data: {status:'ok',changed:[{id:args.p.target?.id ?? 'new-id',version: (args.p.expectedVersion ?? 0)+1}],actionNo:73}, error:null,
    };
  }),
};
vi.mock('../../../src/data/live/client', () => ({ liveClient: () => {clientCalls++; return fakeClient;} }));

const range = { start:'2026-11-06T00:00:00Z', end:'2026-11-07T00:00:00Z' };
const interval = (id: string, entryId: string, start = '2026-11-06T08:00:00Z', end: string | null = '2026-11-06T09:00:00Z', kind = 'focus') =>
  ({ id, entry_id:entryId, user_id:'owner', started_at:start, ended_at:end, kind });
const row = (id='study-1', status='saved', intervals: Row[] = [interval('i1',id)]) => ({
  id, user_id:'owner', subject_id:'subject-1', project_id:null, checkpoint_id:null, session_id:null,
  intent:'Work through proofs', source:'timer', status, reflection:null, rating:null, version:4,
  created_at:'2026-11-06T07:55:00Z', updated_at:'2026-11-06T09:00:00Z', saved_at:status==='saved'?'2026-11-06T09:00:00Z':null,
  study_intervals:intervals,
});
const calendar = (id='block-1') => ({
  id, user_id:'owner', kind:'study', title:'Topology', status:'planned', version:2,
  starts_at:'2026-11-06T10:00:00Z', ends_at:'2026-11-06T11:00:00Z',
  time_zone:'Asia/Kolkata', subject_id:null, project_id:'project-1', checkpoint_id:null, session_id:null,
});
function receipt(id='study-1', version=5, actionNo: number | null = 99) {
  receipts.push({data:{status:'ok',changed:[{id,version}],actionNo},error:null});
}

beforeEach(() => {
  records.study_entries = []; records.study_intervals = []; records.calendar_blocks = [];
  reads.length=0; writes.length=0; receipts.length=0; clientCalls=0; readError=null;
  fakeClient.from.mockClear(); fakeClient.rpc.mockClear();
});

describe('N16 live StudyApi', () => {
  it('does not load the live client until the first operation', async () => {
    const api = createLiveStudyApi();
    expect(api.mode).toBe('live');
    expect(clientCalls).toBe(0);
    expect(await api.activeStudyEntry()).toBeNull();
    expect(clientCalls).toBeGreaterThan(0);
  });

  it('selects overlapping entries, keeps their whole interval histories and includes active out-of-range entries once', async () => {
    records.study_intervals=[
      interval('i1','study-1','2026-11-05T23:50:00Z','2026-11-06T00:20:00Z'),
      interval('i2','study-1','2026-11-06T00:21:00Z','2026-11-06T00:50:00Z','break'),
      interval('i3','active','2026-11-04T08:00:00Z',null),
      interval('i4','outside','2026-11-04T08:00:00Z','2026-11-04T09:00:00Z'),
    ];
    records.study_entries = [row('study-1','saved',[records.study_intervals[1],records.study_intervals[0]]),
      ({...row('active','running',[records.study_intervals[2]]),created_at:'2026-11-06T07:56:00Z'}), row('outside','saved',[records.study_intervals[3]])];
    const result = await createLiveStudyApi().listStudyEntries(range);
    expect(result.map(item => item.id)).toEqual(['study-1','active']);
    expect(result[0]).toMatchObject({subjectId:'subject-1',projectId:null,version:4,intent:'Work through proofs'});
    expect(result[0].intervals.map(i => i.id)).toEqual(['i1','i2']);
    expect(reads.some(r=>r.table==='study_intervals'&&r.filters.some(f=>f.op==='lt'&&f.value===range.end))).toBe(true);
    expect(reads.filter(r=>r.table==='study_entries').every(r=>r.select.includes('study_intervals(*)'))).toBe(true);
    expect(reads.every(r=>r.filters.every(f=>f.column!=='user_id'))).toBe(true); // RLS is authoritative
  });

  it('returns empty reads when RLS reveals no rows', async () => {
    const api=createLiveStudyApi();
    expect(await api.listStudyEntries(range)).toEqual([]);
    expect(await api.listCalendarBlocks(range)).toEqual([]);
    expect(await api.activeStudyEntry()).toBeNull();
  });

  it('reads an active entry with camelCase fields and ordered intervals', async () => {
    records.study_entries = [row('study-1','paused',[interval('later','study-1','2026-11-06T09:00:00Z',null,'break'),interval('first','study-1')])];
    expect(await createLiveStudyApi().activeStudyEntry()).toMatchObject({status:'paused',intervals:[{id:'first'},{id:'later'}]});
  });

  it('reads overlapping calendar blocks in start order and maps the links', async () => {
    records.calendar_blocks=[{...calendar('late'),starts_at:'2026-11-06T12:00:00Z',ends_at:'2026-11-06T13:00:00Z'},calendar('early'),
      {...calendar('outside'),starts_at:'2026-11-05T10:00:00Z',ends_at:'2026-11-05T11:00:00Z'}];
    expect((await createLiveStudyApi().listCalendarBlocks(range)).map(b=>[b.id,b.timeZone,b.projectId]))
      .toEqual([['early','Asia/Kolkata','project-1'],['late','Asia/Kolkata','project-1']]);
  });

  it('starts by creating a draft and issuing a separate start command, with fresh operation IDs', async () => {
    records.study_entries=[row('new-id','running',[interval('first','new-id','2026-11-06T10:00:00Z',null)])];
    // Active preflight is empty; the row becomes visible only after the commands.
    const oldFrom = fakeClient.from.getMockImplementation();
    let preflight=true;
    fakeClient.from.mockImplementation((table: string) => {
      const b = query(table);
      if (table==='study_entries'&&preflight) {
        preflight=false;
        const old=b.maybeSingle;
        b.maybeSingle=async()=>({data:null,error:null});
        void old;
      }
      return b;
    });
    receipt('new-id',1,10); receipt('new-id',2,11);
    const result = await createLiveStudyApi().startStudyEntry({intent:'Proofs',source:'timer',subjectId:'subject-1',startedAt:'2026-11-01T00:00:00Z'});
    expect(result).toMatchObject({record:{id:'new-id',status:'running'},actionNo:11});
    expect(writes.map(w=>[w.resource,w.operation])).toEqual([['study_entries','create'],['study_entries','start']]);
    expect(writes[0].patch).toEqual({intent:'Proofs',source:'timer',subject_id:'subject-1'});
    expect(writes[1]).toMatchObject({target:{id:'new-id'},expectedVersion:1,patch:{}});
    expect(writes[0].operationId).not.toBe(writes[1].operationId);
    expect(writes.every(w=>w.schemaVersion===1&&!('user_id' in w.patch))).toBe(true);
    fakeClient.from.mockImplementation(oldFrom!);
  });

  it('refuses a second active start before any command', async () => {
    records.study_entries=[row('active','running')];
    await expect(createLiveStudyApi().startStudyEntry({intent:'Second',source:'timer'}))
      .rejects.toMatchObject({code:'conflict'});
    expect(writes).toEqual([]);
  });

  it.each(['pause','resume','break','discard'] as const)('%s sends one versioned study command', async operation => {
    records.study_entries=[row('study-1','paused')];
    const api=createLiveStudyApi();
    const fn={pause:api.pauseStudyEntry,resume:api.resumeStudyEntry,break:api.breakStudyEntry,discard:api.discardStudyEntry}[operation];
    const result=await fn('study-1',4,'2026-11-06T10:00:00Z');
    expect(result).toMatchObject({record:{id:'study-1'},actionNo:73});
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({resource:'study_entries',operation,expectedVersion:4,target:{id:'study-1'},patch:{}});
  });

  it('saves reflection and rating but never forwards unsupported minutes to SQL', async () => {
    records.study_entries=[row('study-1','running',[interval('live','study-1','2026-11-06T08:00:00Z',null)])];
    const record=await createLiveStudyApi().saveStudyEntry('study-1',4,{reflection:'Done',rating:5});
    expect(record.actionNo).toBe(73);
    expect(writes[0]).toMatchObject({resource:'study_entries',operation:'save',patch:{reflection:'Done',rating:5},expectedVersion:4});
  });

  it('saving an already saved entry is idempotent, including with stale version', async () => {
    records.study_entries=[row('study-1','saved')];
    const api=createLiveStudyApi();
    const first=await api.saveStudyEntry('study-1',4);
    const again=await api.saveStudyEntry('study-1',3,{reflection:'should not alter'});
    expect(first).toEqual(again);
    expect(first.actionNo).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('persists increased edited minutes as a closed interval before saving', async () => {
    const now=new Date(Date.now()-60_000).toISOString();
    records.study_entries=[row('study-1','running',[interval('live','study-1',now,null)])];
    receipt('i-added',5,71); receipt('study-1',6,72);
    const result=await createLiveStudyApi().saveStudyEntry('study-1',4,{minutes:30});
    expect(result.actionNo).toBe(72);
    expect(writes.map(x=>[x.resource,x.operation])).toEqual([['study_intervals','create'],['study_entries','save']]);
    expect(writes[0].patch).toMatchObject({entry_id:'study-1',kind:'focus'});
    expect(writes[1].expectedVersion).toBe(5);
  });

  it('reduces edited minutes via a versioned interval command before save', async () => {
    records.study_entries=[row('study-1','paused',[interval('focus','study-1','2026-11-05T08:00:00Z','2026-11-05T09:00:00Z')])];
    receipt('focus',5,71); receipt('study-1',6,72);
    await createLiveStudyApi().saveStudyEntry('study-1',4,{minutes:20});
    expect(writes.map(x=>x.operation)).toEqual(['update','save']);
    expect(writes[0]).toMatchObject({resource:'study_intervals',target:{id:'focus'},expectedVersion:4,
      patch:{started_at:'2026-11-05T08:40:00.000Z'}});
    expect(writes[1].expectedVersion).toBe(5);
  });

  it('creates, updates, and deletes calendar blocks with snake_case patch and action numbers', async () => {
    records.calendar_blocks=[calendar('block-1')];
    const api=createLiveStudyApi();
    receipt('block-1',1,20); receipt('block-1',3,null); receipt('block-1',4,25);
    expect((await api.createCalendarBlock({kind:'study',title:'Topology',startsAt:'2026-11-06T10:00:00Z',
      endsAt:'2026-11-06T11:00:00Z',timeZone:'Asia/Kolkata',subjectId:null})).actionNo).toBe(20);
    expect((await api.updateCalendarBlock('block-1',2,{title:'New',subjectId:null,startsAt:'2026-11-06T11:00:00Z'})).actionNo).toBeNull();
    expect(await api.deleteCalendarBlock('block-1',3)).toEqual({record:{id:'block-1'},actionNo:25});
    expect(writes.map(x=>x.operation)).toEqual(['create','update','delete']);
    expect(writes[0].patch).toEqual({kind:'study',title:'Topology',starts_at:'2026-11-06T10:00:00Z',
      ends_at:'2026-11-06T11:00:00Z',time_zone:'Asia/Kolkata',subject_id:null});
    expect(writes[1].patch).toEqual({title:'New',subject_id:null,starts_at:'2026-11-06T11:00:00Z'});
    expect(writes[2]).toMatchObject({target:{id:'block-1'},expectedVersion:3,patch:{}});
  });

  it('maps a server conflict receipt to the same conflict error used by demo', async () => {
    records.calendar_blocks=[calendar('block-1')];
    receipts.push({data:{status:'conflict',changed:[],actionNo:null,conflict:{currentVersion:6}},error:null});
    await expect(createLiveStudyApi().deleteCalendarBlock('block-1',2)).rejects.toMatchObject({code:'conflict'});
  });

  it('maps RLS-hidden rows, invalid commands, and duplicate active indexes to stable errors', async () => {
    await expect(createLiveStudyApi().saveStudyEntry('missing',1)).rejects.toMatchObject({code:'not_found'});
    receipts.push({data:null,error:{code:'23505',message:'duplicate key'}});
    await expect(createLiveStudyApi().deleteCalendarBlock('x',1)).rejects.toMatchObject({code:'conflict'});
    receipts.push({data:null,error:{code:'23514',message:'invalid calendar range'}});
    await expect(createLiveStudyApi().deleteCalendarBlock('x',1)).rejects.toMatchObject({code:'invalid'});
    expect(new LemmaError('conflict','conflict').code).toBe('conflict');
  });
});
