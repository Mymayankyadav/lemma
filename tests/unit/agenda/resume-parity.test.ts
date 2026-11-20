import {expect,it,vi} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {packet} from '../../../supabase/functions/mcp/packet';
import {readAdaptive} from '../../../supabase/functions/mcp/adaptive';
import {readAgenda,agendaQueue} from '../../../supabase/functions/mcp/agenda';
import {fakeContext,tablesFrom} from '../adaptive/fakedb';
import {rowsFor} from '../adaptive/rows';

it('no-argument resume, MCP queue and the browser read share the same released owner decision with either legacy flag state',async()=>{
  const asOf='2026-11-20T12:00:00.000Z',end='2026-11-20T13:00:00.000Z';
  for(const time_block of [false,true])for(const preference of [null,'legacy','new']){
    const rows=rowsFor([],{flags:{time_block}});rows.settings.scheduling_algorithm=preference;
    const c=fakeContext(tablesFrom(rows));
    const host={asOf,watermark:'frozen',rows:{settings:rows.settings,projects:[],concepts:[],checkpoints:[],cpConcepts:[],sessions:[]},
      calendar:{status:'ok',asOf,watermark:'frozen',horizonEnd:end,fixed:[],availability:[{id:'window',revision:1,startsAt:asOf,endsAt:end}]},
      tasks:[{id:'task',title:'One owner action',project_id:null,estimate_minutes:5,priority:'normal',deadline:end}]};
    c.db.rpc=vi.fn(async(name:string)=>({data:name==='lemma_plan_released'?true:name==='lemma_agenda_snapshot'?host:null,error:null}));
    const browser=(await readAgenda(c,undefined,false)).agenda!;
    expect(browser.decision.requested).toBe(preference==='legacy'?'legacy':'new');
    const expected=agendaQueue(browser),queue=await readAdaptive(c,{what:'queue'}),resume=await packet(c,{});
    expect(queue).toBe(expected);expect(resume).toContain(expected);
    expect(resume).toContain('One owner action');
    expect(resume).not.toMatch(/QUEUE \d+m review/);
  }
});

it('no-argument resume retains the existing project list and queue when the release is unavailable',async()=>{
  const rows=rowsFor([],{flags:{time_block:true}}),c=fakeContext(tablesFrom(rows));
  const text=await packet(c,{});
  expect(text).toContain('LEMMA projects. Ask which one');expect(text).not.toContain('Planning · New');
  expect(text).toMatch(/QUEUE /);
});

it('counts unavailable shadow reads with latency and keeps the held release out of the learner response',async()=>{
  const c=fakeContext(tablesFrom(rowsFor([])));
  c.db.rpc=vi.fn(async(name:string)=>name==='lemma_plan_released'
    ? {data:false,error:null}
    : {data:null,error:{message:'private fixture details'}});
  const info=vi.spyOn(console,'info').mockImplementation(()=>{});
  try{
    expect(await readAgenda(c,null,true)).toEqual({released:false,agenda:null});
    expect(c.db.rpc).toHaveBeenCalledTimes(2);
    const [event,payload]=info.mock.calls[0];
    expect(event).toBe('atlas-agenda');
    expect(JSON.parse(payload)).toMatchObject({mode:'shadow',readMs:expect.any(Number),kind:'unavailable',hardViolations:0});
    expect(payload).not.toContain('private fixture details');
  }finally{info.mockRestore();}
});
