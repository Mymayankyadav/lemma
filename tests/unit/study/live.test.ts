import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveStudyApi } from '../../../src/data/study/live';
import { liveClient } from '../../../src/data/live/client';

vi.mock('../../../src/data/live/client', () => ({ liveClient: vi.fn() }));

const time = '2026-11-06T10:00:00.000Z';
const later = '2026-11-06T10:30:00.000Z';
const interval = (id: string, kind = 'focus') => ({ id, kind, entry_id:'entry-1', started_at: time, ended_at: later });
const study = (overrides: Record<string, unknown> = {}) => ({
  id:'entry-1', intent:'Read chapter', source:'timer', status:'running', version:2,
  created_at:time, updated_at:later, saved_at:null, reflection:null, rating:null,
  subject_id:'subject-1', project_id:null, checkpoint_id:null, session_id:null,
  study_intervals:[interval('interval-1')], ...overrides,
});
const block = (overrides: Record<string, unknown> = {}) => ({
  id:'block-1', title:'Plan study', kind:'study', starts_at:time, ends_at:later,
  time_zone:'Asia/Kolkata', status:'planned',version:1,
  subject_id:null,project_id:null,checkpoint_id:null,session_id:null,...overrides,
});
type Row = Record<string, unknown>;
interface Response { data: unknown; error: {code?: string; message?: string} | null }
class FakeQuery implements PromiseLike<Response> {
  private filters: Array<[string,string,unknown]> = [];
  private single = false;
  constructor(private readonly table:string, private readonly state: {rows:Record<string,Row[]>; reads:{table:string; filters:Array<[string,string,unknown]>;single:boolean}[]}) {}
  select(_value: string) { return this; }
  eq(field: string, value: unknown) { this.filters.push(['eq',field,value]); return this; }
  in(field: string, value: unknown) { this.filters.push(['in',field,value]); return this; }
  lt(field: string, value: unknown) { this.filters.push(['lt',field,value]); return this; }
  gt(field: string, value: unknown) { this.filters.push(['gt',field,value]); return this; }
  or(value: string) { this.filters.push(['or','',value]); return this; }
  order(field: string, options:unknown) { this.filters.push(['order',field,options]); return this; }
  limit(value: number) { this.filters.push(['limit','',value]); return this; }
  maybeSingle() { this.single = true; return this; }
  then<TResult1 = Response, TResult2 = never>(
    onfulfilled?: ((value:Response)=>TResult1|PromiseLike<TResult1>) | null,
    onrejected?: ((reason:unknown)=>TResult2|PromiseLike<TResult2>) | null,
  ): Promise<TResult1|TResult2> {
    const data = this.state.rows[this.table] ?? [];
    this.state.reads.push({table:this.table, filters:this.filters, single:this.single});
    let items = data.filter(row => this.filters.every(([op,field,value]) => {
      if (op === 'eq') return row[field] === value;
      if (op === 'in') return (value as unknown[]).includes(row[field]);
      if (op === 'lt') return String(row[field]) < String(value);
      if (op === 'gt') return String(row[field]) > String(value);
      if (op === 'or') return row.ended_at == null || String(row.ended_at) > String(value).split('ended_at.gt.')[1];
      return true;
    }));
    const requestedLimit = this.filters.find(([op]) => op === 'limit');
    if (requestedLimit) items = items.slice(0,Number(requestedLimit[2]));
    const result: Response = {data:this.single ? (items[0] ?? null) : items, error:null};
    return Promise.resolve(result).then(onfulfilled,onrejected);
  }
}
function harness() {
  const state = {
    rows: { study_entries:[study()] as Row[], study_intervals:[interval('interval-1')] as Row[],
      calendar_blocks:[block()] as Row[] } as Record<string,Row[]>,
    reads: [] as {table:string; filters:Array<[string,string,unknown]>; single:boolean}[],
    calls: [] as Array<{fn:string; envelope:Record<string,unknown>}>,
    responses: [] as Array<Response>,
  };
  const client = {
    from: vi.fn((table:string) => new FakeQuery(table, state)),
    rpc: vi.fn(async (fn:string,args:{p:Record<string,unknown>}) => {
      state.calls.push({fn,envelope:args.p});
      return state.responses.shift() ?? {
        data:{status:'ok',changed:[{id:args.p.resource === 'calendar_blocks' ? 'block-1' : 'entry-1',version:3}],actionNo:77}, error:null,
      };
    }),
  };
  // Keep the returned harness and RPC closure on the same mutable response queue.
  return Object.assign(state, { client });
}
function expectCommand(envelope: Record<string, unknown>, resource:string, operation:string) {
  expect(envelope).toMatchObject({schemaVersion:1,resource,operation});
  expect(envelope.operationId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  expect(envelope).not.toHaveProperty('user_id');
  expect(envelope).not.toHaveProperty('userId');
}
let fake: ReturnType<typeof harness>;
beforeEach(() => {
  fake = harness();
  vi.mocked(liveClient).mockReturnValue(fake.client as never);
});

describe('N16 live StudyApi (stubbed owner-scoped Supabase client)', () => {
  it('maps sorted intervals, owner-linked records, and bounded half-open range query', async () => {
    fake.rows.study_entries[0] = study({study_intervals:[interval('late','break'),interval('early')],status:'saved',saved_at:later});
    const rows = await createLiveStudyApi().listStudyEntries({start:time,end:later});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({id:'entry-1',intent:'Read chapter',status:'saved',subjectId:'subject-1',version:2,
      savedAt:later, intervals:[{id:'late',start:time,end:later,kind:'break'},{id:'early',start:time,end:later,kind:'focus'}]});
    expect(fake.reads.map(r => r.table)).toEqual(['study_intervals','study_entries','study_entries']);
    expect(fake.reads[0].filters).toContainEqual(['lt','started_at',later]);
    expect(fake.reads[0].filters).toContainEqual(['or','',`ended_at.is.null,ended_at.gt.${time}`]);
    expect(fake.reads.every(r => r.filters.some(([op]) => op === 'limit'))).toBe(true);
    expect(fake.client.rpc).not.toHaveBeenCalled();
  });

  it('returns no records for empty RLS-scoped reads without writing', async () => {
    fake.rows.study_intervals = [];
    fake.rows.study_entries = [];
    fake.rows.calendar_blocks = [];
    const api = createLiveStudyApi();
    expect(await api.listStudyEntries({start:time,end:later})).toEqual([]);
    expect(await api.activeStudyEntry()).toBeNull();
    expect(await api.listCalendarBlocks({start:time,end:later})).toEqual([]);
    expect(fake.client.rpc).not.toHaveBeenCalled();
  });

  it('reads the single active session with nested intervals and maps interval boundaries', async () => {
    fake.rows.study_entries[0] = study({study_intervals:[interval('one','focus'),
      {id:'two',kind:'break',entry_id:'entry-1',started_at:later,ended_at:null}]});
    const active = await createLiveStudyApi().activeStudyEntry();
    expect(active?.intervals).toEqual([
      {id:'one',kind:'focus',start:time,end:later},
      {id:'two',kind:'break',start:later,end:null},
    ]);
    expect(fake.reads[0].filters).toContainEqual(['in','status',['running','paused']]);
  });

  it('creates then starts timer using separate fresh operation IDs, maps receipt', async () => {
    fake.responses = [
      {data:{status:'ok',changed:[{id:'entry-1',version:1}],actionNo:15},error:null},
      {data:{status:'ok',changed:[{id:'entry-1',version:2}],actionNo:16},error:null},
    ];
    const out = await createLiveStudyApi().startStudyEntry({intent:'Read chapter',source:'timer',subjectId:'subject-1'});
    expect(out.actionNo).toBe(16);
    expect(out.record.id).toBe('entry-1');
    expect(fake.calls).toHaveLength(2);
    expectCommand(fake.calls[0].envelope,'study_entries','create');
    expect(fake.calls[0].envelope).toMatchObject({patch:{intent:'Read chapter',source:'timer',subject_id:'subject-1'}});
    expectCommand(fake.calls[1].envelope,'study_entries','start');
    expect(fake.calls[1].envelope).toMatchObject({target:{id:'entry-1'},expectedVersion:1,patch:{}});
    expect(fake.calls[0].envelope.operationId).not.toBe(fake.calls[1].envelope.operationId);
    expect(fake.reads.at(-1)?.filters).toContainEqual(['eq','id','entry-1']);
  });

  it('uses exact pause, resume and break envelopes with versions and no untrusted timestamps', async () => {
    const api = createLiveStudyApi();
    await api.pauseStudyEntry('entry-1',2,'1999-01-01T00:00:00Z');
    await api.resumeStudyEntry('entry-1',3,time);
    await api.breakStudyEntry('entry-1',4,later);
    expect(fake.calls.map(x => x.envelope.operation)).toEqual(['pause','resume','break']);
    fake.calls.forEach(({envelope}, index) => {
      expectCommand(envelope,'study_entries',['pause','resume','break'][index]);
      expect(envelope).toMatchObject({target:{id:'entry-1'},expectedVersion:index+2,patch:{}});
      expect(JSON.stringify(envelope)).not.toContain('1999-01-01');
    });
    expect(new Set(fake.calls.map(c=>c.envelope.operationId)).size).toBe(3);
  });

  it('saves reflection/rating and discards through commands; second save is idempotent', async () => {
    const api = createLiveStudyApi();
    const saved = await api.saveStudyEntry('entry-1',2,{reflection:'Finished',rating:5});
    expect(saved.actionNo).toBe(77);
    expect(fake.calls[0].envelope).toMatchObject({resource:'study_entries',operation:'save',target:{id:'entry-1'},
      expectedVersion:2,patch:{reflection:'Finished',rating:5}});
    fake.rows.study_entries[0] = study({status:'saved',saved_at:later});
    const second = await api.saveStudyEntry('entry-1',2,{rating:1});
    expect(second).toMatchObject({actionNo:null,record:{status:'saved'}});
    expect(fake.calls).toHaveLength(1);
    fake.rows.study_entries[0] = study();
    const discarded = await api.discardStudyEntry('entry-1',2);
    expect(discarded.record.id).toBe('entry-1');
    expect(fake.calls[1].envelope).toMatchObject({operation:'discard',target:{id:'entry-1'},expectedVersion:2,patch:{}});
  });

  it('rejects stale version conflict and not-found error without an owner-supplied ID', async () => {
    fake.responses = [{data:{status:'conflict',changed:[],conflict:{currentVersion:6}},error:null}];
    await expect(createLiveStudyApi().pauseStudyEntry('entry-1',3)).rejects.toMatchObject({code:'conflict'});
    expect(fake.calls[0].envelope).toMatchObject({expectedVersion:3});
    fake.responses = [{data:null,error:{message:'Study entry not found',code:'P0001'}}];
    await expect(createLiveStudyApi().resumeStudyEntry('entry-1',3)).rejects.toMatchObject({code:'not_found'});
    expect(fake.calls.every(({envelope}) => !JSON.stringify(envelope).includes('user_id'))).toBe(true);
  });

  it('lists overlapping calendar blocks, maps columns and bounds the query', async () => {
    const blocks = await createLiveStudyApi().listCalendarBlocks({start:time,end:later});
    expect(blocks).toEqual([{id:'block-1',kind:'study',title:'Plan study',startsAt:time,endsAt:later,
      timeZone:'Asia/Kolkata',status:'planned',version:1,subjectId:null,projectId:null,checkpointId:null,sessionId:null}]);
    expect(fake.reads[0].filters).toContainEqual(['lt','starts_at',later]);
    expect(fake.reads[0].filters).toContainEqual(['gt','ends_at',time]);
    expect(fake.reads[0].filters).toContainEqual(['order','starts_at',{ascending:true}]);
    expect(fake.reads[0].filters).toContainEqual(['limit','',500]);
  });

  it('creates, moves, marks done and deletes blocks with exact snake_case commands', async () => {
    const api = createLiveStudyApi();
    const created = await api.createCalendarBlock({kind:'study',title:'Plan study',startsAt:time,endsAt:later,
      timeZone:'Asia/Kolkata',subjectId:'subject-1'});
    expect(created.actionNo).toBe(77);
    expect(fake.calls[0].envelope).toMatchObject({resource:'calendar_blocks',operation:'create',patch:{
      kind:'study',title:'Plan study',starts_at:time,ends_at:later,time_zone:'Asia/Kolkata',subject_id:'subject-1',
    }});
    await api.updateCalendarBlock('block-1',1,{startsAt:later,endsAt:'2026-11-06T11:00:00Z',status:'done',projectId:null});
    expect(fake.calls[1].envelope).toMatchObject({resource:'calendar_blocks',operation:'update',target:{id:'block-1'},
      expectedVersion:1,patch:{starts_at:later,ends_at:'2026-11-06T11:00:00Z',status:'done',project_id:null}});
    const deleted = await api.deleteCalendarBlock('block-1',2);
    expect(deleted).toEqual({record:{id:'block-1'},actionNo:77});
    expect(fake.calls[2].envelope).toMatchObject({resource:'calendar_blocks',operation:'delete',target:{id:'block-1'},expectedVersion:2,patch:{}});
    expect(new Set(fake.calls.map(c=>c.envelope.operationId)).size).toBe(3);
  });

  it('edits logged minutes with interval commands, preserving final save envelope', async () => {
    const api = createLiveStudyApi();
    fake.rows.study_entries[0] = study({status:'paused',version:2,
      study_intervals:[{...interval('interval-1'),started_at:time,ended_at:later}]});
    await api.saveStudyEntry('entry-1',2,{minutes:15,reflection:'Adjusted'});
    expect(fake.calls.map(c=>c.envelope.operation)).toEqual(['update','save']);
    expect(fake.calls[0].envelope).toMatchObject({resource:'study_intervals',operation:'update',
      target:{id:'interval-1'},expectedVersion:2,patch:{ended_at:'2026-11-06T10:15:00.000Z'}});
    expect(fake.calls[1].envelope).toMatchObject({resource:'study_entries',operation:'save',expectedVersion:3,
      patch:{reflection:'Adjusted'}});
  });

  it('rejects invalid ranges and invalid editable minutes before changing a version', async () => {
    const api = createLiveStudyApi();
    await expect(api.listStudyEntries({start:later,end:time})).rejects.toMatchObject({code:'invalid'});
    await expect(api.saveStudyEntry('entry-1',2,{minutes:-1})).rejects.toMatchObject({code:'invalid'});
    expect(fake.client.rpc).not.toHaveBeenCalled();
  });
});
