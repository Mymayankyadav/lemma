import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {sqlFindings,isRevokeOnNewTable,createdTables} from '../../../scripts/ci/migrations.mjs'

const NEW=`create table public.pending_commands(id uuid primary key);
alter table public.pending_commands enable row level security;
revoke insert,update,delete,truncate on public.pending_commands from anon,authenticated;`

describe('v2.7 a new table may revoke browser DML in its creating migration (#1126, #1145)',()=>{
 it('accepts the revoke AGENTS.md requires on a table created in the same migration',()=>{
  expect(sqlFindings(NEW)).toEqual([])
  expect(sqlFindings(`create table review_parameter_sets(id int);\nrevoke insert, update, delete, truncate on table public.review_parameter_sets from anon, authenticated;\nrevoke select on review_parameter_sets from anon;`)).toEqual([])
 })
 it('still rejects revokes on existing tables, schema-wide revokes, if-not-exists tables and truncate statements',()=>{
  expect(sqlFindings('revoke insert on public.tasks from authenticated;').join()).toMatch(/REVOKE/)
  expect(sqlFindings(NEW+'\nrevoke delete on public.pending_commands, public.tasks from authenticated;').join()).toMatch(/REVOKE/)
  expect(sqlFindings('create table if not exists public.tasks(id int);\nrevoke insert on public.tasks from authenticated;').join()).toMatch(/REVOKE/)
  expect(sqlFindings(NEW+'\nrevoke all on all tables in schema public from anon;').join()).toMatch(/REVOKE/)
  expect(sqlFindings(NEW+'\ntruncate public.pending_commands;').join()).toMatch(/TRUNCATE/)
  expect(sqlFindings(NEW+'\nrevoke usage on schema public from anon;').join()).toMatch(/REVOKE/)
 })
 it('parses created tables and the revoke shape',()=>{
  expect([...createdTables('create table public.a(x int); create table if not exists public.b(x int); create table "c"(x int)')]).toEqual(['a','c'])
  expect(isRevokeOnNewTable('revoke insert,update on public.a from anon',new Set(['a']))).toBe(true)
  expect(isRevokeOnNewTable('revoke execute on public.a from anon',new Set(['a']))).toBe(false)
 })
})
