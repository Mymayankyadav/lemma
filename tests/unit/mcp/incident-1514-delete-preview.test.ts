import {describe,expect,it,vi} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {remove} from '../../../supabase/functions/mcp/tools/control';
import {fakeContext} from '../adaptive/fakedb';

// Incident #1514: the delete preview loaded whole rows of every related table (source texts, page transcriptions, session events)
// to count what cascades, and the post-deploy selftest's delete ran out of Edge worker resources (HTTP 546).
const big='x'.repeat(20000);
const tables=():Record<string,any[]>=>({
 projects:[{id:'p1',slug:'topology-1',title:'Topology 1',subject_id:'s1',status:'active',system:false},{id:'p2',slug:'algebra-1',title:'Algebra 1',subject_id:'s1',status:'active',system:false}],subjects:[{id:'s1',name:'Math'}],
 sources:[{id:'src1',project_id:'p1',text:big},{id:'src2',project_id:'p2',text:big}],
 source_pages:[{id:1,source_id:'src1',text:big},{id:2,source_id:'src1',text:big},{id:3,source_id:'src2',text:big}],
 checkpoints:[{id:'c1',project_id:'p1'},{id:'c2',project_id:'p1'},{id:'c3',project_id:'p2'}],
 checkpoint_prereqs:[{checkpoint_id:'c2',prereq_id:'c1'},{checkpoint_id:'c3',prereq_id:'c1'},{checkpoint_id:'c3',prereq_id:'c3'}],
 checkpoint_concepts:[{checkpoint_id:'c1',concept_id:'k1'},{checkpoint_id:'c3',concept_id:'k2'}],
 sessions:[{id:'S1',project_id:'p1'},{id:'S2',project_id:'p2'}],session_events:[{id:1,session_id:'S1',body:big},{id:2,session_id:'S1',body:big},{id:3,session_id:'S2',body:big}],
 misconceptions:[{id:'m1',project_id:'p1'}],notes:[{id:'n1',project_id:'p1',front:big},{id:'n2',project_id:'p2'}],cards:[{id:'cd1',note_id:'n1'},{id:'cd2',note_id:'n2'}],
 card_comments:[{id:'cc1',note_id:'n1'}],reviews:[{id:'r1',card_id:'cd1'},{id:'r2',card_id:'cd2'}],proposals:[],diagnostics:[{id:'d1',project_id:'p2'}],
 concepts:[{id:'k1',subject_id:'s1'},{id:'k2',subject_id:'s1'}],concept_links:[{id:'l1',from_id:'k1',to_id:'k2'}],
});
const ctx=(t:Record<string,any[]>)=>{
 const c:any={...fakeContext(t,[],{project:true}),batch:[]},from=c.db.from,reads:[string,string][]=[];
 c.db={...c.db,from:(table:string)=>{const q=from(table),select=q.select;q.select=(cols?:string)=>{reads.push([table,cols??'*']);return select(cols);};return q;}};
 return {c,reads};
};

describe('incident #1514: delete preview counts the cascade without loading whole rows',()=>{
 it('reads each related table by its id and link columns only, never the texts',async()=>{
  const {c,reads}=ctx(tables());await remove(c,{target:'topology-1',confirm:false});
  const related=reads.filter(([t])=>t!=='projects'&&t!=='settings');
  expect(related.length).toBeGreaterThan(0);
  for(const [t,cols] of related){expect(cols,t).not.toBe('*');expect(cols,t).not.toMatch(/text|body|front|back/);}
  expect(Object.fromEntries(related)).toMatchObject({source_pages:'source_id',checkpoint_prereqs:'checkpoint_id,prereq_id',session_events:'session_id',cards:'id,note_id',concept_links:'from_id,to_id'});
 });
 it('counts exactly what cascades, through every link (unchanged behaviour)',async()=>{
  const {c}=ctx(tables());
  const text=await remove(c,{target:'topology-1',confirm:false});
  // p1: 1 source (2 pages), 2 checkpoints (c2→c1 and c3→c1 prerequisites, c1's concept link), 1 session (2 events), 1 misconception, 1 note (1 card, 1 comment, 1 review)
  expect(text).toBe('topology-1: 1 sources, 2 checkpoints, 1 sessions, 1 misconceptions, 1 notes, 2 source_pages, 2 checkpoint_prereqs, 1 checkpoint_concepts, 2 session_events, 1 cards, 1 card_comments, 1 reviews. Confirm before deleting.');
  expect(c.batch).toEqual([]);
  const done=await remove(c,{target:'topology-1',confirm:true});
  expect(done).toMatch(/^deleted topology-1 and 1 sources, 2 checkpoints/);expect(c.batch).toHaveLength(1);expect(c.batch[0]).toMatchObject({op:'delete',table:'projects'});
 });
});
