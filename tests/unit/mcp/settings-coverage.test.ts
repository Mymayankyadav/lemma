import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import FSRS from '../../../supabase/functions/_shared/fsrs.js';
import {ownerEditableSettingsFields,prepareSettingsEdit,settingsEditCommand} from
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
 it('refuses a misleading connector_last_client commit while preserving real audit source',()=>{
  // The underlying owner-editable registry classification conflicts with
  // mcp_commit's mandatory post-batch telemetry. Build should fail closed.
  for(const requested of ['claude','other',null]){
   expect(()=>settingsEditCommand(row,{connector_last_client:requested},
    row.user_id,version)).toThrow(/server-managed by mcp_commit/);
  }
  const sql=readFileSync('supabase/migrations/20261029190752_mcp_transactions.sql','utf8');
  expect(sql).toContain('connector_last_client=case when p_source');
  expect(sql).toContain('then p_source else connector_last_client end');
  // Other field edits still retain the real connector provenance from commitBatch.
  expect(settingsEditCommand(row,{max_interval_days:600},row.user_id,version).values)
   .toEqual({max_interval_days:600});
 });
 it('proves actual mcp_commit overwrites a mismatched owner-selected connector client',async()=>{
  // Execute the unchanged production SQL, not a mocked approximation of
  // mcp_commit's second UPDATE. This reproduces the outstanding #1197 bug.
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  const owner='11111111-1111-4111-8111-111111111111';
  try{
   await db.exec([
    'create role anon;create role authenticated;create role service_role;',
    'create table public.settings(user_id uuid primary key,version int not null default 3,new_per_day int,connector_last_client text,connector_last_seen_at timestamptz);',
    'create table public.actions(no bigint generated always as identity primary key,user_id uuid,txid bigint,source text,tool text,summary text);',
    'create table public.action_changes(action_no bigint,op text,table_name text,new jsonb);',
    'create table public.checkpoint_prereqs(user_id uuid,checkpoint_id uuid,prereq_id uuid);',
   ].join('\n'));
   await db.exec(readFileSync('supabase/migrations/20261029190752_mcp_transactions.sql','utf8'));
   await db.query('insert into public.settings(user_id,new_per_day) values ($1,$2)',[owner,20]);
   for(const requested of ['claude',null]){
    const commands=[{op:'update',table:'settings',where:{user_id:owner},
     values:{new_per_day:30,connector_last_client:requested}}];
    await db.query('select public.mcp_commit($1::uuid,$2::text,$3::text,$4::text,$5::jsonb) value',
     [owner,'edit','chatgpt','User settings edit',JSON.stringify(commands)]);
    const saved=(await db.query(
     'select new_per_day,connector_last_client from public.settings where user_id=$1',
     [owner])).rows[0];
    expect(saved.new_per_day).toBe(30);
    expect(saved.connector_last_client).toBe('chatgpt');
   }
   for(const requested of ['claude',null])
    expect(()=>settingsEditCommand(row,{
     new_per_day:30,connector_last_client:requested
    },row.user_id,version)).toThrow(/server-managed by mcp_commit/);
  }finally{await db.close()}
 });
 it('builds a safe owner-bound CAS command and refuses stale versions',()=>{
  expect(()=>settingsEditCommand(row,{focus_defaults:{focus_minutes:45}},
   row.user_id,2)).toThrow(/version conflict/i);
  const command=settingsEditCommand(row,{focus_defaults:{focus_minutes:45}},
   row.user_id,3);
  expect(command).toMatchObject({op:'update',table:'settings',
   where:{user_id:row.user_id},expected:{version:3}});
  expect(command.values.focus_defaults).toMatchObject({
   focus_minutes:45,future:{nested:{keep:true}}});
  expect(command.values).not.toHaveProperty('user_id');
  expect(()=>settingsEditCommand(row,{version:900},row.user_id)).toThrow();
  const handler=readFileSync('supabase/functions/mcp/tools/control.ts','utf8');
  expect(handler).toContain('settingsEditCommand(row,a.set,c.userId,a.expectedVersion)');
  const schema=readFileSync('supabase/functions/mcp/server.ts','utf8');
  expect(schema).toContain('expectedVersion:z.number().int().positive().optional()');
 });
});
