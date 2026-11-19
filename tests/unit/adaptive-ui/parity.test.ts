import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
const live=vi.hoisted(()=>({db:null as any}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>live.db}));
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import {readAdaptiveData} from '../../../src/data/adaptive/live';
import {assemble} from '../../../supabase/functions/_shared/adaptive/facts';
import {loadRows,resumeBlocks,flagLines} from '../../../supabase/functions/mcp/adaptive';
import {fakeContext,tablesFrom,OWNER} from '../adaptive/fakedb';
import {settingsRow,checkpointRow} from '../../../src/data/live/helpers';
import {invalidateOwnerChanges} from '../../../src/data/sync/keys';
const now=new Date('2026-11-17T12:00:00Z');
beforeEach(()=>localStorage.clear());
describe('N171 browser/MCP parity on local demo rows',()=>{
 it('loads identical TIME, QUEUE and FLAGS without writes, including logged focus, overrides and busy time',async()=>{
  const demo=new DemoAdapter({fixture:structuredClone(demoSeedFixture)}),data=await demo.getAdaptiveData(),r=data.rows;
  r.settings.flags={time_block:true,recheck_v2:true,scheduler_v2:true};r.settings.capacity={weekday_minutes:240};
  delete r.settings.planning;   // the demo's Atlas v3 planning window (atlasV3 on) would cap today's capacity below the override this test checks
  for(const p of r.projects)Object.assign(p,{last_study_on:'2026-11-22',time_confirmed:true});
  r.intervals=[{kind:'focus',started_at:'2026-11-17T11:40:00Z',ended_at:null}];
  r.overrides=[{on_date:'2026-11-17',minutes:180}];
  r.busy=[{kind:'busy',status:'planned',starts_at:'2026-11-17T10:00:00Z',ends_at:'2026-11-17T11:00:00Z',time_zone:'UTC'}];
  const concept=r.cpConcepts[0].concept_id;
  r.evidence=[{id:1,occurred_at:'2026-11-15T12:00:00Z',session_id:null,concept_id:concept,level:'use',role:'primary',outcome:'fail',hint_level:0,novelty:'novel',kind:'attempt',voided_at:null}];
  const writes:any[]=[],tables=tablesFrom(r,{v_due_cards:[{card_id:'card-1'}],cards:[{id:'card-1',note_id:'note-1'}],notes:[{id:'note-1',project_id:r.projects[0].id}],
   rechecks:[{class_id:concept,level:'use',seq:1,state:'open',due:'2026-11-17',prompt:'Demo prompt'}]});
  const c=fakeContext(tables,writes);live.db={...c.db,auth:{getUser:async()=>({data:{user:{id:OWNER}},error:null})}};
  const app=await readAdaptiveData(now),browser=assemble(app.rows,now),server=assemble(await loadRows(c,now),now);
  expect(browser.projects).toEqual(server.projects);expect(browser.usedToday).toBe(20);expect(browser.capacityToday.minutes).toBe(180);
  expect(browser.queue).toEqual(server.queue);expect(browser.rechecks).toEqual(server.rechecks);expect(JSON.stringify(browser.prune)).toBe(JSON.stringify(server.prune));
  expect(resumeBlocks(browser,app.rows,undefined,'',{})).toBe(resumeBlocks(server,app.rows,undefined,'',{}));
  expect(flagLines(browser)).toEqual(flagLines(server));expect(app.rechecks[0].prompt).toBe('Demo prompt');expect(writes).toEqual([]);
 });
 it('exposes per-user flags and stored checkpoint metadata through the existing adapter mapping',()=>{
  expect(settingsRow({flags:{scheduler_v2:true}}).flags).toEqual({scheduler_v2:true});
  expect(checkpointRow({id:'demo',code:'CP1',status:'not_started',steps:[],plan_state:'skipped',deferred_reason:'prune',deferred_at:'2026-11-16',step_meta:[{state:'deferred'}]}))
   .toMatchObject({planState:'skipped',deferredReason:'prune',deferredAt:'2026-11-16',stepMeta:[{state:'deferred'}]});
 });
 it('invalidates after fact edits, connector writes and undo; unknown derived resources reset queries',async()=>{
  const invalidateQueries=vi.fn(async()=>{}),client={invalidateQueries} as any;
  await invalidateOwnerChanges(client,['checkpoints','study_intervals']);expect(invalidateQueries).toHaveBeenCalledWith({queryKey:['adaptive']});
  invalidateQueries.mockClear();await invalidateOwnerChanges(client,['rechecks']);expect(invalidateQueries).toHaveBeenCalledWith();
 });
});
