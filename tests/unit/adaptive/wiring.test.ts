import {describe,expect,it,vi} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {registeredResources} from '../../../supabase/functions/mcp/tools/registry';
import {prepareSettingsEdit} from '../../../supabase/functions/mcp/tools/settings-edit';
import {validateProjectEditPatch} from '../../../supabase/functions/mcp/tools/learning-edit';
import {endSession,saveProgress,startSession} from '../../../supabase/functions/mcp/tools/write';
import {setPrompt} from '../../../supabase/functions/mcp/tools/control';
import {studyRules} from '../../../supabase/functions/mcp/rules';
import {fakeContext,OWNER} from './fakedb';

const row=(flags:any={})=>({user_id:OWNER,version:1,flags,time_zone:'Asia/Calcutta',rollover_hour:4,connector_last_client:'claude',master_prompt:null});
const proj={id:'p1',slug:'topo',title:'Topology',status:'active',next_session_number:3,system:false,prompt:'',style:'socratic'};
const cpRow={id:'c1',project_id:'p1',code:'CP1',position:1,status:'in_progress',steps:['a','b'],current_step:1};
const sessionRow=(over:any={})=>({id:'s1',project_id:'p1',number:2,state:'open',checkpoint_id:'c1',started_at:'2026-11-17T04:00:00Z',last_activity_at:'2026-11-17T04:30:00Z',style:'socratic',...over});
const ctxWith=(flags:any,extra:any={})=>{const c=fakeContext({settings:[row(flags)],projects:[proj],checkpoints:[cpRow],sessions:[sessionRow()],proposals:[],...extra});return {...c,batch:[] as any[]}};

