import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'

describe('v2.5 out-of-order migrations deploy (#1016)',()=>{
 it('the deploy applies every unapplied migration, including ones older than the latest applied',()=>{
  const y=readFileSync('.github/workflows/supabase.yml','utf8')
  expect(y).toMatch(/^\s*supabase db push --linked --include-all\s*$/m)
  expect(y).not.toMatch(/^\s*supabase db push\s*$/m)
 })
 it('AGENTS.md tells agents order does not matter and never to rename a migration',()=>{
  const md=readFileSync('AGENTS.md','utf8')
  expect(md).toContain('Migration timestamps need not be in merge order')
  expect(md).toContain('Never rename a migration to change its order.')
 })
})
