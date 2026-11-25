import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {get} from '../../../supabase/functions/mcp/tools/read';
import {examFixture, examProject, now, other, owner, sitting} from './exam-fixture';

vi.mock('../../../supabase/functions/mcp/deps.ts', () => ({createClient:vi.fn()}));

beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date(now));});
afterEach(() => vi.useRealTimers());

describe('get(what=exam)', () => {
  it('routes before the registered read and renders the owner exam by project or ID', async () => {
    const {context,reads,rpcCalls}=examFixture({
      exam_attempts:[{id:'a',sitting_id:'sitting',user_id:owner,voided_at:null,row_key:'proj',
        outcome:'incorrect',independence:'independent',hint_level:0,novelty:'novel',occurred_at:now}],
      card_ideas:[
        {id:'i',user_id:owner,sitting_id:'sitting',status:'saved'},
        {id:'j',user_id:other,sitting_id:'sitting',status:'saved'},
        {id:'k',user_id:owner,sitting_id:'sitting',status:'dismissed'},
      ],
    }, {rpc:()=>({data:[{concept:'eigenvalues',occurred_at:now,outcome:'pass',hint_level:0,novelty:'novel'}],error:null})});
    const output=await get(context,{what:'exam',project:'linear-algebra'});
    expect(output).toMatch(/^EXAM Linear algebra final \[linear-algebra\]/);
    expect(output).toMatch(/diag · 20 · secure/);
    expect(output).toMatch(/proj · 15 · gap/);
    expect(output).toContain('CARD IDEAS 1 open · BOOKMARK CP4 step 2/3 S7');
    expect(context.next).toContain('log each scored answer with save_progress and exam_attempts');
    expect(reads.some(read=>read.table==='lemma_command_resources')).toBe(false);
    expect(rpcCalls).toEqual([['exam_row_evidence',{p_owner:owner,p_sitting:'sitting',p_as_of:now}]]);
    expect(await get(context,{what:'exam',id:'sitting'})).toBe(output);
  });

  it('lists planned, active and paused owner sittings, excluding hidden projects', async () => {
    const system={...examProject,id:'fixture',slug:'fixture',system:true};
    const archived={...examProject,id:'archived',slug:'archived',status:'archived'};
    const foreign={...examProject,user_id:other};
    const {context}=examFixture({exam_sittings:[
      sitting(), sitting({id:'plan',title:'Planning',status:'planned'}),
      sitting({id:'pause',title:'Paused sitting',status:'paused'}),
      sitting({id:'finished',title:'Finished title',status:'finished'}),
      sitting({id:'cancelled',title:'Cancelled title',status:'cancelled'}),
      sitting({id:'system',title:'Fixture title'},system), sitting({id:'arch',title:'Archived title'},archived),
      sitting({id:'cross',title:'Foreign title'},foreign),
    ]});
    const output=await get(context,{what:'exam'});
    expect(output).toMatch(/^EXAMS\n/);
    for(const name of ['Linear algebra final','Planning','Paused sitting']) expect(output).toContain(name);
    for(const name of ['Foreign title','Fixture title','Archived title','Finished title','Cancelled title']) expect(output).not.toContain(name);
    await expect(get(context,{what:'exam',id:'cross'})).rejects.toThrow(/not found/i);
    await expect(get(context,{what:'exam',id:'missing'})).rejects.toThrow(/not found/i);
    await expect(get(context,{what:'exam',project:'missing'})).rejects.toThrow(/No unique project/);
    expect(await get(examFixture({exam_sittings:[]}).context,{what:'exam'})).toContain('No planned, active or paused sittings.');
  });

  it('keeps the action and coverage within 3,000 characters and bounds evidence fetches', async () => {
    const blueprint=Array.from({length:60},(_,index)=>({key:`row-${index}`,title:'Scored task family '.repeat(7),marks:10,concepts:['eigenvalues']}));
    const ledger=Object.fromEntries(blueprint.map(row=>[row.key,{disposition:'defer',reason:'Enough detail to justify the deferral. '.repeat(5),reopen:'Open it if more time is available.'}]));
    const {context,reads,rpcCalls}=examFixture({
      exam_sittings:[sitting({blueprint,ledger,total_marks:600})],
    },{rpc:()=>({data:[],error:null})});
    const output=await get(context,{what:'exam',id:'sitting'});
    expect(output.length).toBeLessThanOrEqual(3000);
    expect(output).toContain('more rows');
    expect(output).toContain('COVERAGE accounted 600/600');
    expect(output).toContain('\nNEXT ');
    expect(rpcCalls).toEqual([['exam_row_evidence',{p_owner:owner,p_sitting:'sitting',p_as_of:now}]]);
    expect(reads.find(read=>read.table==='exam_attempts')).toMatchObject({limit:500,filters:expect.arrayContaining([
      ['eq','user_id',owner],['eq','sitting_id','sitting'],['is','voided_at',null],['lte','occurred_at',now],
    ])});
  });
});
