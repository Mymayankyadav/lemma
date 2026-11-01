import {describe,expect,it} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const migration=join(root,'supabase/migrations/20261101060000_history_owner_view.sql');
const connector=readFileSync(join(root,'supabase/functions/mcp/tools/control.ts'),'utf8');

describe('AUDIT #606: project history owner boundary',()=>{
 it('queries an owner-projected journal view and filters by authenticated owner before pagination',()=>{
  expect(connector).toMatch(/from\(['"]v_action_changes_owner['"]\)/);
  expect(connector).toMatch(/from\(['"]v_action_changes_owner['"]\)[\s\S]*?\.eq\(['"]user_id['"],\s*c\.userId\)[\s\S]*?\.range\(/);
  expect(connector).not.toMatch(/from\(['"]action_changes['"]\)\.select\(['"]action_no['"]\)/);
 });
 it('creates an invoker-security, explicitly owner-projected journal view without anonymous grants',()=>{
  expect(existsSync(migration)).toBe(true);
  const sql=readFileSync(migration,'utf8');
  expect(sql).toMatch(/create\s+view\s+public\.v_action_changes_owner\s+with\s*\(security_invoker\s*=\s*true\)/i);
  expect(sql).toMatch(/join\s+public\.actions\s+as\s+a\s+on\s+a\.no\s*=\s*c\.action_no/i);
  expect(sql).toMatch(/a\.user_id/i);
  expect(sql).toMatch(/revoke\s+all\s+on\s+public\.v_action_changes_owner\s+from\s+public\s*,\s*anon/i);
 });
});
