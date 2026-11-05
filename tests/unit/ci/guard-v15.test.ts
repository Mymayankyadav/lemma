import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
// @ts-expect-error plain ESM script
import {stripSql,functionNames,sqlFindings,declaredReplacements,addedSql,migrationFindings,existingFunctionNames} from '../../../scripts/ci/migrations.mjs'
// @ts-expect-error plain ESM script
import {conflictText,overlap,stateOf,GATE} from '../../../scripts/ci/conflicts.mjs'
// @ts-expect-error plain ESM script
import {shouldSkip,sweptRuns,WINDOW_MIN} from '../../../scripts/ci/sweep-throttle.mjs'
// @ts-expect-error plain ESM script
import {isStale} from '../../../scripts/ci/sweep.mjs'
// @ts-expect-error plain ESM script
import {evaluateScope} from '../../../scripts/ci/scope.mjs'
// @ts-expect-error plain ESM script
import {marker} from '../../../scripts/ci/feedback.mjs'

const patchOf=(sql:string)=>'@@ -0,0 +1 @@\n'+sql.split('\n').map((l)=>'+'+l).join('\n')
const mig=(sql:string,over={})=>({filename:'supabase/migrations/20261106000000_v6_study.sql',status:'added',patch:patchOf(sql),...over})

describe('R4 additive-only migrations',()=>{
 it('allows creating tables, policies, indexes, grants and NEW functions whose bodies delete or update rows',()=>{
  const sql=`create table public.study_entries(id uuid primary key, user_id uuid not null references auth.users on delete cascade, type text);
alter table public.study_entries enable row level security;
create policy own on public.study_entries for all using (user_id = auth.uid());
create index study_entries_user on public.study_entries(user_id);
grant select on public.study_entries to authenticated;
insert into public.study_entries(id,user_id) select gen_random_uuid(), id from auth.users where false;
create or replace function public.study_command(p jsonb) returns jsonb language plpgsql as $$
begin delete from public.study_entries where id = (p->>'id')::uuid; update public.study_entries set type = 'x'; return p; end $$;
-- a comment that says drop table is fine
comment on table public.study_entries is 'drop nothing';`
  expect(sqlFindings(sql,{existing:new Set(['review_items'])})).toEqual([])
 })
 it('flags drop, truncate, rename, type change, delete, update, revoke and alter policy outside bodies',()=>{
  const bad=['drop table public.cards','truncate public.cards','alter table public.cards rename to old_cards','alter table public.cards alter column due type date',
   'alter type public.card_state add value \'x\'','delete from public.cards','update public.cards set due = now()','revoke select on public.cards from authenticated',
   'alter policy own on public.cards using (true)','alter table public.cards drop column due']
  for(const s of bad) expect(sqlFindings(s+';'),s).toHaveLength(1)
 })
 it('replacing an EXISTING function needs the exact reviewed-replacement line; new functions do not',()=>{
  const sql='create or replace function public.review_items(p int) returns int language sql as $$ select 1 $$;'
  const existing=new Set(['review_items'])
  expect(sqlFindings(sql,{existing})[0]).toContain('replaces existing function `review_items`')
  const ok=declaredReplacements('Agent: lemma-1 · Item: N3\nReplaces function: public.review_items (reviewer verified signature and behaviour)')
  expect(sqlFindings(sql,{existing,replacesOk:ok})).toEqual([])
  expect(declaredReplacements('Replaces function: review_items')).toEqual(new Set())
 })
 it('rejects editing, renaming or deleting an existing migration, and oversized new ones',()=>{
  const f=migrationFindings([
   {filename:'supabase/migrations/20261031012600_st5_paged_reads.sql',status:'modified',patch:'@@\n+x'},
   {filename:'supabase/migrations/20261102105000_a.sql',previous_filename:'supabase/migrations/20261102052000_a.sql',status:'renamed'},
   {filename:'supabase/migrations/20261101000000_b.sql',status:'removed'},
   {filename:'supabase/migrations/20261106000000_big.sql',status:'added'},
   {filename:'src/a.ts',status:'modified',patch:'@@\n+drop table x;'},
  ])
  expect(f).toHaveLength(4)
  expect(f[0]).toContain('existing migration (modified)')
  expect(f[1]).toContain('20261102052000_a.sql → supabase/migrations/20261102105000_a.sql')
  expect(f[3]).toContain('too large to inspect')
 })
 it('strips comments, dollar bodies and string literals; reads added lines only; finds base functions',()=>{
  expect(stripSql("select 'drop table x' -- drop\n/* drop */ $f$ drop $f$")).not.toMatch(/drop/i)
  expect([...functionNames('create function public.a() returns int as $$select 1$$; create or replace function b (x int)')]).toEqual(['a','b'])
  expect(addedSql('@@\n+a\n-b\n c\n+d')).toBe('a\nd')
  const names=existingFunctionNames()
  expect(names.has('review_items')).toBe(true)
  expect(names.has('undo_action')).toBe(true)
 })
 it('scope applies it to agent PRs only (rules: and CI reverts are exempt)',()=>{
  const NEXT='# NEXT\n\n## N10 Study tables\nDone = x\nScope: a\nNot: b\n'
  const ctx=(over:any)=>({title:'N10 study tables',body:'Agent: lemma-2 · Item: N10',files:[mig('drop table public.cards;')],baseNext:NEXT,headNext:NEXT,openPrs:[],
   protectedCfg:{paths:['AGENTS.md','.github/**'],testGlobs:[]},existingFunctions:new Set(['review_items']),now:new Date('2026-11-06T00:00:00Z'),...over})
  const r=evaluateScope(ctx({}))
  expect(r.failures.map((f:any)=>f.rule)).toEqual(['MIGRATION-ADDITIVE'])
  expect(r.failures[0].msg).toContain('To comply:')
  expect(evaluateScope(ctx({files:[mig('create table public.study_entries(id uuid primary key);')]})).failures).toEqual([])
  expect(evaluateScope(ctx({title:'rules: owner migration',body:'Agent: owner-setup · Item: rules'})).failures).toEqual([])
 })
})

