import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {edit} from '../../../supabase/functions/mcp/tools/control';
import type {Context} from '../../../supabase/functions/mcp/db';
import FSRS from '../../../supabase/functions/_shared/fsrs.js';
import {ownerEditableSettingsFields,prepareSettingsEdit} from
 '../../../supabase/functions/mcp/tools/settings-edit';

const registry=JSON.parse(readFileSync('docs/v6/capability-registry/settings.json','utf8'));
const wanted=Object.entries(registry.columns)
 .filter(([,v])=>v.classification==='owner-editable').map(([k])=>k).sort();
const version=3;
const row={user_id:'11111111-1111-4111-8111-111111111111',version,
 focus_defaults:{mode:'pomodoro',future:{nested:{keep:true}},focus_minutes:25},
 planning:{window_start:'08:00',new_section:{future:'retained'}},
 review_budget:{cards:20},attention:{drift_prompt:false},
 ui:{colors:{main:'blue',future:{x:1}}},
 notify:{email:{digest:false},future:{doNotDrop:true}},
};
describe('N87 MCP owner settings coverage and optimistic edits',()=>{
 it('enumerates exactly the owner-editable capability-registry fields',()=>{
  expect([...ownerEditableSettingsFields].sort()).toEqual(wanted);
  expect(wanted).not.toContain('connector_secret');
  expect(wanted).not.toContain('fsrs_tuned_at');
  expect(wanted).not.toContain('version');
 });
 it('accepts all registered editable settings families without owner-controlled metadata',()=>{
  const accepted:Record<string,unknown>={
   desired_retention:.91,new_per_day:32,reviews_per_day:110,
   learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,
   max_interval_days:1000,fuzz:true,load_balance:false,
   learn_ahead_minutes:25,fsrs_weights:[...FSRS.DEFAULT_W],
   macros:'\\newcommand{\\N}{\\mathbb{N}}',default_style:'socratic',
   tutor_rules:null,mix_decks:true,preferred_chat:'chatgpt',
   connector_last_client:'other',time_zone:'Asia/Kolkata',master_prompt:'study',
   ui:{layout:'dense'},notify:{email:{digest:true}},
   week_start:1,clock_24h:true,focus_defaults:{mode:'flowtime'},
   planning:{gap_minutes:15},review_budget:{minutes:30},
   attention:{urge_prompt:true},
  };
  expect(Object.keys(accepted).sort()).toEqual(wanted);
  const result=prepareSettingsEdit(row,accepted,version);
  expect(result.fsrs_weights).toEqual(FSRS.DEFAULT_W);
  expect(result.focus_defaults).toMatchObject({mode:'flowtime',focus_minutes:25,
   future:{nested:{keep:true}}});
  expect(result.planning).toMatchObject({gap_minutes:15,new_section:{future:'retained'}});
  expect(result.notify).toMatchObject({email:{digest:true},
   future:{doNotDrop:true}});
  expect(result).not.toHaveProperty('user_id');
 });
 it('supports explicit FSRS reset, rejects invalid length and nonalgorithm weights',()=>{
  expect(prepareSettingsEdit(row,{fsrs_weights:'default'}).fsrs_weights).toBeNull();
  expect(prepareSettingsEdit(row,{fsrs_weights:null}).fsrs_weights).toBeNull();
  expect(()=>prepareSettingsEdit(row,{fsrs_weights:Array(17).fill(1)})).toThrow();
  expect(()=>prepareSettingsEdit(row,{fsrs_weights:Array(21).fill(10000)})).toThrow();
  expect(()=>prepareSettingsEdit(row,{fsrs_weights:Array(21).fill(NaN)})).toThrow();
 });
 it('preserves unknown deeply nested JSON while enforcing N39 typed constraints',()=>{
  const result=prepareSettingsEdit(row,{ui:{colors:{future:{y:2}}},
   focus_defaults:{focus_minutes:60},review_budget:{cards:100}});
  expect((result.ui as any).colors.future).toEqual({x:1,y:2});
  expect((result.focus_defaults as any).future.nested.keep).toBe(true);
  for(const payload of [
   {focus_defaults:{focus_minutes:0}},{focus_defaults:{mode:'unknown'}},
   {focus_defaults:{flowtime_break_ratio:2}},{planning:{window_start:'24:30'}},
   {planning:{daily_intention:'true'}},{review_budget:{cards:-1}},
   {attention:{drift_prompt:1}},{week_start:7},{clock_24h:'true'},
   {new_per_day:300},{time_zone:'Mars/Olympus'},
   {ui:['not-an-object']},{notify:{constructor:{evil:true}}},
   {user_id:'foreign'}, {connector_secret:'forged'},{updated_source:'forged'}
  ])expect(()=>prepareSettingsEdit(row,payload)).toThrow();
 });
 it('checks versions before batching and repeats the compare-and-swap in mcp_commit',async()=>{
  const commands:any[]=[];
  const scopedRow={...row};
  const c={userId:row.user_id,batch:commands,db:{
   from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:scopedRow,error:null})})})}),
  }} as unknown as Context;
  await expect(edit(c,{target:'settings',set:{focus_defaults:{focus_minutes:45}},
   expectedVersion:2})).rejects.toThrow(/version conflict/i);
  expect(commands).toHaveLength(0);
  await edit(c,{target:'settings',set:{focus_defaults:{focus_minutes:45}},
   expectedVersion:3});
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({op:'update',table:'settings',
   where:{user_id:row.user_id},expected:{version:3}});
  expect(commands[0].values.focus_defaults).toMatchObject({
   focus_minutes:45,future:{nested:{keep:true}}});
  expect(commands[0].values).not.toHaveProperty('user_id');
  await expect(edit(c,{target:'settings',set:{version:900}})).rejects.toThrow();
 });
});
