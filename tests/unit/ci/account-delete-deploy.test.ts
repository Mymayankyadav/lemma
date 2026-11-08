import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,expect,it} from 'vitest'

// Bug #1219: a reviewed account-deletion handler is unusable unless the
// existing production release actually deploys it.
const workflow=readFileSync(resolve(process.cwd(),'.github/workflows/supabase.yml'),'utf8')
const step=(name:string)=>{
 const start=workflow.indexOf('      - name: '+name+'\n')
 if(start<0)throw Error('Missing release step: '+name)
 const next=workflow.indexOf('\n      - name: ',start+1)
 return workflow.slice(start,next<0?undefined:next)
}
describe('bug #1219 account-delete release path',()=>{
 it('only deploys after credentials and the reviewed function are present',()=>{
  const deployment=step('Deploy account deletion function')
  expect(deployment).toContain("if: steps.credentials.outputs.ready == 'true'")
  expect(deployment).toContain('if [[ -f supabase/functions/account-delete/index.ts ]]; then')
  expect(deployment).toContain('supabase functions deploy account-delete --no-verify-jwt')
  expect(deployment).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
 })
 it('keeps migrations before deployment and the existing MCP smoke after',()=>{
  const migration=workflow.indexOf('      - name: Apply migrations\n')
  const deletion=workflow.indexOf('      - name: Deploy account deletion function\n')
  const smoke=workflow.indexOf('      - name: Verify deployed MCP endpoint\n')
  expect(migration).toBeGreaterThan(-1)
  expect(deletion).toBeGreaterThan(migration)
  expect(smoke).toBeGreaterThan(deletion)
  expect(step('Deploy MCP')).toContain('supabase functions deploy mcp --no-verify-jwt')
  expect(step('Verify deployed MCP endpoint')).toContain('node tests/mcp/smoke.mjs')
 })
})