describe('resources listing (spec §2.8)',()=>{
  const db=(rows:any[])=>({from:()=>({select:()=>({eq:()=>({order:()=>({limit:()=>Promise.resolve({data:rows,error:null})})})})})});
  const good={resource:'tasks',mcp_ok:true,schema:{operations:['create'],fields:['title']}};
  it('lists every good resource and names the bad one, instead of failing the whole listing',async()=>{
    const out=JSON.parse(await registeredResources({userId:OWNER,db:db([good,{resource:'broken',mcp_ok:true,schema:{operations:['create'],fields:['a;b']}}]) } as any));
    expect(out.resources.map((r:any)=>r.resource)).toEqual(['tasks']);
    expect(out.skipped).toEqual([{resource:'broken',reason:'Malformed registered resource field or operation'}]);
  });
  it('lists camelCase fields (incident #1402) and has no "skipped" key when all rows are valid',async()=>{
    const out=JSON.parse(await registeredResources({userId:OWNER,db:db([{resource:'review_corrections',mcp_ok:true,schema:{operations:['correct'],fields:['reviewedAt','hintLevel']}},good])} as any));
    expect(out.resources).toHaveLength(2);expect(out).not.toHaveProperty('skipped');
  });
});
describe('settings: flags and capacity',()=>{
  const base=row();
  it('accepts known flags and a capacity week; refuses unknown flags and malformed weeks',()=>{
    expect(prepareSettingsEdit(base,{flags:{recheck_v2:true,time_block:true}}).flags).toEqual({recheck_v2:true,time_block:true});
    expect((prepareSettingsEdit(base,{capacity:{weekday_minutes:[240,240,240,240,240,120,120],review_share:0.25}}).capacity as any).weekday_minutes).toHaveLength(7);
    expect((prepareSettingsEdit(base,{capacity:{weekday_minutes:180}}).capacity as any).weekday_minutes).toBe(180);
    expect(()=>prepareSettingsEdit(base,{flags:{telepathy:true}})).toThrow(/not a known setting/);
    expect(()=>prepareSettingsEdit(base,{flags:{recheck_v2:'yes'}})).toThrow();
    expect(()=>prepareSettingsEdit(base,{capacity:{weekday_minutes:[1,2,3]}})).toThrow(/seven/);
    expect(()=>prepareSettingsEdit(base,{capacity:{weekday_minutes:2000}})).toThrow();
    expect(()=>prepareSettingsEdit(base,{capacity:{review_share:0.9}})).toThrow(/0.1 and 0.5/);
  });
  it('flags merge, so turning one on never switches the others off',()=>{
    const r=prepareSettingsEdit({...base,flags:{time_block:true}},{flags:{recheck_v2:true}});
    expect(r.flags).toEqual({time_block:true,recheck_v2:true});
  });
});
describe('project time facts',()=>{
  it('validates deadline_at, last_study_on, share_weight and booleans',()=>{
    expect(()=>validateProjectEditPatch({deadline_at:'2026-11-22T09:00:00+05:30',last_study_on:'2026-11-22',share_weight:2,time_confirmed:true,auto_prune_standard:false})).not.toThrow();
    expect(()=>validateProjectEditPatch({deadline_at:'2026-11-22'})).toThrow(/time zone/);
    expect(()=>validateProjectEditPatch({last_study_on:'22 Nov'})).toThrow(/YYYY-MM-DD/);
    expect(()=>validateProjectEditPatch({share_weight:0})).toThrow(/positive/);
    expect(()=>validateProjectEditPatch({time_confirmed:'yes'})).toThrow(/boolean/);
    expect(()=>validateProjectEditPatch({deadline_at:null,last_study_on:null,share_weight:null})).not.toThrow();
  });
});
describe('end_session and save_progress',()=>{
  const end={project:'topo',session:'S2',summary:'Covered continuity.',goal_met:'yes',recheck_prompt:'Recheck CP1: continuity'};
  it('flag off: the generic recheck prompt is still written (legacy)',async()=>{
    const c=ctxWith({});await endSession(c,end);
    expect(c.batch.some(op=>op.table==='checkpoints'&&op.values.recheck_prompt)).toBe(true);
  });
  it('recheck_v2: the generic prompt is ignored, so nothing can create a checkpoint recheck',async()=>{
    const c=ctxWith({recheck_v2:true});await endSession(c,end);
    expect(c.batch.some(op=>op.table==='checkpoints')).toBe(false);
    expect(c.batch.find(op=>op.table==='sessions').values.state).toBe('ended');
  });
  it('summary dates and pace are linted (I2) with a short notice naming the field',async()=>{
    const c=ctxWith({});await endSession(c,{...end,recheck_prompt:undefined,summary:'About 30 days behind plan; finish by 10 Nov.'});
    expect(c.notices?.[0]).toMatch(/^LINT summary has /);expect(c.notices?.[0]).toContain('(I2)');
  });
  it('set_prompt lints the text it saves, and still saves it (a warning, never a block)',async()=>{
    const c=ctxWith({});const out=await setPrompt(c,{scope:'all',text:'Track pace vs the 10-day plan (10-19 Nov 2026, ~4 h/day)',mode:'replace'});
    expect(out).toMatch(/^saved for all chats/);expect(c.notices?.[0]).toMatch(/^LINT master_prompt/);
    const clean=ctxWith({});await setPrompt(clean,{scope:'all',text:'Prove everything.',mode:'replace'});expect(clean.notices??[]).toEqual([]);
  });
  it('save_progress passes the evidence tags through to the transactional RPC untouched',async()=>{
    const c=ctxWith({recheck_v2:true});
    await saveProgress(c,{project:'topo',session:'S2',events:[{kind:'attempt',text:'x',outcome:'failed',concept:'compactness',level:'understand',recall:true}],
      diagnostics:[{kind:'pace',topic:'Pace',evidence:'about 30 days behind plan'}]});
    const rpc=c.batch.find(op=>op.op==='rpc');expect(rpc.args.p_payload.events[0]).toMatchObject({concept:'compactness',level:'understand',recall:true});
    expect(c.notices?.[0]).toMatch(/^LINT diagnostic/);
  });
  it('start_session marks the sessions it interrupts as abandoned only under recheck_v2',async()=>{
    const old=sessionRow({id:'s0',number:1,checkpoint_id:'other',last_activity_at:'2026-11-17T00:00:00Z'});
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-17T06:00:00Z'));
    try{
      const on=ctxWith({recheck_v2:true},{sessions:[old]});await startSession(on,{project:'topo',goal:'g',client:'claude'});
      expect(on.batch.find(op=>op.table==='sessions'&&op.op==='update')?.values.abandoned).toBe(true);
      const off=ctxWith({},{sessions:[old]});await startSession(off,{project:'topo',goal:'g',client:'claude'});
      expect(off.batch.find(op=>op.table==='sessions'&&op.op==='update')?.values).not.toHaveProperty('abandoned');
    }finally{vi.useRealTimers()}
  });
});
describe('rules text',()=>{
  it('is the old text with every flag off, and has no WARM and at most 10 lines with them on',()=>{
    expect(studyRules({})).toContain('Ask WARM questions first');
    for(const f of [{recheck_v2:true},{time_block:true,recheck_v2:true}]){
      const t=studyRules(f);expect(t).not.toMatch(/WARM/);expect(t.split('\n').length).toBeLessThanOrEqual(10);
      expect(t).toContain('recall:true');
    }
    expect(studyRules({time_block:true})).toContain('only from TIME');
  });
});
