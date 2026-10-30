import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../supabase/migrations/20261030102000_db4_v3_schema.sql', import.meta.url),
  'utf8',
)
const acceptance = readFileSync(
  new URL('../../../supabase/tests/db4_acceptance.sql', import.meta.url),
  'utf8',
)

describe('DB-4 v3 migration contract', () => {
  it('adds the schedule, source and Atlas columns without dropping data tables', () => {
    expect(migration).toMatch(/add column due_on date/)
    expect(migration).toMatch(/add column system boolean not null default false/)
    expect(migration).toMatch(/add column pinned boolean not null default false/)
    expect(migration).toMatch(/add column sha256 text/)
    expect(migration).toMatch(/add column level text not null default 'planet'/)
    expect(migration).toMatch(/add column parent_id uuid/)
    expect(migration).not.toMatch(/^\s*(?:truncate|drop table|drop schema)\b/im)
  })

  it('keeps source citations owner-scoped, journalled and undoable', () => {
    expect(migration).toContain('create table public.checkpoint_sources')
    expect(migration).toContain('foreign key(user_id,checkpoint_id)')
    expect(migration).toContain('foreign key(user_id,source_id)')
    expect(migration).toContain('create trigger lemma_log_change after insert or update or delete on public.checkpoint_sources')
    expect(migration).toContain('create trigger z_checkpoint_source_legacy after insert or update of source_id,pages')
    expect(migration).toContain("'''diagnostics'',''checkpoint_sources'']'")
    expect(acceptance).toContain('Cross-project source citation was accepted')
    expect(acceptance).toContain('Checkpoint source was not journalled')
  })

  it('preserves approvals, user data and live connector configuration', () => {
    expect(migration).toContain('create view public.v_plan_revisions')
    expect(migration).toContain('create function public.merge_subjects')
    expect(migration).toContain('create policy hide_system_projects')
    expect(migration).not.toMatch(/\b(?:connector_secret|functions\/v1\/mcp|approve_proposal)\b/i)
    expect(acceptance.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