describe('R3 merge-conflict feedback',()=>{
 it('reads GitHub mergeability',()=>{
  expect(stateOf({mergeable:false})).toBe('conflict')
  expect(stateOf({mergeable:null,mergeable_state:'dirty'})).toBe('conflict')
  expect(stateOf({mergeable:true,mergeable_state:'clean'})).toBe('clean')
  expect(stateOf({mergeable:null})).toBe('unknown')
 })
 it('lists only files both sides changed, and says how to comply',()=>{
  expect(overlap(['src/flags.ts','CURRENT.md','src/a.ts'],['CURRENT.md','src/flags.ts','android/x'])).toEqual(['CURRENT.md','src/flags.ts'])
  const t=conflictText({sha:'0123456789',files:['CURRENT.md','src/flags.ts'],conflict:true})
  expect(t.startsWith(marker(GATE))).toBe(true)
  expect(t).toContain('### merge-conflict: FAILED on `0123456`')
  expect(t).toContain('`CURRENT.md`, `src/flags.ts`')
  expect(t).toContain('fast-gate cannot run until this is resolved. To comply: on your branch, rewrite each listed file')
  expect(conflictText({sha:'abc',conflict:false})).toContain('merge-conflict: passes')
  expect(conflictText({sha:'abc',files:['a'],conflict:true,base:'release'})).toContain('conflicts with `release` in: `a`')
 })
})

describe('R2 sweep cadence within the token budget',()=>{
 const now=Date.parse('2026-11-06T10:00:00Z')
 const run=(id:number,minAgo:number,secs=60,status='completed')=>({id,status,created_at:new Date(now-minAgo*60e3).toISOString(),run_started_at:new Date(now-minAgo*60e3).toISOString(),updated_at:new Date(now-minAgo*60e3+secs*1000).toISOString()})
 it('never skips scheduled or manual sweeps',()=>{
  expect(shouldSkip({event:'schedule',runs:[run(1,1)],now,selfId:9})).toBe(false)
  expect(shouldSkip({event:'workflow_dispatch',runs:[run(1,1)],now,selfId:9})).toBe(false)
 })
 it('skips an event sweep when another real sweep started inside the window',()=>{
  expect(WINDOW_MIN).toEqual({push:3,issue_comment:10,workflow_run:10})
  expect(shouldSkip({event:'issue_comment',runs:[run(1,4)],now,selfId:9})).toBe(true)
  expect(shouldSkip({event:'issue_comment',runs:[run(1,11)],now,selfId:9})).toBe(false)
  expect(shouldSkip({event:'push',runs:[run(1,4)],now,selfId:9})).toBe(false)
  expect(shouldSkip({event:'workflow_run',runs:[run(1,2,0,'in_progress')],now,selfId:9})).toBe(true)
  expect(shouldSkip({event:'issue_comment',runs:[run(9,1)],now,selfId:9})).toBe(false)
 })
 it('throttled runs do not count as sweeps',()=>{
  expect(sweptRuns([run(1,2,12),run(2,3,80)]).map((r:any)=>r.id)).toEqual([2])
  expect(shouldSkip({event:'issue_comment',runs:[run(1,2,12)],now,selfId:9})).toBe(false)
 })
 it('light sweeps refresh metrics only when they are 30+ minutes old',()=>{
  expect(isStale(undefined,now,30)).toBe(true)
  expect(isStale(new Date(now-31*60e3).toISOString(),now,30)).toBe(true)
  expect(isStale(new Date(now-5*60e3).toISOString(),now,30)).toBe(false)
 })
 it('the workflow runs on events, throttles, and never runs PR code',()=>{
  const y=readFileSync('.github/workflows/sweep.yml','utf8')
  for(const e of ['schedule:','workflow_dispatch:','push:','issue_comment:','workflow_run:',"workflows: ['PR gate']"]) expect(y).toContain(e)
  expect(y).not.toContain('pull_request')
  expect(y).toContain('ref: ${{ github.event.repository.default_branch }}')
  expect(y).toContain('node scripts/ci/sweep-throttle.mjs')
  expect(y).toContain("steps.throttle.outputs.skip != 'true'")
  expect(y).not.toContain('CI_BOT_TOKEN')
 })
})

describe('R1 new SQL tests run without a workflow change',()=>{
 it('both SQL jobs run every tests/mcp/sql/*.mjs',()=>{
  for(const f of ['.github/workflows/pr-gate.yml','.github/workflows/ci.yml']){
   const y=readFileSync(f,'utf8')
   expect(y,f).toContain("for f in $(printf '%s\\n' tests/mcp/sql/*.mjs | sort); do")
   expect(y,f).toContain('shopt -s nullglob')
  }
 })
})
