import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'

const source=readFileSync('tests/mcp/notif1b-stress.mjs','utf8')

describe('FIX #679 NOTIF X failed-first-attempt diagnostics stay bounded',()=>{
 it('does not execute expensive EXPLAIN ANALYZE on 30k-card CTEs after a budget miss',()=>{
  const failed=source.indexOf('if(elapsed>=150)')
  const gate=source.indexOf('assert.ok(elapsed<150')
  expect(failed).toBeGreaterThan(0)
  expect(gate).toBeGreaterThan(failed)
  const diagnostic=source.slice(failed,gate)
  // PGlite cannot reliably interrupt a WASM-side EXPLAIN ANALYZE with
  // statement_timeout; the prior loop cancelled the whole SQL CI job.
  expect(diagnostic).not.toMatch(/explain\s*\(\s*analyze\b/i)
  expect(diagnostic).toMatch(/explain\s*\(\s*verbose\s*,\s*costs\s*\)/i)
  expect(source).toContain('assert.ok(elapsed<150')
  expect(source).toContain('const elapsed=performance.now()-start')
 })
})
